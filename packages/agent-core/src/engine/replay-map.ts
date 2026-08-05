/**
 * Replay mapping (exa-agent-v2): turn the engine's stored session messages
 * (GET /session/:id/message) into the neutral part-based shape Studio's chat
 * renders — the persisted-history twin of bridge-map's live-event mapping.
 * Pure; tested in replay-map.test.ts.
 */

export type ReplayPart =
  | { type: "text"; text: string }
  | { type: "tool"; callId: string; name: string; ok?: boolean };

export type ReplayMessage = { role: "user" | "assistant"; parts: ReplayPart[] };

type RawPart = {
  id?: string;
  type?: string;
  text?: string;
  tool?: string;
  callID?: string;
  state?: { status?: string };
};

type RawMessage = {
  info?: { role?: string };
  parts?: RawPart[];
};

/** Map one stored message; null when it carries nothing renderable. */
export function mapReplayMessage(raw: RawMessage): ReplayMessage | null {
  const role = raw.info?.role;
  if (role !== "user" && role !== "assistant") return null;
  const parts: ReplayPart[] = [];
  for (const p of raw.parts ?? []) {
    if (p.type === "text" && typeof p.text === "string" && p.text.length > 0) {
      // Merge consecutive text parts so markdown blocks aren't split mid-fence.
      const tail = parts[parts.length - 1];
      if (tail?.type === "text") tail.text += p.text;
      else parts.push({ type: "text", text: p.text });
    } else if (p.type === "tool" && p.tool) {
      const status = p.state?.status;
      parts.push({
        type: "tool",
        callId: p.callID ?? p.id ?? `${p.tool}-${parts.length}`,
        name: p.tool,
        ok: status === "completed" ? true : status === "error" ? false : undefined,
      });
    }
    // Other part types (step markers, snapshots, …) carry no chat content.
  }
  return parts.length > 0 ? { role, parts } : null;
}

/** Map a whole session's stored messages, dropping empty/system entries. */
export function mapReplayMessages(raw: RawMessage[]): ReplayMessage[] {
  return raw.map(mapReplayMessage).filter((m): m is ReplayMessage => m !== null);
}
