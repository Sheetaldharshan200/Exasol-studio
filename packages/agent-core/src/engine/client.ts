/**
 * Typed client wrapper over the opencode SDK (exa-agent-v2, task 1.3). The rest
 * of Studio talks to sessions/messages/events through THIS narrow surface, not
 * the SDK directly, so an engine/SDK change is contained here (the bridge maps
 * raw events to Studio's union via mapEngineEvent). The SDK is imported
 * dynamically so a build without the engine installed still loads — the engine
 * is a Marketplace component that may be absent until downloaded.
 */
import { mapEngineEvent, type RawEngineEvent, type StudioAgentEvent } from "./bridge-map.ts";
import { mapReplayMessages, type ReplayMessage } from "./replay-map.ts";

/** One provider from the engine's own catalog (GET /config/providers). */
export type EngineProvider = {
  id: string;
  name: string;
  /** How it was configured: "env" | "config" | "custom" | "api". */
  source?: string;
  models: { id: string; name: string; context?: number }[];
};

export type EngineSessionInfo = { id: string; title?: string; updated?: number };

export type EngineClient = {
  createSession(): Promise<string>;
  listSessions(): Promise<EngineSessionInfo[]>;
  /** A session's stored messages, mapped to Studio's part-based shape. */
  listMessages(sessionId: string): Promise<ReplayMessage[]>;
  prompt(sessionId: string, text: string, model?: { providerID: string; modelID: string }, agentName?: string): Promise<void>;
  abort(sessionId: string): Promise<void>;
  /** Engine-side session compaction (summarize to reclaim context). */
  summarize(sessionId: string): Promise<void>;
  respondPermission(sessionId: string, permissionId: string, approve: boolean): Promise<void>;
  /** The engine's configured providers + models (its source of truth). */
  providers(): Promise<{ providers: EngineProvider[]; defaults: Record<string, string> }>;
  /** Subscribe to the server's event stream, mapped to Studio events. */
  subscribe(onEvent: (e: StudioAgentEvent) => void, signal?: AbortSignal): Promise<void>;
};

type RawModel = { name?: string; limit?: { context?: number } };
type RawProvider = { id: string; name?: string; source?: string; models?: Record<string, RawModel> };

type RawClient = {
  session: {
    list(): Promise<{ data?: { id: string; title?: string; time?: { updated?: number } }[] }>;
    create(o?: unknown): Promise<{ data?: { id: string } }>;
    messages(o: unknown): Promise<{ data?: unknown[] }>;
    prompt(o: unknown): Promise<unknown>;
    abort(o: unknown): Promise<unknown>;
    summarize(o: unknown): Promise<unknown>;
  };
  config: { providers(): Promise<{ data?: { providers?: RawProvider[]; default?: Record<string, string> } }> };
  event: { subscribe(): Promise<{ stream: AsyncIterable<RawEngineEvent> }> };
  postSessionIdPermissionsPermissionId(o: unknown): Promise<unknown>;
};

/** Connect a typed client to a running engine server at `baseUrl`. */
export async function connectEngine(baseUrl: string): Promise<EngineClient> {
  const sdk = (await import("@opencode-ai/sdk")) as {
    createOpencodeClient: (cfg: { baseUrl: string }) => RawClient;
  };
  const c = sdk.createOpencodeClient({ baseUrl });

  return {
    async createSession() {
      const r = await c.session.create({});
      const id = r?.data?.id;
      if (!id) throw new Error("engine did not return a session id");
      return id;
    },
    async listSessions() {
      const r = await c.session.list();
      return (r?.data ?? []).map((s) => ({ id: s.id, title: s.title, updated: s.time?.updated }));
    },
    async listMessages(sessionId) {
      const r = await c.session.messages({ path: { id: sessionId } });
      return mapReplayMessages((r?.data ?? []) as Parameters<typeof mapReplayMessages>[0]);
    },
    async prompt(sessionId, text, model, agentName) {
      await c.session.prompt({
        path: { id: sessionId },
        body: { parts: [{ type: "text", text }], ...(model ? { model } : {}), ...(agentName ? { agent: agentName } : {}) },
      });
    },
    async providers() {
      const r = await c.config.providers();
      const providers = (r?.data?.providers ?? []).map((p) => ({
        id: p.id,
        name: p.name ?? p.id,
        source: p.source,
        models: Object.entries(p.models ?? {}).map(([id, m]) => ({ id, name: m?.name ?? id, context: m?.limit?.context })),
      }));
      return { providers, defaults: r?.data?.default ?? {} };
    },
    async abort(sessionId) {
      await c.session.abort({ path: { id: sessionId } });
    },
    async summarize(sessionId) {
      await c.session.summarize({ path: { id: sessionId }, body: {} });
    },
    async respondPermission(sessionId, permissionId, approve) {
      await c.postSessionIdPermissionsPermissionId({
        path: { id: sessionId, permissionID: permissionId },
        body: { response: approve ? "always" : "reject" },
      });
    },
    async subscribe(onEvent, signal) {
      const { stream } = await c.event.subscribe();
      for await (const raw of stream) {
        if (signal?.aborted) break;
        const sid = String((raw as Record<string, unknown>).sessionId ?? "");
        const mapped = mapEngineEvent(raw, sid);
        if (mapped) onEvent(mapped);
      }
    },
  };
}
