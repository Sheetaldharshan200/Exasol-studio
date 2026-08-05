/**
 * Engine-agnostic event mapping for the Exa engine bridge (exa-agent-v2,
 * task 1.3).
 *
 * The engine (opencode) streams its own event shapes over the SDK. The panel
 * must not depend on those shapes — if we ever swap engines, only this mapper
 * changes. So the bridge translates raw engine events into `StudioAgentEvent`,
 * a small stable union the UI renders. Pure and unit-tested; the live SDK
 * subscription that feeds it is thin I/O beside this.
 */

export type StudioAgentEvent =
  // v1.18 shapes (verified): the engine streams SNAPSHOTS of message parts,
  // not deltas — the UI upserts by (messageId, partId/callId).
  | { type: "message.upsert"; sessionId: string; messageId: string; role: "user" | "assistant" }
  | {
      type: "part.snapshot";
      sessionId: string;
      messageId: string;
      partId: string;
      part: { kind: "text"; text: string } | { kind: "tool"; callId: string; name: string; status: string };
    }
  // Legacy/fallback shapes kept for other engine versions.
  | { type: "message.delta"; sessionId: string; text: string }
  | { type: "message.done"; sessionId: string }
  | { type: "tool.start"; sessionId: string; callId: string; name: string; args: unknown }
  | { type: "tool.result"; sessionId: string; callId: string; ok: boolean; result: unknown }
  | { type: "permission.request"; sessionId: string; requestId: string; title: string; detail?: string }
  | { type: "error"; sessionId: string; message: string }
  | { type: "session.idle"; sessionId: string };

/** A loosely-typed raw engine event (SDK shapes vary across versions). */
export type RawEngineEvent = { type?: string; [k: string]: unknown };

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const pick = (o: Record<string, unknown>, keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

/**
 * Map one raw engine event to a Studio event, or null when it is noise we do
 * not surface. Defensive about field names (engine minor versions rename
 * things) — reads a small set of aliases per field rather than one exact key.
 */
export function mapEngineEvent(raw: RawEngineEvent, sessionId: string): StudioAgentEvent | null {
  const t = str(raw.type).toLowerCase();
  const props = (raw.properties ?? {}) as Record<string, unknown>;
  const sid = str(props.sessionID) || str(pick(raw as Record<string, unknown>, ["sessionId", "session_id", "session"]), sessionId);

  // ── Exact v1.18 shapes first (verified against the engine's OpenAPI). ──
  // message.updated: { properties: { info: { id, sessionID, role, ... } } }
  if (t === "message.updated") {
    const info = (props.info ?? {}) as Record<string, unknown>;
    const messageId = str(info.id);
    if (!messageId) return null;
    return {
      type: "message.upsert",
      sessionId: str(info.sessionID) || sid,
      messageId,
      role: info.role === "user" ? "user" : "assistant",
    };
  }
  // message.part.updated: { properties: { sessionID, part: Part } } — the
  // part carries the FULL text so far (a snapshot, not a delta).
  if (t === "message.part.updated") {
    const part = (props.part ?? {}) as Record<string, unknown>;
    const messageId = str(part.messageID);
    const partId = str(part.id);
    const psid = str(part.sessionID) || sid;
    if (part.type === "text") {
      return { type: "part.snapshot", sessionId: psid, messageId, partId, part: { kind: "text", text: str(part.text) } };
    }
    if (part.type === "tool") {
      const state = (part.state ?? {}) as Record<string, unknown>;
      return {
        type: "part.snapshot",
        sessionId: psid,
        messageId,
        partId,
        part: { kind: "tool", callId: str(part.callID) || partId, name: str(part.tool, "tool"), status: str(state.status) },
      };
    }
    return null; // step markers / snapshots / reasoning — not rendered yet
  }

  // ── Fuzzy fallbacks for other engine versions. ──
  // Streaming assistant text.
  if (t.includes("message") && (t.includes("delta") || t.includes("part") || t.includes("chunk"))) {
    const text = str(pick(raw as Record<string, unknown>, ["text", "delta", "content"]));
    return text ? { type: "message.delta", sessionId: sid, text } : null;
  }
  if (t.includes("message") && (t.includes("done") || t.includes("complete") || t.includes("end"))) {
    return { type: "message.done", sessionId: sid };
  }

  // Tool calls.
  if (t.includes("tool") && (t.includes("start") || t.includes("call") || t.includes("invoke"))) {
    return {
      type: "tool.start",
      sessionId: sid,
      callId: str(pick(raw as Record<string, unknown>, ["callId", "call_id", "id"])),
      name: str(pick(raw as Record<string, unknown>, ["name", "tool", "toolName"]), "tool"),
      args: pick(raw as Record<string, unknown>, ["args", "arguments", "input"]) ?? {},
    };
  }
  if (t.includes("tool") && (t.includes("result") || t.includes("output") || t.includes("done"))) {
    const errored = raw.error !== undefined || raw.ok === false || t.includes("error");
    return {
      type: "tool.result",
      sessionId: sid,
      callId: str(pick(raw as Record<string, unknown>, ["callId", "call_id", "id"])),
      ok: !errored,
      result: pick(raw as Record<string, unknown>, ["result", "output", "error"]) ?? null,
    };
  }

  // Permission gate → surfaced through Studio's Review/Confirm.
  if (t.includes("permission") || t.includes("approval")) {
    return {
      type: "permission.request",
      sessionId: sid,
      requestId: str(pick(raw as Record<string, unknown>, ["requestId", "request_id", "id"])),
      title: str(pick(raw as Record<string, unknown>, ["title", "summary", "action"]), "Approve this action?"),
      detail: str(pick(raw as Record<string, unknown>, ["detail", "description", "command"])) || undefined,
    };
  }

  // Errors and idle/completion.
  if (t.includes("error")) {
    return { type: "error", sessionId: sid, message: str(pick(raw as Record<string, unknown>, ["message", "error", "detail"]), "Engine error") };
  }
  if (t.includes("idle") || t === "session.done" || t.includes("finish")) {
    return { type: "session.idle", sessionId: sid };
  }

  return null; // unrecognized/heartbeat — ignore
}
