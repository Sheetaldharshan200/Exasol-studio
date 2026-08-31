import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AIMessage, HumanMessage, mapChatMessagesToStoredMessages, mapStoredMessagesToChatMessages, type BaseMessage, type StoredMessage } from "@langchain/core/messages";

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
  | { type: "user-message"; text: string }
  | { type: "dashboard-saved"; id: string; title: string }
  | { type: "artifact-created"; id: string; title: string }
  | { type: "compacted"; folded: number }
  | { type: "ui-request"; id: string; action: string; params: Record<string, unknown> }
  | { type: "ui-result"; id: string; ok: boolean; detail?: string }
  | { type: "error"; message: string }
  | { type: "status"; state: "idle" | "thinking" | "streaming" };

/** A render-ready conversation item, rebuilt from the transcript. */
export type ReplayItem =
  | { kind: "msg"; id: string; role: "user" | "assistant"; content: string; error?: boolean; attachments?: string[] }
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
  messages: BaseMessage[] = [];
  running = false;
  turnCount = 0;
  abort: AbortController | null = null;
  /** Connection granted to this session's tools (set per message). */
  connectionId: string | null = null;
  private listeners = new Set<(e: AgentEvent) => void>();
  private pendingPermissions = new Map<string, (allow: boolean) => void>();
  private pendingUi = new Map<string, (r: { ok: boolean; detail?: string }) => void>();
  readonly transcriptFile: string;
  private readonly checkpointFile: string;

  constructor(dataDir: string, id?: string, createdAt?: number) {
    this.id = id ?? randomUUID();
    this.createdAt = createdAt ?? Date.now();
    const dir = join(dataDir, "sessions");
    mkdirSync(dir, { recursive: true });
    this.transcriptFile = join(dir, `${this.id}.jsonl`);
    this.checkpointFile = join(dir, `${this.id}.turn.json`);
  }

  /**
   * Durable turn state: after every agent STEP the partial exchange is
   * snapshotted to disk. Tools have side effects (DDL ran, files loaded) —
   * if the process dies mid-turn, the work must not vanish from history.
   */
  checkpoint(userText: string, messages: BaseMessage[]) {
    try {
      writeFileSync(this.checkpointFile, JSON.stringify({ ts: Date.now(), userText, messages: mapChatMessagesToStoredMessages(messages) }));
    } catch {
      // Checkpointing must never break the turn.
    }
  }

  /** Turn ended normally (messages were persisted the regular way). */
  clearCheckpoint() {
    try {
      if (existsSync(this.checkpointFile)) unlinkSync(this.checkpointFile);
    } catch {
      // best-effort
    }
  }

  /**
   * Crash recovery: if a checkpoint survives, the previous turn died
   * mid-execution. Fold its REAL completed steps back into the message
   * history (with a note the model can act on), then consume the file.
   */
  recoverInterruptedTurn(): boolean {
    try {
      if (!existsSync(this.checkpointFile)) return false;
      const cp = JSON.parse(readFileSync(this.checkpointFile, "utf8")) as {
        userText?: string;
        messages?: StoredMessage[];
      };
      unlinkSync(this.checkpointFile);
      if (!cp.messages?.length) return false;
      const recovered = mapStoredMessagesToChatMessages(cp.messages);
      // The transcript replay usually restored the user message already —
      // only add it when it's genuinely missing (crash before any record).
      const lastRestored = this.messages.at(-1);
      const alreadyThere =
        lastRestored?._getType() === "human" && typeof lastRestored.content === "string" && lastRestored.content === cp.userText;
      if (!alreadyThere) this.messages.push(new HumanMessage(cp.userText ?? "(interrupted request)"));
      this.messages.push(...recovered);
      // A write may have been AWAITING APPROVAL when the process died — the
      // ask must survive the restart (LangGraph-style durable interrupt, but
      // safe: the model re-asks; nothing ever auto-executes on recovery).
      const pending = this.replay()
        .filter((i): i is Extract<ReplayItem, { kind: "perm" }> => i.kind === "perm")
        .filter((i) => i.result === undefined)
        .at(-1);
      this.messages.push(new HumanMessage(
          "[Recovered] The previous turn was interrupted mid-execution (the app closed). The tool steps above DID run — their side effects are real. When I ask something next, continue from that state; do not redo completed work." +
          (pending
            ? `\nA permission request was still awaiting the user's answer when the app closed: "${pending.summary}" — statement: ${pending.detail.slice(0, 400)}. It did NOT run. If it is still needed, ask the user and re-run it through run_sql on approval.`
            : ""),
      ));
      this.record({ kind: "turn.recovered", steps: cp.messages.length, pendingPermission: Boolean(pending) });
      return true;
    } catch {
      return false;
    }
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

  /** Ask the app UI to perform an action (pet/cursor drives it) and wait. */
  askUi(action: string, params: Record<string, unknown>): Promise<{ ok: boolean; detail?: string }> {
    const id = randomUUID();
    this.record({ kind: "ui.request", id, action, params });
    return new Promise((resolve) => {
      const timer = setTimeout(() => finish({ ok: false, detail: "timed out waiting for the app/user" }), 180_000);
      const onAbort = () => finish({ ok: false, detail: "aborted" });
      const finish = (r: { ok: boolean; detail?: string }) => {
        clearTimeout(timer);
        this.abort?.signal.removeEventListener("abort", onAbort);
        this.pendingUi.delete(id);
        this.record({ kind: "ui.result", id, ...r });
        this.emit({ type: "ui-result", id, ok: r.ok, detail: r.detail });
        resolve(r);
      };
      this.pendingUi.set(id, finish);
      this.abort?.signal.addEventListener("abort", onAbort, { once: true });
      this.emit({ type: "ui-request", id, action, params });
    });
  }

  answerUi(id: string, ok: boolean, detail?: string): boolean {
    const finish = this.pendingUi.get(id);
    if (!finish) return false;
    finish({ ok, detail });
    return true;
  }

  answerPermission(id: string, allow: boolean): boolean {
    const finish = this.pendingPermissions.get(id);
    if (!finish) return false;
    finish(allow);
    return true;
  }

  /**
   * Time-travel one step: drop the last user↔assistant exchange from the
   * model's context so the next message retries from the earlier state.
   * (Side effects that already ran are NOT undone — the transcript keeps
   * the full audit trail.)
   */
  undoLastExchange(): boolean {
    const lastUser = this.messages.map((m) => m._getType()).lastIndexOf("human");
    if (lastUser < 0) return false;
    this.messages.length = lastUser;
    this.record({ kind: "undo" });
    return true;
  }

  /** Raw transcript text (for fork/copy operations). */
  transcriptRaw(): string {
    try {
      return readFileSync(this.transcriptFile, "utf8");
    } catch {
      return "";
    }
  }

  /**
   * Industry-standard "revert to here": cut the transcript just BEFORE the
   * userIndex-th user message (0-based) and rebuild the model context from
   * what remains. Returns the removed user text so the UI can put it back
   * into the composer for editing.
   */
  truncateAtUser(userIndex: number): string | null {
    const lines = this.transcriptRaw().split("\n").filter(Boolean);
    let count = -1;
    let cut = -1;
    let removed: string | null = null;
    for (let i = 0; i < lines.length; i++) {
      try {
        const e = JSON.parse(lines[i]) as { kind?: string; text?: string };
        if (e.kind === "user") {
          count++;
          if (count === userIndex) {
            cut = i;
            removed = String(e.text ?? "");
            break;
          }
        }
      } catch {
        /* skip malformed line */
      }
    }
    if (cut < 0) return null;
    writeFileSync(this.transcriptFile, lines.slice(0, cut).join("\n") + (cut ? "\n" : ""));
    this.messages = [];
    this.restoreMessages();
    this.record({ kind: "revert", userIndex });
    return removed;
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
          items.push({
            kind: "msg",
            id: `u${n}`,
            role: "user",
            content: String(e.text ?? ""),
            ...(Array.isArray(e.attachments) && e.attachments.length
              ? { attachments: (e.attachments as { name?: string }[]).map((a) => String(a.name ?? "")).filter(Boolean) }
              : {}),
          });
          break;
        case "assistant":
          if (e.text) items.push({ kind: "msg", id: `a${n}`, role: "assistant", content: String(e.text) });
          break;
        case "error":
          items.push({ kind: "msg", id: `e${n}`, role: "assistant", content: String(e.error ?? "error"), error: true });
          break;
        case "turn.recovered":
          items.push({
            kind: "msg",
            id: `r${n}`,
            role: "assistant",
            content: "_Recovered an interrupted turn — the steps above completed before the app closed, and their results are preserved._",
          });
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
      this.messages.push(item.role === "user" ? new HumanMessage(item.content) : new AIMessage(item.content));
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

type SessionHit = { id: string; title: string; updatedAt: number; snippet: string; score: number };

export class SessionStore {
  private sessions = new Map<string, Session>();
  private readonly indexFile: string;
  private index: SessionMeta[] = [];

  // Plain field (not a TS parameter property) so node --experimental-strip-types
  // can import this file — the eval harness depends on it.
  private readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
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

  /**
   * Semantic search over PAST sessions (jcode-style session RAG) — embeddings
   * only, no LLM. Each session is represented by its title + first user ask;
   * results let the agent recall "we did this before". Cached per session by
   * updatedAt so re-embedding only happens when a session changes.
   */
  async search(query: string, currentId: string | null, k = 4): Promise<SessionHit[]> {
    const { embed, embedOne, cosine } = await import("./embed.ts");
    const idxPath = join(this.dataDir, "sessions", "search-index.json");
    let cache: Record<string, { at: number; snippet: string; vec: number[] }> = {};
    try {
      cache = JSON.parse(readFileSync(idxPath, "utf8"));
    } catch {
      cache = {};
    }
    const metas = this.index.filter((m) => m.id !== currentId).slice(0, 80);
    const stale = metas.filter((m) => !cache[m.id] || cache[m.id].at !== m.updatedAt);
    if (stale.length) {
      const snippets = stale.map((m) => {
        const s = this.get(m.id);
        const firstUser = s?.replay().find((it) => it.kind === "msg" && it.role === "user");
        const snip = firstUser && firstUser.kind === "msg" ? firstUser.content : "";
        return `${m.title}. ${snip}`.slice(0, 400);
      });
      const vecs = await embed(snippets);
      stale.forEach((m, i) => (cache[m.id] = { at: m.updatedAt, snippet: snippets[i], vec: vecs[i] }));
      for (const id of Object.keys(cache)) if (!this.index.some((m) => m.id === id)) delete cache[id];
      try {
        writeFileSync(idxPath, JSON.stringify(cache));
      } catch {
        /* best-effort */
      }
    }
    const qv = await embedOne(query);
    return metas
      .map((m) => ({ id: m.id, title: m.title, updatedAt: m.updatedAt, snippet: cache[m.id]?.snippet ?? m.title, score: cosine(qv, cache[m.id]?.vec ?? []) }))
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  list(): SessionMeta[] {
    return [...this.index].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  create(): Session {
    const s = new Session(this.dataDir);
    this.sessions.set(s.id, s);
    return s;
  }

  /**
   * Fork a session at the userIndex-th user message: the new session gets the
   * history BEFORE that message (transcript copy) and a live model context
   * rebuilt from it — a true branch, not a UI illusion.
   */
  fork(id: string, userIndex: number): Session | null {
    const src = this.get(id);
    if (!src) return null;
    const lines = src.transcriptRaw().split("\n").filter(Boolean);
    let count = -1;
    let cut = lines.length;
    for (let i = 0; i < lines.length; i++) {
      try {
        const e = JSON.parse(lines[i]) as { kind?: string };
        if (e.kind === "user") {
          count++;
          if (count === userIndex) {
            cut = i;
            break;
          }
        }
      } catch {
        /* skip */
      }
    }
    const s = this.create();
    writeFileSync(s.transcriptFile, lines.slice(0, cut).join("\n") + (cut ? "\n" : ""));
    s.title = `${src.title || "Chat"} (fork)`;
    s.restoreMessages();
    this.touch(s);
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
    s.recoverInterruptedTurn(); // fold in work from a turn that died mid-run
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
