/**
 * Typed client wrapper over the opencode SDK (exa-agent-v2, task 1.3). The rest
 * of Studio talks to sessions/messages/events through THIS narrow surface, not
 * the SDK directly, so an engine/SDK change is contained here (the bridge maps
 * raw events to Studio's union via mapEngineEvent). The SDK is imported
 * dynamically so a build without the engine installed still loads — the engine
 * is a Marketplace component that may be absent until downloaded.
 */
import { mapEngineEvent, type RawEngineEvent, type StudioAgentEvent } from "./bridge-map.ts";

export type EngineClient = {
  createSession(): Promise<string>;
  listSessions(): Promise<{ id: string; title?: string }[]>;
  prompt(sessionId: string, text: string, model?: { providerID: string; modelID: string }): Promise<void>;
  abort(sessionId: string): Promise<void>;
  respondPermission(sessionId: string, permissionId: string, approve: boolean): Promise<void>;
  /** Subscribe to the server's event stream, mapped to Studio events. */
  subscribe(onEvent: (e: StudioAgentEvent) => void, signal?: AbortSignal): Promise<void>;
};

type RawClient = {
  session: {
    list(): Promise<{ data?: { id: string; title?: string }[] }>;
    create(o?: unknown): Promise<{ data?: { id: string } }>;
    prompt(o: unknown): Promise<unknown>;
    abort(o: unknown): Promise<unknown>;
  };
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
      return (r?.data ?? []).map((s) => ({ id: s.id, title: s.title }));
    },
    async prompt(sessionId, text, model) {
      await c.session.prompt({
        path: { id: sessionId },
        body: { parts: [{ type: "text", text }], ...(model ? { model } : {}) },
      });
    },
    async abort(sessionId) {
      await c.session.abort({ path: { id: sessionId } });
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
