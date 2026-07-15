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
  | { type: "tool-start"; callId: string; name: string; args: unknown }
  | { type: "tool-end"; callId: string; name: string; ok: boolean; summary?: string }
  | { type: "permission-ask"; id: string; tool: string; summary: string; detail: string }
  | { type: "permission-result"; id: string; allow: boolean }
  | { type: "error"; message: string }
  | { type: "status"; state: "idle" | "thinking" | "streaming" };

const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;

export class Session {
  readonly id = randomUUID();
  readonly createdAt = Date.now();
  messages: ModelMessage[] = [];
  running = false;
  abort: AbortController | null = null;
  /** Connection granted to this session's tools (set per message). */
  connectionId: string | null = null;
  private listeners = new Set<(e: AgentEvent) => void>();
  private pendingPermissions = new Map<string, (allow: boolean) => void>();
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

  /**
   * Human-in-the-loop gate: emit a permission-ask event and wait for the
   * client to answer (or time out → deny). Abort also denies.
   */
  askPermission(req: { tool: string; summary: string; detail: string }): Promise<boolean> {
    const id = randomUUID();
    this.record({ kind: "permission.ask", id, ...req });
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => finish(false), PERMISSION_TIMEOUT_MS);
      const onAbort = () => finish(false);
      const finish = (allow: boolean) => {
        clearTimeout(timer);
        this.abort?.signal.removeEventListener("abort", onAbort);
        this.pendingPermissions.delete(id);
        this.record({ kind: "permission.answer", id, allow });
        this.emit({ type: "permission-result", id, allow });
        resolve(allow);
      };
      this.pendingPermissions.set(id, finish);
      this.abort?.signal.addEventListener("abort", onAbort, { once: true });
      this.emit({ type: "permission-ask", id, tool: req.tool, summary: req.summary, detail: req.detail });
    });
  }

  answerPermission(id: string, allow: boolean): boolean {
    const finish = this.pendingPermissions.get(id);
    if (!finish) return false;
    finish(allow);
    return true;
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
