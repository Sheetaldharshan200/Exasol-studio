import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ModelMessage } from "ai";

/** SSE event pushed to attached clients. */
export type AgentEvent =
  | { type: "text-delta"; messageId: string; delta: string }
  | { type: "reasoning-delta"; messageId: string; delta: string }
  | { type: "message-start"; messageId: string; role: "assistant" }
  | { type: "message-done"; messageId: string; usage?: { inputTokens?: number; outputTokens?: number } }
  | { type: "error"; message: string }
  | { type: "status"; state: "idle" | "thinking" | "streaming" };

export class Session {
  readonly id = randomUUID();
  readonly createdAt = Date.now();
  messages: ModelMessage[] = [];
  running = false;
  abort: AbortController | null = null;
  private listeners = new Set<(e: AgentEvent) => void>();
  private readonly transcriptFile: string;

  constructor(dataDir: string) {
    const dir = join(dataDir, "sessions");
    mkdirSync(dir, { recursive: true });
    this.transcriptFile = join(dir, `${this.id}.jsonl`);
  }

  subscribe(fn: (e: AgentEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(e: AgentEvent) {
    for (const fn of this.listeners) fn(e);
  }

  /** Append an audit record to the JSONL transcript. */
  record(entry: Record<string, unknown>) {
    try {
      appendFileSync(this.transcriptFile, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
    } catch {
      // Transcripts must never crash the loop.
    }
  }
}

export class SessionStore {
  private sessions = new Map<string, Session>();

  constructor(private readonly dataDir: string) {}

  create(): Session {
    const s = new Session(this.dataDir);
    this.sessions.set(s.id, s);
    return s;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }
}
