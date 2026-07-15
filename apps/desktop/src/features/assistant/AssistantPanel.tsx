import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Cpu,
  FileSearch,
  Gauge,
  History,
  Loader2,
  PanelRightClose,
  Plus,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  Square,
  Table2,
  Trash2,
  Wand2,
  Wrench,
  X,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import ReactMarkdown from "react-markdown";
import { AgentMark } from "@/components/studio/AgentMark";
import { ModelPicker } from "@/features/assistant/ModelPicker";
import { agent, type AgentEvent, type AgentProviderInfo, type ReplayItem, type SessionMeta } from "@/lib/agent-client";
import { EV_AI_PROVIDERS_CHANGED, openAiProvidersWindow } from "@/lib/ai-window";
import { sessionBus } from "@/lib/session-bus";
import { errorMessage } from "@/lib/ipc";
import { cn } from "@/lib/utils";

type ChatItem =
  | { kind: "msg"; id: string; role: "user" | "assistant"; content: string; error?: boolean; streaming?: boolean }
  | { kind: "tool"; id: string; name: string; args: unknown; done: boolean; ok?: boolean; summary?: string }
  | { kind: "perm"; id: string; tool: string; summary: string; detail: string; result?: boolean }
  | { kind: "note"; id: string; text: string };

type SlashCommand = {
  cmd: string;
  desc: string;
  kind: "run" | "insert" | "clear";
  payload?: string;
};

const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: "/explain", desc: "Explain the SQL in my editor", kind: "run", payload: "Explain the SQL in my editor, step by step." },
  { cmd: "/optimize", desc: "Suggest optimizations for Exasol", kind: "run", payload: "Suggest ways to optimize the SQL in my editor for Exasol." },
  { cmd: "/fix", desc: "Find and fix errors", kind: "run", payload: "Find and fix any errors in the SQL in my editor." },
  { cmd: "/generate", desc: "Generate SQL from a description", kind: "insert", payload: "Generate an Exasol SQL query that " },
  { cmd: "/tables", desc: "List tables in the current schema", kind: "run", payload: "List the tables in the current schema, one line each." },
  { cmd: "/clear", desc: "Clear the conversation", kind: "clear" },
];

const MENTIONS: { at: string; desc: string }[] = [
  { at: "@schema", desc: "Current schema" },
  { at: "@editor", desc: "Full editor SQL" },
  { at: "@selection", desc: "Selected SQL" },
  { at: "@history", desc: "Recent queries" },
];

const SUGGESTIONS: { icon: typeof Wand2; label: string; kind: "run" | "insert"; payload: string }[] = [
  { icon: Wand2, label: "Generate SQL", kind: "insert", payload: "Generate an Exasol SQL query that " },
  { icon: FileSearch, label: "Explain my SQL", kind: "run", payload: "Explain the SQL in my editor, step by step." },
  { icon: Gauge, label: "Optimize a query", kind: "run", payload: "Suggest ways to optimize the SQL in my editor for Exasol." },
  { icon: Table2, label: "List my tables", kind: "run", payload: "List the tables in the current schema, one line each." },
];

export function AssistantPanel({
  contextSummary,
  editorSql,
  pendingPrompt,
  connectionId,
  onClose,
  onUiAction,
  onDashboardSaved,
  onArtifact,
}: {
  contextSummary: string;
  editorSql: string;
  /** An external prompt (e.g. "AI explain plan") to send automatically. */
  pendingPrompt?: { text: string; nonce: number } | null;
  /** Active connection profile id — granted to the agent for tool use. */
  connectionId?: string | null;
  /** Hide the AI side panel. */
  onClose?: () => void;
  /** Perform a UI action for the agent (pet/cursor drives it). */
  onUiAction?: (action: string, params: Record<string, unknown>) => Promise<{ ok: boolean; detail?: string }>;
  /** Open a dashboard the agent just saved. */
  onDashboardSaved?: (id: string) => void;
  /** Open an HTML artifact the agent rendered. */
  onArtifact?: (id: string, title: string) => void;
}) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [providers, setProviders] = useState<AgentProviderInfo[]>([]);
  const [model, setModel] = useState<string>("");
  const [showPicker, setShowPicker] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [menuIndex, setMenuIndex] = useState(0);
  const [title, setTitle] = useState("New chat");
  const [sessionList, setSessionList] = useState<SessionMeta[]>([]);
  const [showSessions, setShowSessions] = useState(false);
  const sessionsRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionRef = useRef<string | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const uiActionRef = useRef(onUiAction);
  uiActionRef.current = onUiAction;
  const onDashboardSavedRef = useRef(onDashboardSaved);
  onDashboardSavedRef.current = onDashboardSaved;
  const onArtifactRef = useRef(onArtifact);
  onArtifactRef.current = onArtifact;

  const refreshProviders = useCallback(async () => {
    try {
      const { providers: list, defaultModel } = await agent.models();
      setProviders(list);
      setAgentError(null);
      setModel((cur) => {
        if (cur) return cur;
        if (defaultModel) return defaultModel;
        // Prefer a running local model, then any configured cloud model.
        const local = list.find((p) => p.kind === "local" && p.running && p.models.length);
        if (local) return `${local.id}/${local.models[0].id}`;
        const cloud = list.find((p) => p.kind === "cloud" && p.configured && p.models.length);
        if (cloud) return `${cloud.id}/${cloud.models[0].id}`;
        return "";
      });
    } catch (err) {
      setAgentError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void refreshProviders();
    const un = listen(EV_AI_PROVIDERS_CHANGED, () => void refreshProviders());
    return () => {
      disposeRef.current?.();
      void un.then((f) => f());
    };
  }, [refreshProviders]);

  // Follow sessions created elsewhere (the pet): switch this panel to them.
  useEffect(
    () =>
      sessionBus.on((sid) => {
        if (sid && sid !== sessionRef.current) void switchSession(sid);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Hand the active connection to the agent (password decrypts Rust-side).
  useEffect(() => {
    if (connectionId) void agent.grantConnection(connectionId).catch(() => undefined);
  }, [connectionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [items, sending]);

  // Dismiss popovers on outside click or Escape.
  useEffect(() => {
    if (!showPicker && !showSessions) return;
    const onDown = (e: MouseEvent) => {
      if (showPicker && pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false);
      if (showSessions && sessionsRef.current && !sessionsRef.current.contains(e.target as Node)) setShowSessions(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowPicker(false);
        setShowSessions(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showPicker, showSessions]);

  const handleEvent = useCallback((e: AgentEvent) => {
    if (e.type === "message-start") {
      setItems((m) =>
        m.some((it) => it.kind === "msg" && it.id === e.messageId)
          ? m
          : [...m, { kind: "msg", id: e.messageId, role: "assistant", content: "", streaming: true }],
      );
    } else if (e.type === "text-delta") {
      setItems((m) => {
        if (!m.some((it) => it.kind === "msg" && it.id === e.messageId)) {
          return [...m, { kind: "msg", id: e.messageId, role: "assistant", content: e.delta, streaming: true }];
        }
        return m.map((it) =>
          it.kind === "msg" && it.id === e.messageId ? { ...it, content: it.content + e.delta } : it,
        );
      });
    } else if (e.type === "tool-start") {
      setItems((m) =>
        m.some((it) => it.kind === "tool" && it.id === e.callId)
          ? m.map((it) => (it.kind === "tool" && it.id === e.callId ? { ...it, args: e.args ?? it.args } : it))
          : [...m, { kind: "tool", id: e.callId, name: e.name, args: e.args, done: false }],
      );
    } else if (e.type === "tool-end") {
      setItems((m) =>
        m.map((it) =>
          it.kind === "tool" && it.id === e.callId ? { ...it, done: true, ok: e.ok, summary: e.summary } : it,
        ),
      );
    } else if (e.type === "permission-ask") {
      setItems((m) => [...m, { kind: "perm", id: e.id, tool: e.tool, summary: e.summary, detail: e.detail }]);
    } else if (e.type === "permission-result") {
      setItems((m) => (m.map((it) => (it.kind === "perm" && it.id === e.id ? { ...it, result: e.allow } : it))));
    } else if (e.type === "user-message") {
      // Asks can originate from any view (the pet) — show them here too,
      // deduped against our own local append.
      setItems((m) => {
        const lastUser = [...m].reverse().find((it) => it.kind === "msg" && it.role === "user");
        if (lastUser && lastUser.kind === "msg" && lastUser.content === e.text) return m;
        return [...m, { kind: "msg", id: `u-${Date.now()}`, role: "user", content: e.text }];
      });
      setSending(true);
    } else if (e.type === "dashboard-saved") {
      onDashboardSavedRef.current?.(e.id);
    } else if (e.type === "artifact-created") {
      onArtifactRef.current?.(e.id, e.title);
    } else if (e.type === "title-changed") {
      setTitle(e.title);
    } else if (e.type === "ui-request") {
      void (async () => {
        const sid = sessionRef.current;
        if (!sid) return;
        const r = (await uiActionRef.current?.(e.action, e.params).catch((err) => ({
          ok: false as const,
          detail: errorMessage(err),
        }))) ?? { ok: false as const, detail: "UI control is unavailable in this window" };
        await agent.answerUi(sid, e.id, r.ok, r.detail).catch(() => undefined);
      })();
    } else if (e.type === "compacted") {
      setItems((m) => [
        ...m,
        { kind: "note", id: `n-${Date.now()}`, text: `Context compacted — ${e.folded} earlier messages summarized` },
      ]);
    } else if (e.type === "message-done") {
      setItems((m) => m.map((it) => (it.kind === "msg" ? { ...it, streaming: false } : it)));
      setSending(false);
    } else if (e.type === "error") {
      setItems((m) => [...m, { kind: "msg", id: `e-${Date.now()}`, role: "assistant", content: e.message, error: true }]);
      setSending(false);
    }
  }, []);

  async function ensureSession(): Promise<string> {
    if (sessionRef.current) return sessionRef.current;
    const id = await agent.createSession();
    sessionRef.current = id;
    disposeRef.current = await agent.stream(id, handleEvent);
    sessionBus.set(id);
    return id;
  }

  function newChat() {
    setItems([]);
    setInput("");
    setTitle("New chat");
    disposeRef.current?.();
    disposeRef.current = null;
    sessionRef.current = null;
    setSending(false);
    setShowSessions(false);
    sessionBus.set(null);
  }

  async function openSessionsMenu() {
    setShowSessions((v) => !v);
    setShowPicker(false);
    try {
      setSessionList(await agent.listSessions());
    } catch {
      setSessionList([]);
    }
  }

  async function switchSession(id: string) {
    if (id === sessionRef.current) {
      setShowSessions(false);
      return;
    }
    try {
      const { title: t, items: replay } = await agent.sessionItems(id);
      disposeRef.current?.();
      sessionRef.current = id;
      disposeRef.current = await agent.stream(id, handleEvent);
      setItems(replay as ReplayItem[] as ChatItem[]);
      setTitle(t);
      setSending(false);
      sessionBus.set(id);
    } catch (err) {
      setAgentError(errorMessage(err));
    } finally {
      setShowSessions(false);
    }
  }

  async function removeSession(id: string) {
    await agent.deleteSession(id).catch(() => undefined);
    setSessionList((l) => l.filter((s) => s.id !== id));
    if (id === sessionRef.current) newChat();
  }

  // Detect a "/" command at the start or a trailing "@" mention token.
  const trigger = useMemo(() => {
    if (/^\/[a-z]*$/i.test(input)) {
      return { type: "slash" as const, token: input.toLowerCase() };
    }
    const at = input.match(/(^|\s)(@[a-z:_]*)$/i);
    if (at) return { type: "mention" as const, token: at[2].toLowerCase() };
    return null;
  }, [input]);

  const menuItems = useMemo(() => {
    if (!trigger) return [];
    if (trigger.type === "slash") {
      return SLASH_COMMANDS.filter((c) => c.cmd.startsWith(trigger.token)).map((c) => ({
        key: c.cmd,
        title: c.cmd,
        desc: c.desc,
      }));
    }
    return MENTIONS.filter((m) => m.at.startsWith(trigger.token)).map((m) => ({
      key: m.at,
      title: m.at,
      desc: m.desc,
    }));
  }, [trigger]);

  useEffect(() => setMenuIndex(0), [input]);

  // An external action (e.g. "AI explain plan") pushed a prompt to send.
  const lastNonce = useRef(0);
  useEffect(() => {
    if (pendingPrompt && pendingPrompt.nonce !== lastNonce.current) {
      lastNonce.current = pendingPrompt.nonce;
      void send(pendingPrompt.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt]);

  function applySlash(cmd: SlashCommand) {
    if (cmd.kind === "clear") {
      newChat();
      return;
    }
    if (cmd.kind === "run" && cmd.payload) {
      setInput("");
      void send(cmd.payload);
      return;
    }
    setInput(cmd.payload ?? "");
    inputRef.current?.focus();
  }

  function applyMention(at: string) {
    setInput((prev) => prev.replace(/(@[a-z:_]*)$/i, `${at} `));
    inputRef.current?.focus();
  }

  function pickMenu(key: string) {
    if (!trigger) return;
    if (trigger.type === "slash") {
      const cmd = SLASH_COMMANDS.find((c) => c.cmd === key);
      if (cmd) applySlash(cmd);
    } else {
      applyMention(key);
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    if (!model) {
      void openAiProvidersWindow();
      return;
    }
    setItems((m) => [...m, { kind: "msg", id: `u-${Date.now()}`, role: "user", content: trimmed }]);
    setInput("");
    setSending(true);

    const context = [contextSummary, editorSql ? `Editor SQL:\n${editorSql}` : ""]
      .filter(Boolean)
      .join("\n\n");

    try {
      const sid = await ensureSession();
      await agent.send(sid, trimmed, model, context || undefined, connectionId);
    } catch (err) {
      setItems((m) => [
        ...m,
        { kind: "msg", id: `e-${Date.now()}`, role: "assistant", content: errorMessage(err), error: true },
      ]);
      setSending(false);
    }
  }

  async function stop() {
    if (sessionRef.current) await agent.abort(sessionRef.current).catch(() => undefined);
  }

  async function answerPermission(id: string, allow: boolean) {
    if (!sessionRef.current) return;
    await agent.answerPermission(sessionRef.current, id, allow).catch(() => undefined);
  }

  function pickModel(ref: string) {
    setModel(ref);
    setShowPicker(false);
    void agent.setDefaultModel(ref).catch(() => undefined);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (menuItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMenuIndex((i) => (i + 1) % menuItems.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMenuIndex((i) => (i - 1 + menuItems.length) % menuItems.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickMenu(menuItems[menuIndex].key);
        return;
      }
      if (e.key === "Escape") {
        setInput("");
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  const modelLabel = useMemo(() => {
    if (!model) return "Choose model";
    const [pid, ...rest] = model.split("/");
    const mid = rest.join("/");
    const p = providers.find((x) => x.id === pid);
    return p?.models.find((m) => m.id === mid)?.name ?? mid;
  }, [model, providers]);

  const isLocalModel =
    model.startsWith("builtin/") || model.startsWith("ollama/") || model.startsWith("lmstudio/") || model.startsWith("llamacpp/");
  const ollama = providers.find((p) => p.id === "ollama");
  const thinking = sending && !items.some((it) => it.kind === "msg" && it.streaming && it.content);

  return (
    <aside className="flex h-full min-w-0 flex-col border-l border-border bg-panel">
      {/* ── Header ── */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2" ref={sessionsRef}>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <AgentMark className="h-4 w-4" active={sending} />
          </span>
          <div className="relative min-w-0">
            <button
              onClick={() => void openSessionsMenu()}
              className="flex max-w-[180px] items-center gap-1 rounded-md px-1 py-0.5 text-[13px] font-semibold text-foreground hover:bg-secondary"
              title="Chats"
            >
              <span className="truncate">{title}</span>
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            </button>
            {showSessions ? (
              <div className="absolute left-0 top-full z-30 mt-1 flex max-h-80 w-72 flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
                <button
                  onClick={newChat}
                  className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-[12px] font-medium text-foreground hover:bg-secondary/60"
                >
                  <Plus className="h-3.5 w-3.5 text-primary" /> New chat
                </button>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {sessionList.length === 0 ? (
                    <p className="px-3 py-3 text-[11.5px] text-muted-foreground">No previous chats yet.</p>
                  ) : (
                    sessionList.map((sess) => (
                      <div
                        key={sess.id}
                        className={cn(
                          "group flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left",
                          sess.id === sessionRef.current ? "bg-secondary" : "hover:bg-secondary/60",
                        )}
                        onClick={() => void switchSession(sess.id)}
                      >
                        <History className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] text-foreground">{sess.title}</div>
                          <div className="text-[10px] text-muted-foreground">{relTime(sess.updatedAt)}</div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void removeSession(sess.id);
                          }}
                          className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground group-hover:flex hover:text-destructive"
                          aria-label="Delete chat"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            onClick={newChat}
            aria-label="New chat"
            title="New chat"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            onClick={() => void openAiProvidersWindow()}
            aria-label="AI providers"
            title="AI providers"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </button>
          {onClose ? (
            <button
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              onClick={onClose}
              aria-label="Hide AI panel"
              title="Hide panel"
            >
              <PanelRightClose className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Conversation ── */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {agentError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-foreground">
            {agentError}
          </div>
        ) : null}
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-4 pb-10 text-center">
            <div className="agent-hero-glow mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <AgentMark className="h-7 w-7" />
            </div>
            <p className="text-[14.5px] font-semibold text-foreground">Ask your data anything</p>
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              SQL generation, tuning and answers — grounded in Exasol.
              {ollama?.running ? " Running on your local models." : ""}
            </p>
            <div className="mt-4 grid w-full max-w-[260px] grid-cols-2 gap-1.5">
              {SUGGESTIONS.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.label}
                    onClick={() => {
                      if (s.kind === "run") void send(s.payload);
                      else {
                        setInput(s.payload);
                        inputRef.current?.focus();
                      }
                    }}
                    className="flex flex-col items-start gap-1.5 rounded-xl border border-border bg-panel/60 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-secondary/50"
                  >
                    <Icon className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[11px] font-medium leading-tight text-foreground">{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          clusterItems(items).map((c) =>
            c.kind === "cluster" ? (
              <StepCluster key={c.id} items={c.items} />
            ) : c.item.kind === "note" ? (
              <div key={c.item.id} className="flex items-center gap-2 py-0.5">
                <span className="h-px flex-1 bg-border" />
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{c.item.text}</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            ) : (
              <Bubble key={c.item.id} message={c.item} />
            ),
          )
        )}
        {thinking ? (
          <div className="flex items-center gap-2 px-0.5 text-xs text-muted-foreground">
            <AgentMark className="h-4 w-4 text-primary" active />
            <span className="agent-shimmer">Thinking…</span>
          </div>
        ) : null}
      </div>

      {/* ── Composer ── */}
      <div className="relative shrink-0 p-2.5 pt-0">
        {items
          .filter((it): it is Extract<ChatItem, { kind: "perm" }> => it.kind === "perm" && it.result === undefined)
          .slice(0, 1)
          .map((p) => (
            <div key={p.id} className="mb-1.5">
              <PermissionCard item={p} onAnswer={answerPermission} />
            </div>
          ))}
        {/* Slash / mention popup */}
        {menuItems.length > 0 ? (
          <div className="absolute bottom-full left-2.5 z-30 mb-1 w-[calc(100%-1.25rem)] overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
            <div className="border-b border-border px-2.5 py-1.5">
              <span className="eyebrow-muted">{trigger?.type === "slash" ? "Commands" : "Add context"}</span>
            </div>
            {menuItems.map((item, i) => (
              <button
                key={item.key}
                onMouseEnter={() => setMenuIndex(i)}
                onClick={() => pickMenu(item.key)}
                className={cn(
                  "flex w-full items-center gap-2 px-2.5 py-1.5 text-left",
                  i === menuIndex ? "bg-secondary" : "hover:bg-secondary/60",
                )}
              >
                <span className="font-mono text-[12px] font-medium text-primary">{item.title}</span>
                <span className="truncate text-[11px] text-muted-foreground">{item.desc}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-editor transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
          <textarea
            ref={inputRef}
            className="max-h-32 min-h-[40px] w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[13px] outline-none placeholder:text-muted-foreground"
            placeholder={model ? "Ask, or / for commands…" : "Pick a model to start…"}
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="flex items-center justify-between px-1.5 pb-1.5">
            {/* Model pill (opens upward) */}
            <div className="relative min-w-0" ref={pickerRef}>
              <button
                type="button"
                onClick={() => setShowPicker((s) => !s)}
                className="flex max-w-[190px] items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {isLocalModel ? <Cpu className="h-3 w-3 shrink-0 text-primary" /> : null}
                <span className="truncate font-mono">{modelLabel}</span>
                <ChevronDown className="h-2.5 w-2.5 shrink-0" />
              </button>
              {showPicker ? (
                <ModelPicker
                  providers={providers}
                  model={model}
                  onPick={pickModel}
                  onManage={() => {
                    setShowPicker(false);
                    void openAiProvidersWindow();
                  }}
                  onRefresh={() => void refreshProviders()}
                />
              ) : null}
            </div>

            {sending ? (
              <button
                type="button"
                onClick={() => void stop()}
                aria-label="Stop generating"
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
              >
                <Square className="h-3 w-3" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void send(input)}
                disabled={!input.trim()}
                aria-label="Send"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all hover:bg-primary/85 disabled:opacity-35"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

function relTime(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

type Cluster =
  | { kind: "item"; item: Extract<ChatItem, { kind: "msg" | "note" }> }
  | { kind: "cluster"; id: string; items: Extract<ChatItem, { kind: "tool" | "perm" }>[] };

/** Group consecutive tool/permission items into one visual "steps" block. */
function clusterItems(items: ChatItem[]): Cluster[] {
  const out: Cluster[] = [];
  for (const it of items) {
    if (it.kind === "msg" || it.kind === "note") {
      out.push({ kind: "item", item: it });
    } else {
      const last = out[out.length - 1];
      if (last && last.kind === "cluster") last.items.push(it);
      else out.push({ kind: "cluster", id: it.id, items: [it] });
    }
  }
  return out;
}

function StepCluster({
  items,
}: {
  items: Extract<ChatItem, { kind: "tool" | "perm" }>[];
}) {
  const [expanded, setExpanded] = useState(false);
  const active = items.some((it) => (it.kind === "tool" ? !it.done : it.result === undefined));
  const steps = items.length;
  const current = [...items].reverse().find((it) => it.kind === "tool" && !it.done) as
    | Extract<ChatItem, { kind: "tool" }>
    | undefined;
  return (
    <div className="rounded-xl border border-border/70 bg-panel/40">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left"
      >
        <ChevronDown
          className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", !expanded && "-rotate-90")}
        />
        {active ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
        ) : (
          <Check className="h-3 w-3 shrink-0 text-primary" />
        )}
        <span className={cn("text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground", active && "agent-shimmer")}>
          {active ? (current ? TOOL_LABELS[current.name] ?? "Working" : "Working") : "Done"} · {steps} step{steps === 1 ? "" : "s"}
        </span>
      </button>
      {expanded ? (
        <div className="space-y-1 border-t border-border/50 p-1.5">
          {items.map((it) =>
            it.kind === "tool" ? (
              <ToolChip key={it.id} item={it} />
            ) : (
              <PermRow key={it.id} item={it} />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Compact record of an answered (or pending) permission inside the steps list. */
function PermRow({ item }: { item: Extract<ChatItem, { kind: "perm" }> }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-panel/60 px-2.5 py-1.5">
      <ShieldAlert className={cn("h-3 w-3 shrink-0", item.result === undefined ? "text-warning" : "text-muted-foreground")} />
      <span className="min-w-0 flex-1 truncate text-[11.5px] text-foreground">{item.summary}</span>
      <span
        className={cn(
          "shrink-0 rounded px-1.5 py-px text-[9px] font-medium uppercase",
          item.result === undefined
            ? "bg-warning/15 text-warning"
            : item.result
              ? "bg-primary/15 text-primary"
              : "bg-destructive/15 text-destructive",
        )}
      >
        {item.result === undefined ? "waiting" : item.result ? "allowed" : "denied"}
      </span>
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  list_schemas: "Listing schemas",
  list_tables: "Listing tables",
  describe_table: "Describing table",
  run_sql: "Running SQL",
  profile_query: "Profiling query",
  get_table_sample: "Sampling rows",
  remember_insight: "Saving insight",
  spawn_researcher: "Researching",
  kb_search: "Searching knowledge graph",
  kb_join_path: "Finding join path",
  kb_refresh: "Rebuilding knowledge graph",
  app_ui_locate: "Locating in app",
  ui_connect: "Connecting the app",
  ui_open: "Opening in app",
  ui_editor_insert: "Inserting SQL",
  dashboard_save: "Saving dashboard",
  render_artifact: "Building artifact",
  load_skill: "Reading skill",
  dashboard_list: "Listing dashboards",
  dashboard_get: "Reading dashboard",
  list_connections: "Checking connections",
};

function argPreview(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const o = args as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of ["schema", "table", "sql", "purpose"]) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) parts.push(k === "sql" ? v.replace(/\s+/g, " ").slice(0, 60) : v);
    if (parts.length >= 2) break;
  }
  return parts.join(" · ");
}

function ToolChip({ item }: { item: Extract<ChatItem, { kind: "tool" }> }) {
  const label = TOOL_LABELS[item.name] ?? item.name;
  const preview = argPreview(item.args);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-panel/60 px-2.5 py-1.5">
      {item.done ? (
        item.ok ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
        ) : (
          <X className="h-3.5 w-3.5 shrink-0 text-destructive" />
        )
      ) : (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
      )}
      <Wrench className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-[11.5px] text-foreground">
        {label}
        {preview ? <span className="text-muted-foreground"> — {preview}</span> : null}
      </span>
      {item.done && item.summary ? (
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{item.summary}</span>
      ) : null}
    </div>
  );
}

function PermissionCard({
  item,
  onAnswer,
}: {
  item: Extract<ChatItem, { kind: "perm" }>;
  onAnswer: (id: string, allow: boolean) => void;
}) {
  const pending = item.result === undefined;
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        pending ? "border-warning/50 bg-warning/8" : "border-border bg-panel/60",
      )}
    >
      <div className="flex items-center gap-1.5">
        <ShieldAlert className={cn("h-3.5 w-3.5", pending ? "text-warning" : "text-muted-foreground")} />
        <span className="text-[12px] font-semibold text-foreground">Approval needed</span>
        {!pending ? (
          <span
            className={cn(
              "ml-auto rounded px-1.5 py-px text-[9px] font-medium uppercase",
              item.result ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive",
            )}
          >
            {item.result ? "allowed" : "denied"}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-[11.5px] text-muted-foreground">{item.summary}</p>
      <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-editor px-2.5 py-2 font-mono text-[11px] leading-relaxed text-foreground">
        {item.detail}
      </pre>
      {pending ? (
        <div className="mt-2 flex justify-end gap-1.5">
          <button
            onClick={() => onAnswer(item.id, false)}
            className="flex h-7 items-center rounded-md border border-border px-3 text-[12px] text-muted-foreground hover:border-destructive/50 hover:text-destructive"
          >
            Deny
          </button>
          <button
            onClick={() => onAnswer(item.id, true)}
            className="flex h-7 items-center rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/85"
          >
            Allow & run
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Bubble({ message }: { message: Extract<ChatItem, { kind: "msg" }> }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-secondary px-3 py-2 text-[13px] leading-relaxed text-foreground">
          {message.content}
        </div>
      </div>
    );
  }
  if (message.error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px] leading-relaxed text-foreground">
        {message.content}
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <AgentMark className="mt-1 h-4 w-4 shrink-0 text-primary" />
      <div className="assistant-markdown min-w-0 flex-1 text-[13px] leading-relaxed text-foreground">
        <ReactMarkdown>{message.content}</ReactMarkdown>
        {message.streaming ? (
          <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-primary/70 align-middle" />
        ) : null}
      </div>
    </div>
  );
}
