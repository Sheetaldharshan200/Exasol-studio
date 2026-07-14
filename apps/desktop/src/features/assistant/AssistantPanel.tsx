import { useEffect, useMemo, useRef, useState } from "react";
import {
  AtSign,
  Bot,
  KeyRound,
  Loader2,
  Send,
  Slash,
  Sparkles,
  User,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage, ipc, type ChatMessage } from "@/lib/ipc";
import { cn } from "@/lib/utils";

type DisplayMessage = ChatMessage & { id: string; error?: boolean };

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
  const [hasKey, setHasKey] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [model, setModel] = useState("claude-opus-4-8");
  const [menuIndex, setMenuIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ipc.getAssistantSettings().then((s) => {
      setHasKey(Boolean(s.apiKey));
      setModel(s.model);
      if (!s.apiKey) setShowSettings(true);
    });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  // An external action (e.g. "AI explain plan") pushed a prompt to send.
  const lastNonce = useRef(0);
  useEffect(() => {
    if (pendingPrompt && pendingPrompt.nonce !== lastNonce.current) {
      lastNonce.current = pendingPrompt.nonce;
      void send(pendingPrompt.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt]);

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

  async function saveSettings() {
    const saved = await ipc.setAssistantSettings(keyDraft || undefined, model);
    setHasKey(Boolean(saved.apiKey));
    setKeyDraft("");
    setShowSettings(false);
  }

  function applySlash(cmd: SlashCommand) {
    if (cmd.kind === "clear") {
      setMessages([]);
      setInput("");
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
    const next: DisplayMessage[] = [
      ...messages,
      { id: `u-${Date.now()}`, role: "user", content: trimmed },
    ];
    setMessages(next);
    setInput("");
    setSending(true);

    const context = [contextSummary, editorSql ? `Editor SQL:\n${editorSql}` : ""]
      .filter(Boolean)
      .join("\n\n");

    try {
      const reply = await ipc.aiChat(
        next.map(({ role, content }) => ({ role, content })),
        context,
      );
      setMessages((m) => [...m, { id: `a-${Date.now()}`, role: "assistant", content: reply.text }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { id: `e-${Date.now()}`, role: "assistant", content: errorMessage(err), error: true },
      ]);
    } finally {
      setSending(false);
    }
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
      send(input);
    }
  }

  return (
    <aside className="flex h-full min-w-0 flex-col border-l border-border bg-panel">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-[13px] font-semibold text-foreground">AI Assistant</span>
          <span className="rounded-full bg-secondary px-1.5 py-px font-mono text-[9px] text-muted-foreground">
            {model.replace("claude-", "")}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 ? (
            <button
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              onClick={() => setMessages([])}
              aria-label="Clear conversation"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground",
              showSettings && "text-primary",
            )}
            onClick={() => setShowSettings((s) => !s)}
            aria-label="Assistant settings"
          >
            <KeyRound className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {showSettings ? (
        <div className="space-y-2 border-b border-border bg-secondary/40 p-3">
          <span className="eyebrow-muted">Anthropic API key</span>
          <Input
            type="password"
            placeholder={hasKey ? "•••• saved — enter to replace" : "sk-ant-…"}
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
          />
          <Input value={model} onChange={(e) => setModel(e.target.value)} className="font-mono text-xs" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowSettings(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveSettings}>
              Save
            </Button>
          </div>
        </div>
      ) : null}

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-2 px-4 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl text-primary">
              <Bot className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-foreground">Ask about your database</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Generate Exasol SQL, explain a query, or get tuning tips.
            </p>
            <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Slash className="h-3 w-3 text-primary" /> commands
              </span>
              <span className="flex items-center gap-1">
                <AtSign className="h-3 w-3 text-primary" /> add context
              </span>
            </div>
          </div>
        ) : (
          messages.map((m) => <Bubble key={m.id} message={m} />)
        )}
        {sending ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
          </div>
        ) : null}
      </div>

      <div className="relative border-t border-border p-2.5">
        {/* Slash / mention popup */}
        {menuItems.length > 0 ? (
          <div className="absolute bottom-full left-2.5 mb-1 w-[calc(100%-1.25rem)] overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
            <div className="border-b border-border px-2.5 py-1.5">
              <span className="eyebrow-muted">
                {trigger?.type === "slash" ? "Commands" : "Add context"}
              </span>
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

        <div className="mb-2 flex flex-wrap gap-1.5">
          {SLASH_COMMANDS.slice(0, 3).map((c) => (
            <button
              key={c.cmd}
              className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
              onClick={() => applySlash(c)}
            >
              <Wand2 className="h-3 w-3" />
              {c.cmd.slice(1)}
            </button>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <textarea
            ref={inputRef}
            className="min-h-[38px] max-h-32 flex-1 resize-none rounded-lg border border-input bg-editor px-3 py-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            placeholder={hasKey ? "Ask, or type / and @…" : "Add an API key to start chatting"}
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <Button type="submit" size="icon" disabled={sending || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </aside>
  );
}

function Bubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-2", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
          isUser ? "bg-secondary text-foreground" : "bg-primary/12 text-primary",
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap",
          isUser
            ? "bg-secondary text-foreground"
            : message.error
              ? "border border-destructive/40 bg-destructive/10 text-foreground"
              : "bg-editor text-foreground",
        )}
      >
        {message.content}
      </div>
    </div>
  );
}
