import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// Client for the agent-core sidecar. The webview cannot reach the sidecar's
// localhost HTTP server directly (mixed-content), so everything goes through
// two Rust commands: `agent_api` (REST proxy) and `agent_stream` (SSE →
// Tauri events named `agent-event:<sessionId>`).

export type AgentModelInfo = {
  id: string;
  name: string;
  context?: number;
  toolCall?: boolean;
  reasoning?: boolean;
  /** Reasoning-effort variants the engine computed (low/medium/high/xhigh). */
  variants?: string[];
  /** Model accepts image input. */
  image?: boolean;
};

/** A file or image attached to a message. */
export type AgentAttachment = {
  name: string;
  mime: string;
  kind: "text" | "image" | "binary";
  /** text: the file's text; image: a data: URL; binary: base64 (e.g. Parquet). */
  data: string;
};

export type AgentProviderInfo = {
  id: string;
  name: string;
  kind: "cloud" | "local";
  configured: boolean;
  running?: boolean;
  installedOnly?: boolean;
  envKey?: string;
  models: AgentModelInfo[];
};

export type AgentEvent =
  | { type: "text-delta"; messageId: string; delta: string }
  | { type: "reasoning-delta"; messageId: string; delta: string }
  | { type: "message-start"; messageId: string; role: "assistant" }
  | { type: "message-done"; messageId: string; usage?: { inputTokens?: number; outputTokens?: number } }
  | { type: "tool-start"; callId: string; name: string; args: unknown }
  | { type: "tool-end"; callId: string; name: string; ok: boolean; summary?: string }
  | { type: "permission-ask"; id: string; tool: string; summary: string; detail: string }
  | { type: "permission-result"; id: string; allow: boolean }
  | { type: "title-changed"; title: string }
  | { type: "user-message"; text: string }
  | { type: "dashboard-saved"; id: string; title: string }
  | { type: "artifact-created"; id: string; title: string }
  | { type: "compacted"; folded: number }
  | { type: "ui-request"; id: string; action: string; params: Record<string, unknown> }
  | { type: "ui-result"; id: string; ok: boolean; detail?: string }
  | { type: "error"; message: string }
  | { type: "status"; state: "idle" | "thinking" | "streaming" };

export type SessionMeta = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
};

export type ReplayItem =
  | { kind: "msg"; id: string; role: "user" | "assistant"; content: string; error?: boolean }
  | { kind: "tool"; id: string; name: string; args: unknown; done: true; ok: boolean; summary?: string }
  | { kind: "perm"; id: string; tool: string; summary: string; detail: string; result?: boolean };

/** In the web build there is no Tauri bridge — talk to a hosted agent-core
 *  directly over HTTP (VITE_AGENT_URL, e.g. https://agent.example.com). */
const AGENT_URL = (import.meta.env.VITE_AGENT_URL as string | undefined)?.replace(/\/$/, "");
const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function api<T>(path: string, method: "GET" | "POST" | "PUT" | "DELETE" = "GET", body?: unknown): Promise<T> {
  if (!inTauri()) {
    if (!AGENT_URL) throw new Error("The AI assistant needs a hosted backend — this web demo runs without one.");
    const res = await fetch(`${AGENT_URL}/v1${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined || body === null ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`agent backend ${res.status}`);
    return (await res.json()) as T;
  }
  return invoke<T>("agent_api", { path, method, body: body ?? null });
}

export type AgentSettings = {
  defaultSkills: string[];
  readPolicy: "allow" | "ask";
  writePolicy: "ask" | "deny";
  maxSteps: number;
  temperature: number;
  customInstructions: string;
  enableResearcher: boolean;
  enableInsights: boolean;
  enableCompaction: boolean;
  enableUiTools: boolean;
  petMode: "pet" | "cursor" | "off";
  petAvatar: "exa" | "byte" | "pixel" | "quill" | "dot";
  allowDestructiveUi: boolean;
  allowFileAccess: boolean;
  autoCommit: boolean;
};

export const agent = {
  async getSettings(): Promise<{ settings: AgentSettings; defaults: AgentSettings }> {
    return api("/settings");
  },

  async setSettings(patch: Partial<AgentSettings>): Promise<AgentSettings> {
    const { settings } = await api<{ settings: AgentSettings }>("/settings", "PUT", patch);
    return settings;
  },

  async models(): Promise<{ providers: AgentProviderInfo[]; defaultModel: string | null }> {
    return api("/models");
  },

  /** One-shot SQL rewrite for the editor's inline diff (no chat session). */
  async rewriteSql(
    sql: string,
    action: "optimize" | "fix" | "edit",
    instruction?: string,
  ): Promise<string> {
    const { sql: out } = await api<{ sql: string }>("/rewrite", "POST", { sql, action, instruction });
    return out;
  },

  async setProviderKey(providerId: string, apiKey: string): Promise<void> {
    await api(`/providers/${providerId}`, "PUT", { apiKey });
  },

  /** Configure a custom / in-database OpenAI-compatible provider. */
  async setProvider(
    providerId: string,
    cfg: { baseURL?: string; apiKey?: string; models?: { id: string; name?: string; context?: number }[] },
  ): Promise<void> {
    await api(`/providers/${providerId}`, "PUT", cfg);
  },

  /** Test-reach an OpenAI-compatible endpoint before saving it. */
  async probeEndpoint(baseURL: string, apiKey?: string): Promise<{ ok: boolean; models?: number; error?: string }> {
    return api("/providers/probe", "POST", { baseURL, apiKey });
  },

  async setDefaultModel(model: string): Promise<void> {
    await api("/config", "PUT", { model });
  },

  async auditTail(limit = 100): Promise<Record<string, unknown>[]> {
    const { events } = await api<{ events: Record<string, unknown>[] }>(`/audit?limit=${limit}`);
    return events;
  },
  async mcpList(): Promise<{ id: string; name: string; transport?: "stdio" | "http"; command?: string; args?: string[]; url?: string; connected: boolean; toolCount: number; tools?: string[] }[]> {
    const { servers } = await api<{ servers: { id: string; name: string; transport?: "stdio" | "http"; command?: string; args?: string[]; url?: string; connected: boolean; toolCount: number; tools?: string[] }[] }>("/mcp");
    return servers;
  },
  async mcpAdd(cfg: {
    name: string;
    transport?: "stdio" | "http";
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
  }): Promise<void> {
    await api("/mcp", "POST", cfg);
  },
  async mcpReconnect(id: string): Promise<void> {
    await api(`/mcp/${encodeURIComponent(id)}/reconnect`, "POST", {});
  },
  async mcpRemove(id: string): Promise<void> {
    await api(`/mcp/${encodeURIComponent(id)}`, "DELETE");
  },
  async revertSession(id: string, userIndex: number): Promise<string | null> {
    const { removedText } = await api<{ removedText: string | null }>(
      `/sessions/${encodeURIComponent(id)}/revert`, "POST", { userIndex },
    );
    return removedText;
  },
  async forkSession(id: string, userIndex: number): Promise<{ id: string; title: string }> {
    return api<{ id: string; title: string }>(`/sessions/${encodeURIComponent(id)}/fork`, "POST", { userIndex });
  },
  async createSession(): Promise<string> {
    const { id } = await api<{ id: string }>("/sessions", "POST");
    return id;
  },

  async listSessions(): Promise<SessionMeta[]> {
    const { sessions } = await api<{ sessions: SessionMeta[] }>("/sessions");
    return sessions;
  },

  async sessionItems(sessionId: string): Promise<{ title: string; items: ReplayItem[] }> {
    return api(`/sessions/${sessionId}/items`);
  },

  async deleteSession(sessionId: string): Promise<void> {
    await api(`/sessions/${sessionId}`, "DELETE");
  },

  async send(
    sessionId: string,
    text: string,
    model: string,
    context?: string,
    connectionId?: string | null,
    attachments?: AgentAttachment[],
  ): Promise<void> {
    await api(`/sessions/${sessionId}/messages`, "POST", { text, model, context, connectionId, attachments });
  },

  async answerPermission(sessionId: string, id: string, allow: boolean): Promise<void> {
    await api(`/sessions/${sessionId}/permission`, "POST", { id, allow });
  },

  async answerUi(sessionId: string, id: string, ok: boolean, detail?: string): Promise<void> {
    await api(`/sessions/${sessionId}/ui-result`, "POST", { id, ok, detail });
  },

  /** Register a saved connection with the agent (decrypts server-side in Rust). */
  async grantConnection(profileId: string): Promise<void> {
    await invoke("agent_grant_connection", { profileId });
  },

  /** Databases registered on the MCP gateway bus (exposure + per-connection
   *  service capabilities) plus bus-level Studio services. */
  async gatewayDatabases(): Promise<{
    databases: { id: string; name: string; exposed: boolean; caps: { sql: boolean; nl2sql: boolean } }[];
    services: { id: string; exposed: boolean }[];
  }> {
    return api("/gateway/databases");
  },

  /** Flip one connection's MCP exposure and/or its service selection. */
  async setGatewayExposure(
    profileId: string,
    patch: { exposed?: boolean; caps?: Partial<Record<"sql" | "nl2sql", boolean>> },
  ): Promise<void> {
    await api(`/gateway/databases/${encodeURIComponent(profileId)}`, "PUT", patch);
  },

  /** Flip a bus-level Studio service (e.g. "dashboards"). */
  async setGatewayService(serviceId: string, exposed: boolean): Promise<void> {
    await api(`/gateway/services/${encodeURIComponent(serviceId)}`, "PUT", { exposed });
  },

  async abort(sessionId: string): Promise<void> {
    await api(`/sessions/${sessionId}/abort`, "POST");
  },

  /** Attach to the session's event stream. Returns a disposer. */
  async stream(sessionId: string, onEvent: (e: AgentEvent) => void): Promise<() => void> {
    const unlisten = await listen<AgentEvent>(`agent-event:${sessionId}`, (ev) => onEvent(ev.payload));
    await invoke("agent_stream", { sessionId });
    return unlisten;
  },

  // ── Exa engine (opencode) — v2 chat backend over /v1/engine/* ─────────────
  engine: {
    status: (): Promise<EngineStatus> => api("/engine/status"),
    /** Exa agent internet access (sandboxed off by default). */
    network: (): Promise<{ allowed: boolean }> => api("/engine/network"),
    setNetwork: (allow: boolean): Promise<{ ok: boolean }> => api("/engine/network", "POST", { allow }),
    sessions: (): Promise<{ sessions: EngineSessionInfo[] }> => api("/engine/sessions"),
    /** The engine's CONFIGURED providers/models (GET /config/providers). */
    providers: (): Promise<{ providers: EngineProviderInfo[]; defaults: Record<string, string> }> => api("/engine/providers"),
    /** The FULL models.dev provider catalog (what opencode itself supports). */
    catalog: (): Promise<{ providers: EngineCatalogProvider[] }> => api("/engine/catalog"),
    /** Save a provider API key into the engine's own auth store. */
    setAuth: (providerId: string, key: string): Promise<{ ok: boolean }> => api("/engine/auth", "POST", { providerId, key }),
    /** Remove a provider's credential from the engine (disconnect). */
    removeAuth: (providerId: string): Promise<{ ok: boolean }> => api(`/engine/auth/${encodeURIComponent(providerId)}`, "DELETE"),
    /** Per-provider auth methods — opencode's connect-flow spec. */
    authMethods: (): Promise<{ methods: Record<string, EngineAuthMethod[]> }> => api("/engine/auth-methods"),
    /** Provider ids with working credentials (verifies a saved key took). */
    connected: (): Promise<{ connected: string[] }> => api("/engine/connected"),
    /** Start an OAuth flow; authorization is null for non-oauth methods. */
    oauthAuthorize: (providerId: string, method: number, inputs?: Record<string, string>): Promise<{ authorization: EngineOAuthAuthorization | null }> =>
      api("/engine/oauth/authorize", "POST", { providerId, method, inputs }),
    /** Complete an OAuth flow — resolves when the engine finishes polling. */
    oauthCallback: (providerId: string, method: number, code?: string): Promise<{ ok: boolean }> =>
      api("/engine/oauth/callback", "POST", { providerId, method, code }),
    /** Engine-side session compaction (/compact). */
    compact: (id: string): Promise<{ ok: boolean }> => api(`/engine/sessions/${encodeURIComponent(id)}/compact`, "POST"),
    /** MCP servers: status map, add one, connect/disconnect by name. */
    mcp: (): Promise<{ servers: Record<string, { status: string }> }> => api("/engine/mcp"),
    mcpAdd: (name: string, config: EngineMcpConfig): Promise<{ ok: boolean }> => api("/engine/mcp", "POST", { name, config }),
    mcpToggle: (name: string, connect: boolean): Promise<{ ok: boolean }> =>
      api(`/engine/mcp/${encodeURIComponent(name)}/${connect ? "connect" : "disconnect"}`, "POST"),
    /** Undo (revert) / redo (unrevert) the last message in a session. */
    undo: (id: string): Promise<{ ok: boolean }> => api(`/engine/sessions/${encodeURIComponent(id)}/undo`, "POST"),
    redo: (id: string): Promise<{ ok: boolean }> => api(`/engine/sessions/${encodeURIComponent(id)}/redo`, "POST"),
    /** Permanently delete a stored session. */
    deleteSession: (id: string): Promise<{ ok: boolean }> => api(`/engine/sessions/${encodeURIComponent(id)}`, "DELETE"),
    /** Rename a stored session (overrides the auto-generated title). */
    renameSession: (id: string, title: string): Promise<{ ok: boolean }> =>
      api(`/engine/sessions/${encodeURIComponent(id)}/rename`, "POST", { title }),
  },
};

/** One persisted engine session (auto-titled by the engine). */
export type EngineSessionInfo = { id: string; title?: string; updated?: number };

/** One input collected before an auth flow (select or text, may be conditional). */
export type EngineAuthPrompt = {
  type: "text" | "select";
  key: string;
  message: string;
  placeholder?: string;
  options?: { label: string; value: string; hint?: string }[];
  when?: { key: string; op: "eq" | "neq"; value: string };
};

/** One auth method a provider supports (e.g. "ChatGPT Pro/Plus (browser)"). */
export type EngineAuthMethod = { type: "oauth" | "api"; label: string; prompts?: EngineAuthPrompt[] };

/** An in-flight OAuth authorization (open `url`, follow `instructions`). */
export type EngineOAuthAuthorization = { url: string; method: "auto" | "code"; instructions: string };

/** An MCP server definition for the engine (local command or remote URL). */
export type EngineMcpConfig =
  | { type: "local"; command: string[]; cwd?: string; environment?: Record<string, string>; enabled?: boolean }
  | { type: "remote"; url: string; headers?: Record<string, string>; enabled?: boolean };

/** One provider from the FULL models.dev catalog (/v1/engine/catalog). */
export type EngineCatalogProvider = {
  id: string;
  name: string;
  env: string[];
  modelCount: number;
  popular: boolean;
};

/** One provider from the engine's own catalog (/v1/engine/providers). */
export type EngineProviderInfo = {
  id: string;
  name: string;
  /** How it was configured: "env" | "config" | "custom" | "api". */
  source?: string;
  models: { id: string; name: string; context?: number; variants?: string[] }[];
};

/** Engine install/run status (from /v1/engine/status). */
export type EngineStatus = {
  state: "stopped" | "starting" | "running" | "backoff" | "failed";
  binaryPresent: boolean;
  provisioned: boolean;
  port?: number;
  reason?: string;
};

// ── Built-in local AI engine (managed llama-server, see local_llm.rs) ──

export type LlmModelStatus = {
  id: string;
  name: string;
  description: string;
  file: string;
  url: string;
  sizeMb: number;
  minRamGb: number;
  downloaded: boolean;
};

export type LlmStatus = {
  supported: boolean;
  engineInstalled: boolean;
  engineVersion: string | null;
  runningModel: string | null;
  autoStart: boolean;
  lastModel: string | null;
  port: number;
  models: LlmModelStatus[];
  embedPort: number;
  embeddingDownloaded: boolean;
  embeddingReady: boolean;
};

export type LlmProgress = { stage: "engine" | "model" | "start" | "embed"; pct: number | null; msg: string };

export const llm = {
  status: () => invoke<LlmStatus>("llm_status"),
  installEngine: () => invoke<null>("llm_engine_install"),
  installModel: (modelId: string) => invoke<null>("llm_model_install", { modelId }),
  installEmbed: () => invoke<null>("llm_embed_install"),
  start: (modelId: string) => invoke<null>("llm_start", { modelId }),
  stop: () => invoke<null>("llm_stop"),
  setAutoStart: (enabled: boolean) => invoke<null>("llm_set_auto_start", { enabled }),
  onProgress: (cb: (p: LlmProgress) => void) =>
    listen<LlmProgress>("llm-progress", (e) => cb(e.payload)),
};

// ── Dashboards (agent-built, JSON specs stored in agent-core) ──

export type DashPanel = {
  id: string;
  title: string;
  grid: { x: number; y: number; w: number; h: number };
  /** Absent on markdown text panels. */
  query?: { sql: string };
  viz:
    | { type: "echarts"; chart: "bar" | "line" | "area" | "pie" | "donut" | "hbar" | "scatter" | "heatmap" | "funnel" | "radar" | "treemap" | "gauge"; xField?: string; yFields?: string[]; stacked?: boolean; option?: Record<string, unknown> }
    | { type: "kpi"; valueField?: string; unit?: string }
    | { type: "table" }
    | { type: "explore"; config?: Record<string, unknown> }
    | { type: "markdown"; content: string };
};

export type Dashboard = {
  version: 1;
  id: string;
  title: string;
  description: string;
  /** Optional grouping in the dashboards list (e.g. "System"). */
  group?: string;
  panels: DashPanel[];
  /** Auto-refresh cadence in ms (0/undefined = off). Makes the dashboard live:
   *  every panel re-runs its query on this interval. */
  refreshMs?: number;
};

export type DashboardMeta = { id: string; title: string; description: string; group?: string; panels: number; updatedAt: number };

export type Skill = { name: string; description: string; body: string; source: "builtin" | "user" };

export const skills = {
  async list(): Promise<Skill[]> {
    const { skills: s } = await api<{ skills: Skill[] }>("/skills");
    return s;
  },
  async save(name: string, description: string, body: string): Promise<void> {
    await api("/skills", "PUT", { name, description, body });
  },
  async remove(name: string): Promise<void> {
    await api(`/skills/${encodeURIComponent(name)}`, "DELETE");
  },
};

export const artifacts = {
  async list(): Promise<{ id: string; title: string; createdAt: number }[]> {
    const { artifacts: a } = await api<{ artifacts: { id: string; title: string; createdAt: number }[] }>("/artifacts");
    return a;
  },
  async get(id: string): Promise<{ id: string; title: string; html: string }> {
    const { artifact } = await api<{ artifact: { id: string; title: string; html: string } }>(`/artifacts/${encodeURIComponent(id)}`);
    return artifact;
  },
};

export const dashboards = {
  async list(): Promise<DashboardMeta[]> {
    const { dashboards: d } = await api<{ dashboards: DashboardMeta[] }>("/dashboards");
    return d;
  },
  async get(id: string): Promise<Dashboard> {
    const { dashboard } = await api<{ dashboard: Dashboard }>(`/dashboards/${encodeURIComponent(id)}`);
    return dashboard;
  },
  async save(d: Dashboard): Promise<Dashboard> {
    const { dashboard } = await api<{ dashboard: Dashboard }>("/dashboards", "PUT", d);
    return dashboard;
  },
  async remove(id: string): Promise<void> {
    await api(`/dashboards/${encodeURIComponent(id)}`, "DELETE");
  },
  async history(id: string): Promise<{ index: number; updatedAt: number; title: string; panels: number }[]> {
    const { history } = await api<{ history: { index: number; updatedAt: number; title: string; panels: number }[] }>(
      `/dashboards/${encodeURIComponent(id)}/history`,
    );
    return history;
  },
  async rollback(id: string, index: number): Promise<Dashboard> {
    const { dashboard } = await api<{ dashboard: Dashboard }>(
      `/dashboards/${encodeURIComponent(id)}/rollback`,
      "POST",
      { index },
    );
    return dashboard;
  },
};
