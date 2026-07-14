import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/ipc";

// Client for the agent-core sidecar (localhost HTTP + SSE).
// The Rust side spawns the sidecar on demand and hands us port + token.

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
  | { type: "error"; message: string }
  | { type: "status"; state: "idle" | "thinking" | "streaming" };

type AgentInfo = { port: number; token: string };

let cached: AgentInfo | null = null;

async function info(): Promise<AgentInfo> {
  if (!isTauri()) throw new Error("Agent requires the desktop app");
  if (cached) return cached;
  cached = await invoke<AgentInfo>("agent_info");
  return cached;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const { port, token } = await info();
  const res = await fetch(`http://127.0.0.1:${port}/v1${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  if (res.status === 401) {
    // Sidecar restarted with a new token — refresh once and retry.
    cached = null;
    const { port: p2, token: t2 } = await info();
    const retry = await fetch(`http://127.0.0.1:${p2}/v1${path}`, {
      ...init,
      headers: { authorization: `Bearer ${t2}`, "content-type": "application/json", ...init?.headers },
    });
    if (!retry.ok) throw new Error((await retry.json().catch(() => ({}))).error ?? `agent ${retry.status}`);
    return retry.json() as Promise<T>;
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `agent ${res.status}`);
  return res.json() as Promise<T>;
}

export const agent = {
  async models(): Promise<{ providers: AgentProviderInfo[]; defaultModel: string | null }> {
    return api("/models");
  },

  async setProviderKey(providerId: string, apiKey: string): Promise<void> {
    await api(`/providers/${providerId}`, { method: "PUT", body: JSON.stringify({ apiKey }) });
  },

  async setDefaultModel(model: string): Promise<void> {
    await api("/config", { method: "PUT", body: JSON.stringify({ model }) });
  },

  async createSession(): Promise<string> {
    const { id } = await api<{ id: string }>("/sessions", { method: "POST" });
    return id;
  },

  async send(sessionId: string, text: string, model: string, context?: string): Promise<void> {
    await api(`/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text, model, context }),
    });
  },

  async abort(sessionId: string): Promise<void> {
    await api(`/sessions/${sessionId}/abort`, { method: "POST" });
  },

  /** Attach to the session's SSE stream. Returns a disposer. */
  async stream(sessionId: string, onEvent: (e: AgentEvent) => void): Promise<() => void> {
    const { port, token } = await info();
    const es = new EventSource(`http://127.0.0.1:${port}/v1/sessions/${sessionId}/stream?token=${token}`);
    es.onmessage = (ev) => {
      try {
        onEvent(JSON.parse(ev.data) as AgentEvent);
      } catch {
        // Ignore malformed frames.
      }
    };
    return () => es.close();
  },
};
