import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Cpu,
  FileSearch,
  Gauge,
  RotateCcw,
  Send,
  Settings2,
  Square,
  Table2,
  Wand2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AgentMark } from "@/components/studio/AgentMark";
import { agent, type AgentEvent, type AgentProviderInfo } from "@/lib/agent-client";
import { errorMessage } from "@/lib/ipc";
import { cn } from "@/lib/utils";

type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  streaming?: boolean;
};

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

const CLOUD_KEY_PROVIDERS = ["anthropic", "openai", "google", "openrouter"];

export function AssistantPanel({
  contextSummary,
  editorSql,
  pendingPrompt,
}: {
  contextSummary: string;
  editorSql: string;
  /** An external prompt (e.g. "AI explain plan") to send automatically. */
  pendingPrompt?: { text: string; nonce: number } | null;
}) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [providers, setProviders] = useState<AgentProviderInfo[]>([]);
  const [model, setModel] = useState<string>("");
  const [showSettings, setShowSettings] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [menuIndex, setMenuIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionRef = useRef<string | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);

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
    return () => disposeRef.current?.();
  }, [refreshProviders]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const handleEvent = useCallback((e: AgentEvent) => {
    if (e.type === "message-start") {
      setMessages((m) => [...m, { id: e.messageId, role: "assistant", content: "", streaming: true }]);
    } else if (e.type === "text-delta") {
      setMessages((m) =>
        m.map((msg) => (msg.id === e.messageId ? { ...msg, content: msg.content + e.delta } : msg)),
      );
    } else if (e.type === "message-done") {
      setMessages((m) => m.map((msg) => (msg.id === e.messageId ? { ...msg, streaming: false } : msg)));
      setSending(false);
    } else if (e.type === "error") {
      setMessages((m) => {
        const last = m[m.length - 1];
        if (last?.streaming && !last.content) {
          return m.map((msg) =>
            msg.id === last.id ? { ...msg, content: e.message, error: true, streaming: false } : msg,
          );
        }
        return [...m, { id: `e-${Date.now()}`, role: "assistant", content: e.message, error: true }];
      });
      setSending(false);
    }
  }, []);

  async function ensureSession(): Promise<string> {
    if (sessionRef.current) return sessionRef.current;
    const id = await agent.createSession();
    sessionRef.current = id;
    disposeRef.current = await agent.stream(id, handleEvent);
    return id;
  }

  function newChat() {
    setMessages([]);
    setInput("");
    disposeRef.current?.();
    disposeRef.current = null;
    sessionRef.current = null;
    setSending(false);
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
      setShowSettings(true);
      return;
    }
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", content: trimmed }]);
    setInput("");
    setSending(true);

    const context = [contextSummary, editorSql ? `Editor SQL:\n${editorSql}` : ""]
      .filter(Boolean)
      .join("\n\n");

    try {
      const sid = await ensureSession();
      await agent.send(sid, trimmed, model, context || undefined);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { id: `e-${Date.now()}`, role: "assistant", content: errorMessage(err), error: true },
      ]);
      setSending(false);
    }
  }

  async function stop() {
    if (sessionRef.current) await agent.abort(sessionRef.current).catch(() => undefined);
  }

  async function saveKey(providerId: string) {
    const key = keyDrafts[providerId]?.trim();
    if (!key) return;
    await agent.setProviderKey(providerId, key);
    setKeyDrafts((d) => ({ ...d, [providerId]: "" }));
    await refreshProviders();
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

  const isLocalModel = model.startsWith("ollama/") || model.startsWith("lmstudio/") || model.startsWith("llamacpp/");
  const ollama = providers.find((p) => p.id === "ollama");
  const thinking = sending && !messages.some((m) => m.streaming && m.content);

  return (
    <aside className="flex h-full min-w-0 flex-col border-l border-border bg-panel">
      {/* ── Header ── */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <AgentMark className="h-4 w-4" active={sending} />
          </span>
          <span className="text-[13px] font-semibold text-foreground">Exasol AI</span>
        </div>
        <div className="flex items-center gap-0.5">
          {messages.length > 0 ? (
            <button
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              onClick={newChat}
              aria-label="New chat"
              title="New chat"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground",
              showSettings && "text-primary",
            )}
            onClick={() => {
              setShowSettings((s) => !s);
              setShowPicker(false);
            }}
            aria-label="Assistant settings"
            title="Models & keys"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Settings ── */}
      {showSettings ? (
        <div className="max-h-[45%] space-y-2.5 overflow-y-auto border-b border-border bg-secondary/40 p-3">
          <div className="rounded-lg border border-border bg-panel/60 px-2.5 py-2">
            <div className="flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-primary" />
              <span className="text-[12px] font-medium text-foreground">Local models</span>
              {ollama?.running ? (
                <span className="ml-auto flex items-center gap-1 text-[10px] text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" /> running
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {ollama?.running
                ? `Ollama — ${ollama.models.length} model${ollama.models.length === 1 ? "" : "s"} ready. Private, free, no key needed.`
                : ollama?.installedOnly
                  ? "Ollama is installed but not running. Start it with `ollama serve`, then reopen this panel."
                  : "Install Ollama (ollama.com) to chat with free local models — fully private, no API key."}
            </p>
          </div>
          {providers
            .filter((p) => p.kind === "cloud" && CLOUD_KEY_PROVIDERS.includes(p.id))
            .map((p) => (
              <div key={p.id} className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="eyebrow-muted">{p.name}</span>
                  {p.configured ? (
                    <span className="flex items-center gap-0.5 rounded bg-primary/15 px-1 py-px text-[8px] font-medium uppercase text-primary">
                      <Check className="h-2 w-2" /> key saved
                    </span>
                  ) : null}
                </div>
                <div className="flex gap-1.5">
                  <Input
                    type="password"
                    placeholder={p.configured ? "•••• saved — enter to replace" : "API key…"}
                    value={keyDrafts[p.id] ?? ""}
                    onChange={(e) => setKeyDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                    className="h-7 text-xs"
                  />
                  <Button size="sm" className="h-7" disabled={!keyDrafts[p.id]?.trim()} onClick={() => void saveKey(p.id)}>
                    Save
                  </Button>
                </div>
              </div>
            ))}
        </div>
      ) : null}

      {/* ── Conversation ── */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {agentError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-foreground">
            {agentError}
          </div>
        ) : null}
        {messages.length === 0 ? (
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
          messages.map((m) => <Bubble key={m.id} message={m} />)
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
            <div className="relative min-w-0">
              <button
                type="button"
                onClick={() => {
                  setShowPicker((s) => !s);
                  setShowSettings(false);
                }}
                className="flex max-w-[190px] items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {isLocalModel ? <Cpu className="h-3 w-3 shrink-0 text-primary" /> : null}
                <span className="truncate font-mono">{modelLabel}</span>
                <ChevronDown className="h-2.5 w-2.5 shrink-0" />
              </button>
              {showPicker ? (
                <div className="absolute bottom-full left-0 z-30 mb-1.5 max-h-72 w-64 overflow-y-auto rounded-lg border border-border bg-popover shadow-xl">
                  {providers
                    .filter((p) => p.models.length > 0 && (p.kind === "local" ? p.running : p.configured))
                    .map((p) => (
                      <div key={p.id}>
                        <div className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5">
                          <span className="eyebrow-muted">{p.name}</span>
                          {p.kind === "local" ? (
                            <span className="rounded bg-primary/15 px-1 py-px text-[8px] font-medium uppercase text-primary">
                              local
                            </span>
                          ) : null}
                        </div>
                        {p.models.map((m) => {
                          const ref = `${p.id}/${m.id}`;
                          return (
                            <button
                              key={ref}
                              onClick={() => pickModel(ref)}
                              className={cn(
                                "flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-secondary/60",
                                ref === model && "bg-secondary",
                              )}
                            >
                              <span className="flex-1 truncate text-[12px] text-foreground">{m.name}</span>
                              {ref === model ? <Check className="h-3 w-3 shrink-0 text-primary" /> : null}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  {providers.every((p) => (p.kind === "local" ? !p.running || !p.models.length : !p.configured)) ? (
                    <div className="px-2.5 py-3 text-[11.5px] text-muted-foreground">
                      No models yet — add an API key or start Ollama.
                    </div>
                  ) : null}
                  <button
                    onClick={() => {
                      setShowPicker(false);
                      setShowSettings(true);
                    }}
                    className="flex w-full items-center gap-1.5 border-t border-border px-2.5 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  >
                    <Settings2 className="h-3 w-3" /> Manage models & keys…
                  </button>
                </div>
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

function Bubble({ message }: { message: DisplayMessage }) {
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
