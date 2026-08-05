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

/** One input the user answers before an auth flow (verified v1.18.12 shape). */
export type AuthPrompt = {
  type: "text" | "select";
  key: string;
  message: string;
  placeholder?: string;
  options?: { label: string; value: string; hint?: string }[];
  /** Conditional visibility, e.g. Enterprise URL only when deploymentType=enterprise. */
  when?: { key: string; op: "eq" | "neq"; value: string };
};

/** One auth method a provider supports (e.g. "ChatGPT Pro/Plus (browser)"). */
export type AuthMethod = { type: "oauth" | "api"; label: string; prompts?: AuthPrompt[] };

/** What POST /provider/:id/oauth/authorize returns. */
export type OAuthAuthorization = { url: string; method: "auto" | "code"; instructions: string };

/** An MCP server definition (verified against the engine's OpenAPI spec). */
export type McpConfig =
  | { type: "local"; command: string[]; cwd?: string; environment?: Record<string, string>; enabled?: boolean }
  | { type: "remote"; url: string; headers?: Record<string, string>; enabled?: boolean };

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
  /** Undo the last message (session.revert) / redo it (session.unrevert). */
  revert(sessionId: string): Promise<void>;
  unrevert(sessionId: string): Promise<void>;
  /** Permanently delete a stored session. */
  deleteSession(sessionId: string): Promise<void>;
  /** Rename a stored session (overrides the auto-generated title). */
  renameSession(sessionId: string, title: string): Promise<void>;
  respondPermission(sessionId: string, permissionId: string, approve: boolean): Promise<void>;
  /** The engine's configured providers + models (its source of truth). */
  providers(): Promise<{ providers: EngineProvider[]; defaults: Record<string, string> }>;
  /** Per-provider auth methods (GET /provider/auth) — the connect flow spec. */
  authMethods(): Promise<Record<string, AuthMethod[]>>;
  /** Start an OAuth flow; null for non-oauth methods. `method` is the index. */
  oauthAuthorize(providerId: string, method: number, inputs?: Record<string, string>): Promise<OAuthAuthorization | null>;
  /** Complete an OAuth flow — BLOCKS until the server finishes polling. */
  oauthCallback(providerId: string, method: number, code?: string): Promise<boolean>;
  /** Save an API key via the engine's own route (PUT /auth/:id). */
  setAuthKey(providerId: string, key: string): Promise<void>;
  /** Provider ids the engine considers connected (GET /provider). */
  connectedProviders(): Promise<string[]>;
  /** Remove a provider's credential (DELETE /auth/:id). */
  removeAuth(providerId: string): Promise<void>;
  /** Reset instance state so new credentials take effect (no restart). */
  dispose(): Promise<void>;
  /** MCP servers: status map, add one, and connect/disconnect by name. */
  mcpList(): Promise<Record<string, { status: string }>>;
  mcpAdd(name: string, config: McpConfig): Promise<void>;
  mcpToggle(name: string, connect: boolean): Promise<void>;
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
    delete(o: unknown): Promise<unknown>;
    update(o: unknown): Promise<unknown>;
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

  // The auth/provider routes are newer than our narrow SDK typing — call them
  // directly. Shapes verified against the v1.18.12 source.
  const http = async <T>(path: string, init?: { method?: string; body?: unknown; timeoutMs?: number }): Promise<T> => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: { "content-type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      // OAuth callback blocks while the server polls the device flow — allow
      // several minutes; everything else fails fast.
      signal: AbortSignal.timeout(init?.timeoutMs ?? 30_000),
    });
    if (!res.ok) throw new Error(`engine ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  };

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
    async authMethods() {
      return http<Record<string, AuthMethod[]>>("/provider/auth");
    },
    async oauthAuthorize(providerId, method, inputs) {
      return http<OAuthAuthorization | null>(`/provider/${encodeURIComponent(providerId)}/oauth/authorize`, {
        method: "POST",
        body: { method, ...(inputs && Object.keys(inputs).length ? { inputs } : {}) },
      });
    },
    async oauthCallback(providerId, method, code) {
      const r = await http<boolean>(`/provider/${encodeURIComponent(providerId)}/oauth/callback`, {
        method: "POST",
        body: { method, ...(code ? { code } : {}) },
        timeoutMs: 5 * 60_000, // the server polls the device flow inline
      });
      return r === true;
    },
    async setAuthKey(providerId, key) {
      await http(`/auth/${encodeURIComponent(providerId)}`, { method: "PUT", body: { type: "api", key } });
    },
    async connectedProviders() {
      const r = await http<{ connected?: string[] }>("/provider");
      return r?.connected ?? [];
    },
    async removeAuth(providerId) {
      await http(`/auth/${encodeURIComponent(providerId)}`, { method: "DELETE" });
    },
    async dispose() {
      await http("/instance/dispose", { method: "POST" });
    },
    async mcpList() {
      return http<Record<string, { status: string }>>("/mcp");
    },
    async mcpAdd(name, config) {
      await http("/mcp", { method: "POST", body: { name, config } });
    },
    async mcpToggle(name, connect) {
      await http(`/mcp/${encodeURIComponent(name)}/${connect ? "connect" : "disconnect"}`, { method: "POST", body: {} });
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
    async revert(sessionId) {
      await http(`/session/${encodeURIComponent(sessionId)}/revert`, { method: "POST", body: {} });
    },
    async unrevert(sessionId) {
      await http(`/session/${encodeURIComponent(sessionId)}/unrevert`, { method: "POST", body: {} });
    },
    async deleteSession(sessionId) {
      await c.session.delete({ path: { id: sessionId } });
    },
    async renameSession(sessionId, title) {
      await c.session.update({ path: { id: sessionId }, body: { title } });
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
