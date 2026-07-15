import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
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
  | { type: "title-changed"; title: string }
  | { type: "compacted"; folded: number }
  | { type: "error"; message: string }
  | { type: "status"; state: "idle" | "thinking" | "streaming" };

/** A render-ready conversation item, rebuilt from the transcript. */
export type ReplayItem =
  | { kind: "msg"; id: string; role: "user" | "assistant"; content: string; error?: boolean }
  | { kind: "tool"; id: string; name: string; args: unknown; done: true; ok: boolean; summary?: string }
  | { kind: "perm"; id: string; tool: string; summary: string; detail: string; result?: boolean };

export type SessionMeta = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
};

const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;

export class Session {
  readonly id: string;
  readonly createdAt: number;
  title = "New chat";
  messages: ModelMessage[] = [];
  running = false;
  abort: AbortController | null = null;
  /** Connection granted to this session's tools (set per message). */
  connectionId: string | null = null;
  private listeners = new Set<(e: AgentEvent) => void>();
  private pendingPermissions = new Map<string, (allow: boolean) => void>();
  private readonly transcriptFile: string;

  constructor(dataDir: string, id?: string, createdAt?: number) {
    this.id = id ?? randomUUID();
    this.createdAt = createdAt ?? Date.now();
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

  /** Set once from the first user message; UI is notified. */
  autoTitle(text: string) {
    if (this.title !== "New chat") return;
    const t = text.replace(/\s+/g, " ").trim();
    this.title = t.length > 44 ? `${t.slice(0, 44)}…` : t || "New chat";
    this.emit({ type: "title-changed", title: this.title });
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

  /** Rebuild render-ready items from the transcript (for session switch). */
  replay(): ReplayItem[] {
    const items: ReplayItem[] = [];
    let raw = "";
    try {
      raw = readFileSync(this.transcriptFile, "utf8");
    } catch {
      return items;
    }
    const permIndex = new Map<string, number>();
    let n = 0;
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      let e: Record<string, unknown>;
      try {
        e = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      n += 1;
      switch (e.kind) {
        case "user":
          items.push({ kind: "msg", id: `u${n}`, role: "user", content: String(e.text ?? "") });
          break;
        case "assistant":
          if (e.text) items.push({ kind: "msg", id: `a${n}`, role: "assistant", content: String(e.text) });
          break;
        case "error":
          items.push({ kind: "msg", id: `e${n}`, role: "assistant", content: String(e.error ?? "error"), error: true });
          break;
        case "tool.call":
          items.push({ kind: "tool", id: `t${n}`, name: String(e.name ?? "tool"), args: e.args, done: true, ok: true });
          break;
        case "tool.error": {
          items.push({ kind: "tool", id: `t${n}`, name: String(e.name ?? "tool"), args: {}, done: true, ok: false, summary: String(e.error ?? "") });
          break;
        }
        case "permission.ask":
          permIndex.set(String(e.id), items.length);
          items.push({
            kind: "perm",
            id: String(e.id),
            tool: String(e.tool ?? "run_sql"),
            summary: String(e.summary ?? ""),
            detail: String(e.detail ?? ""),
          });
          break;
        case "permission.answer": {
          const idx = permIndex.get(String(e.id));
          if (idx !== undefined) (items[idx] as Extract<ReplayItem, { kind: "perm" }>).result = Boolean(e.allow);
          break;
        }
        default:
          break;
      }
    }
    return items;
  }

  /** Rebuild the model conversation from the transcript (context continuity). */
  restoreMessages() {
    for (const item of this.replay()) {
      if (item.kind !== "msg" || item.error) continue;
      this.messages.push({ role: item.role, content: item.content });
    }
  }

  deleteTranscript() {
    try {
      if (existsSync(this.transcriptFile)) unlinkSync(this.transcriptFile);
    } catch {
      // best-effort
    }
  }
}

export class SessionStore {
  private sessions = new Map<string, Session>();
  private readonly indexFile: string;
  private index: SessionMeta[] = [];

  constructor(private readonly dataDir: string) {
    this.indexFile = join(dataDir, "sessions", "index.json");
    try {
      this.index = JSON.parse(readFileSync(this.indexFile, "utf8")) as SessionMeta[];
    } catch {
      this.index = [];
    }
  }

  private saveIndex() {
    try {
      mkdirSync(join(this.dataDir, "sessions"), { recursive: true });
      writeFileSync(this.indexFile, JSON.stringify(this.index));
    } catch {
      // best-effort
    }
  }

  /** Called by the loop after every turn to keep list metadata fresh. */
  touch(session: Session) {
    const meta = this.index.find((m) => m.id === session.id);
    const count = session.messages.length;
    if (meta) {
      meta.title = session.title;
      meta.updatedAt = Date.now();
      meta.messageCount = count;
    } else {
      this.index.unshift({
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: Date.now(),
        messageCount: count,
      });
    }
    this.saveIndex();
  }

  list(): SessionMeta[] {
    return [...this.index].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  create(): Session {
    const s = new Session(this.dataDir);
    this.sessions.set(s.id, s);
    return s;
  }

  /** Get a live session, reviving it from disk if it's in the index. */
  get(id: string): Session | undefined {
    const live = this.sessions.get(id);
    if (live) return live;
    const meta = this.index.find((m) => m.id === id);
    if (!meta) return undefined;
    const s = new Session(this.dataDir, meta.id, meta.createdAt);
    s.title = meta.title;
    s.restoreMessages();
    this.sessions.set(s.id, s);
    return s;
  }

  delete(id: string): boolean {
    const s = this.get(id);
    if (s) {
      s.abort?.abort();
      s.deleteTranscript();
    }
    this.sessions.delete(id);
    const before = this.index.length;
    this.index = this.index.filter((m) => m.id !== id);
    this.saveIndex();
    return this.index.length < before || Boolean(s);
  }
}
