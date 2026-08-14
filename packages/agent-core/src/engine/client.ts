/**
 * Typed client wrapper over the engine SDK (exa-agent-v2, task 1.3). The rest
 * of Studio talks to sessions/providers/MCP through THIS narrow surface, not
 * the SDK directly, so an engine/SDK change is contained here. Chat itself
 * (prompt/stream/replay/permissions) is NOT proxied here anymore — the webview
 * talks to the engine directly via the assistant-ui runtime. The SDK is
 * imported dynamically so a build without the engine installed still loads —
 * the engine is a Marketplace component that may be absent until downloaded.
 */

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
  models: { id: string; name: string; context?: number; variants?: string[] }[];
};

export type EngineSessionInfo = { id: string; title?: string; updated?: number };

export type EngineClient = {
  listSessions(): Promise<EngineSessionInfo[]>;
  /** Engine-side session compaction (summarize to reclaim context). */
  summarize(sessionId: string): Promise<void>;
  /** Undo the last message (session.revert) / redo it (session.unrevert). */
  revert(sessionId: string): Promise<void>;
  unrevert(sessionId: string): Promise<void>;
  /** Permanently delete a stored session. */
  deleteSession(sessionId: string): Promise<void>;
  /** Rename a stored session (overrides the auto-generated title). */
  renameSession(sessionId: string, title: string): Promise<void>;
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
  /** The exa agent's LIVE web access (last webfetch rule wins); null when unknown. */
  agentWebAccess(): Promise<boolean | null>;
  /** MCP servers: status map, add one, and connect/disconnect by name. */
  mcpList(): Promise<Record<string, { status: string }>>;
  mcpAdd(name: string, config: McpConfig): Promise<void>;
  mcpToggle(name: string, connect: boolean): Promise<void>;
};

type RawModel = { name?: string; limit?: { context?: number }; variants?: Record<string, unknown> };
type RawProvider = { id: string; name?: string; source?: string; models?: Record<string, RawModel> };

type RawClient = {
  session: {
    list(): Promise<{ data?: { id: string; title?: string; time?: { updated?: number } }[] }>;
    summarize(o: unknown): Promise<unknown>;
    delete(o: unknown): Promise<unknown>;
    update(o: unknown): Promise<unknown>;
  };
  config: { providers(): Promise<{ data?: { providers?: RawProvider[]; default?: Record<string, string> } }> };
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
    async listSessions() {
      const r = await c.session.list();
      return (r?.data ?? []).map((s) => ({ id: s.id, title: s.title, updated: s.time?.updated }));
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
    async agentWebAccess() {
      // The ENGINE's merged ruleset is the enforced truth (config files can
      // drift from a running instance — permissions are boot-time state).
      const agents = await http<{ name?: string; permission?: { permission?: string; action?: string }[] }[]>("/agent");
      const exa = agents.find((a) => a.name === "exa");
      if (!exa) return null;
      const rules = (exa.permission ?? []).filter((r) => r.permission === "webfetch");
      if (rules.length === 0) return true; // engine default: allowed
      return rules[rules.length - 1].action !== "deny";
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
        models: Object.entries(p.models ?? {}).map(([id, m]) => ({
          id,
          name: m?.name ?? id,
          context: m?.limit?.context,
          // Reasoning-effort variants (low/medium/high/xhigh) the engine
          // computed for this model; picked in the model selector.
          variants: m?.variants ? Object.keys(m.variants) : undefined,
        })),
      }));
      return { providers, defaults: r?.data?.default ?? {} };
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
  };
}
