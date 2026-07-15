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
  | { type: "error"; message: string }
  | { type: "status"; state: "idle" | "thinking" | "streaming" };

async function api<T>(path: string, method: "GET" | "POST" | "PUT" = "GET", body?: unknown): Promise<T> {
  return invoke<T>("agent_api", { path, method, body: body ?? null });
}

export const agent = {
  async models(): Promise<{ providers: AgentProviderInfo[]; defaultModel: string | null }> {
    return api("/models");
  },

  async setProviderKey(providerId: string, apiKey: string): Promise<void> {
    await api(`/providers/${providerId}`, "PUT", { apiKey });
  },

  async setDefaultModel(model: string): Promise<void> {
    await api("/config", "PUT", { model });
  },

  async createSession(): Promise<string> {
    const { id } = await api<{ id: string }>("/sessions", "POST");
    return id;
  },

  async send(
    sessionId: string,
    text: string,
    model: string,
    context?: string,
    connectionId?: string | null,
  ): Promise<void> {
    await api(`/sessions/${sessionId}/messages`, "POST", { text, model, context, connectionId });
  },

  async answerPermission(sessionId: string, id: string, allow: boolean): Promise<void> {
    await api(`/sessions/${sessionId}/permission`, "POST", { id, allow });
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
};

export type LlmProgress = { stage: "engine" | "model" | "start"; pct: number | null; msg: string };

export const llm = {
  status: () => invoke<LlmStatus>("llm_status"),
  installEngine: () => invoke<null>("llm_engine_install"),
  installModel: (modelId: string) => invoke<null>("llm_model_install", { modelId }),
  start: (modelId: string) => invoke<null>("llm_start", { modelId }),
  stop: () => invoke<null>("llm_stop"),
  setAutoStart: (enabled: boolean) => invoke<null>("llm_set_auto_start", { enabled }),
  onProgress: (cb: (p: LlmProgress) => void) =>
    listen<LlmProgress>("llm-progress", (e) => cb(e.payload)),
};
