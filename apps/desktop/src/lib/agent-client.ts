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

async function api<T>(path: string, method: "GET" | "POST" | "PUT" | "DELETE" = "GET", body?: unknown): Promise<T> {
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

  async abort(sessionId: string): Promise<void> {
    await api(`/sessions/${sessionId}/abort`, "POST");
  },

  /** Attach to the session's event stream. Returns a disposer. */
  async stream(sessionId: string, onEvent: (e: AgentEvent) => void): Promise<() => void> {
    const unlisten = await listen<AgentEvent>(`agent-event:${sessionId}`, (ev) => onEvent(ev.payload));
    await invoke("agent_stream", { sessionId });
    return unlisten;
  },
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
  panels: DashPanel[];
};

export type DashboardMeta = { id: string; title: string; description: string; panels: number; updatedAt: number };

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
