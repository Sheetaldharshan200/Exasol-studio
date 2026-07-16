import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Cpu,
  Database,
  FileSearch,
  FileText,
  Gauge,
  History,
  Image as ImageIcon,
  Loader2,
  ArrowRight,
  PanelRightClose,
  Paperclip,
  Plus,
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
import { agent, type AgentAttachment, type AgentEvent, type AgentProviderInfo, type ReplayItem, type SessionMeta } from "@/lib/agent-client";
import { EV_AI_PROVIDERS_CHANGED, openAiProvidersWindow } from "@/lib/ai-window";
import { sessionBus } from "@/lib/session-bus";
import { errorMessage, ipc, isTauri, type PersonalLocalStatus } from "@/lib/ipc";
import { cn } from "@/lib/utils";

type ChatItem =
  | { kind: "msg"; id: string; role: "user" | "assistant"; content: string; error?: boolean; streaming?: boolean }
  | { kind: "tool"; id: string; name: string; args: unknown; done: boolean; ok?: boolean; summary?: string }
  | { kind: "perm"; id: string; tool: string; summary: string; detail: string; result?: boolean }
  | { kind: "note"; id: string; text: string };

type SlashCommand = {
  cmd: string;
  desc: string;
  /** Placeholder hint shown after the command, e.g. "the orders query". */
  hint?: string;
  /** Clears the conversation instead of sending. */
  clears?: boolean;
  /** Requires an active database connection — we ask the user to connect first
   *  instead of firing a prompt whose tools would just fail. */
  needsDb?: boolean;
  /** Turn the command + the user's argument into the prompt sent to the agent.
   *  Not needed for `clears`. */
  expand?: (arg: string) => string;
};

const LEARN_DB_PROMPT =
  "Learn my database end to end. Steps: (1) call kb_refresh to re-crawl the live schema. " +
  "(2) For every user schema, list its tables and describe the important ones — capture each table's purpose, row count, primary keys, and foreign/inferred join keys (use kb_search, kb_subsystem, and spawn_researcher to fan out efficiently). " +
  "(3) Save the durable facts you verify — table meanings, join keys, and candidate business metrics — with the remember tool (scope: project) so they persist across sessions. " +
  "(4) If the Semantic Views layer is ready, propose a starter semantic model grounded ONLY in the real tables you found: the entities, how they join, and the business metrics you'd define (with exact formulas), then ask me to confirm before creating anything. " +
  "Finally, give me a concise map of my data: schemas, key entities and relationships, and the metrics you recommend. If there are no user data tables yet, tell me plainly and suggest loading data first — do not invent tables.";

// Every command carries an argument. Selecting one inserts "/cmd " so you can
// type your text; on send, expand() builds the real prompt (falling back to a
// sensible default when you give no argument). The raw "/cmd …" is what shows
// in the conversation, with the command highlighted.
const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: "/explain", desc: "Explain SQL — yours, or the editor's", hint: "paste SQL, or leave blank for the editor",
    expand: (a) => (a ? `Explain this Exasol SQL, step by step:\n\n${a}` : "Explain the SQL in my editor, step by step.") },
  { cmd: "/optimize", desc: "Optimize a query for Exasol", hint: "paste SQL, or leave blank for the editor",
    expand: (a) => (a ? `Suggest ways to optimize this Exasol SQL:\n\n${a}` : "Suggest ways to optimize the SQL in my editor for Exasol.") },
  { cmd: "/fix", desc: "Find and fix SQL errors", hint: "paste SQL, or leave blank for the editor",
    expand: (a) => (a ? `Find and fix any errors in this Exasol SQL:\n\n${a}` : "Find and fix any errors in the SQL in my editor.") },
  { cmd: "/generate", desc: "Generate SQL from a description", hint: "what the query should do",
    expand: (a) => `Generate an Exasol SQL query that ${a || "…"}`.trim() },
  { cmd: "/tables", desc: "List tables in a schema", hint: "schema name (optional)", needsDb: true,
    expand: (a) => (a ? `List the tables and views in the ${a.toUpperCase()} schema, one line each.` : "List the tables in the current schema, one line each.") },
  { cmd: "/learn-my-db", desc: "Learn my database & set up the semantic model", hint: "just press Enter", needsDb: true,
    expand: () => LEARN_DB_PROMPT },
  { cmd: "/dashboard", desc: "Build a live SQL dashboard", hint: "what it should show",
    expand: (a) => `Build a live SQL dashboard that ${a || "…"}`.trim() },
  { cmd: "/artifact", desc: "Build an HTML insight report", hint: "what the report should cover",
    expand: (a) => `Build a self-contained HTML report that ${a || "…"}`.trim() },
  { cmd: "/clear", desc: "Clear the conversation", clears: true },
];

/** Parse a leading slash command from composer text, if any. */
function parseSlash(text: string): { cmd: SlashCommand; arg: string } | null {
  const m = /^(\/[a-z-]+)(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!m) return null;
  const cmd = SLASH_COMMANDS.find((c) => c.cmd === m[1].toLowerCase());
  return cmd ? { cmd, arg: (m[2] ?? "").trim() } : null;
}

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

const SLASH_NAMES = SLASH_COMMANDS.map((c) => c.cmd);

/** Render the composer text with the leading /command and @mentions colored.
 *  Kept visually identical to the textarea so it can sit behind it. */
function highlightInput(text: string): React.ReactNode {
  if (!text) return null;
  const nodes: React.ReactNode[] = [];
  let i = 0;
  // Leading /command (only when it's a real command at the very start).
  const lead = /^\/[a-z-]+/i.exec(text);
  if (lead && SLASH_NAMES.includes(lead[0].toLowerCase())) {
    nodes.push(
      <span key="cmd" className="rounded bg-primary/15 font-medium text-primary">
        {lead[0]}
      </span>,
    );
    i = lead[0].length;
  }
  // Remainder: color @mentions inline.
  const rest = text.slice(i);
  const re = /(^|\s)(@[a-z:_]+)/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest))) {
    if (m.index > last) nodes.push(rest.slice(last, m.index + m[1].length));
    nodes.push(
      <span key={`at-${m.index}`} className="text-primary">
        {m[2]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  nodes.push(rest.slice(last));
  return nodes;
}

export function AssistantPanel({
  contextSummary,
  editorSql,
  pendingPrompt,
  connectionId,
  connections = [],
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
  /** All currently-open connections, so the agent's target can be chosen. */
  connections?: { id: string; name: string }[];
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
  const [showConnPicker, setShowConnPicker] = useState(false);
  // User-chosen target DB (null = follow the app's active connection). Falls
  // back to the active connection if the picked one closes.
  const [pickedConn, setPickedConn] = useState<string | null>(null);
  const targetConn = pickedConn && connections.some((c) => c.id === pickedConn) ? pickedConn : connectionId ?? null;
  const targetConnName = connections.find((c) => c.id === targetConn)?.name ?? null;
  const [agentError, setAgentError] = useState<string | null>(null);
  const [menuIndex, setMenuIndex] = useState(0);
  const [title, setTitle] = useState("New chat");
  const [sessionList, setSessionList] = useState<SessionMeta[]>([]);
  const [showSessions, setShowSessions] = useState(false);
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const [attachHint, setAttachHint] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
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

  // Hand the target connection to the agent (password decrypts Rust-side).
  useEffect(() => {
    if (targetConn) void agent.grantConnection(targetConn).catch(() => undefined);
  }, [targetConn]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [items, sending]);

  // Auto-grow the composer up to a max height, then scroll internally. The
  // highlight overlay is kept in sync so mentions/commands stay aligned, and
  // the caret line is kept visible as the box grows.
  const MAX_COMPOSER = 200;
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const next = Math.min(ta.scrollHeight, MAX_COMPOSER);
    ta.style.height = `${next}px`;
    ta.style.overflowY = ta.scrollHeight > MAX_COMPOSER ? "auto" : "hidden";
    if (overlayRef.current) overlayRef.current.style.height = `${next}px`;
    // Keep the caret visible while typing at the bottom of a tall box.
    ta.scrollTop = ta.scrollHeight;
    if (overlayRef.current) overlayRef.current.scrollTop = ta.scrollTop;
  }, [input]);

  const syncOverlayScroll = () => {
    if (overlayRef.current && inputRef.current) overlayRef.current.scrollTop = inputRef.current.scrollTop;
  };

  // Dismiss the model picker on outside click or Escape; Escape also closes
  // the history view.
  useEffect(() => {
    if (!showPicker && !showSessions && !showConnPicker) return;
    const onDown = (e: MouseEvent) => {
      if (showPicker && pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowPicker(false);
        setShowSessions(false);
        setShowConnPicker(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showPicker, showSessions, showConnPicker]);

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

  // Load the session list (the History button owns the open/close toggle).
  async function openSessionsMenu() {
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
    if (/^\/[a-z-]*$/i.test(input)) {
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
        title: c.hint && !c.clears ? `${c.cmd} <${c.hint}>` : c.cmd,
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
    if (cmd.clears) {
      newChat();
      return;
    }
    // Insert "/cmd " so the user can add their argument and press Enter — never
    // fire a canned prompt on selection.
    setInput(`${cmd.cmd} `);
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
    if ((!trimmed && attachments.length === 0) || sending) return;

    // A slash command: /clear acts immediately; others expand into the real
    // prompt for the agent while the raw "/cmd …" stays as the shown message.
    const slash = parseSlash(trimmed);
    if (slash?.cmd.clears) {
      newChat();
      return;
    }
    // Commands that work on the database need a live connection first.
    if (slash?.cmd.needsDb && !targetConn) {
      setItems((m) => [
        ...m,
        { kind: "msg", id: `u-${Date.now()}`, role: "user", content: trimmed },
        {
          kind: "msg",
          id: `a-${Date.now()}`,
          role: "assistant",
          content:
            `**Connect to a database first.** \`${slash.cmd.cmd}\` needs a live connection to read your schema.\n\n` +
            "Open the **Databases** tab (left rail) and tap your connection — your local Exasol shows there once it's running — then run this command again.",
        },
      ]);
      setInput("");
      return;
    }
    if (!model) {
      void openAiProvidersWindow();
      return;
    }
    const agentText = slash?.cmd.expand ? slash.cmd.expand(slash.arg) : trimmed;

    const sentAttachments = attachments;
    const attachLine = sentAttachments.length
      ? `\n\n📎 ${sentAttachments.map((a) => a.name).join(", ")}`
      : "";
    setItems((m) => [...m, { kind: "msg", id: `u-${Date.now()}`, role: "user", content: (trimmed || "(attached files)") + attachLine }]);
    setInput("");
    setAttachments([]);
    setAttachHint(null);
    setSending(true);

    const context = [contextSummary, editorSql ? `Editor SQL:\n${editorSql}` : ""]
      .filter(Boolean)
      .join("\n\n");

    try {
      const sid = await ensureSession();
      await agent.send(sid, agentText || "(see attached files)", model, context || undefined, targetConn, sentAttachments);
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

  // Read picked files: text-like → text (for document RAG); images → data URL
  // (only when the model can read images, else rejected with a hint).
  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files);
    const next: AgentAttachment[] = [];
    let rejected = false;
    for (const f of list) {
      const isImage = f.type.startsWith("image/");
      if (isImage) {
        if (!modelSupportsImages) {
          rejected = true;
          continue;
        }
        if (f.size > 6 * 1024 * 1024) {
          setAttachHint(`${f.name} is too large (max 6 MB).`);
          continue;
        }
        const data = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.readAsDataURL(f);
        });
        next.push({ name: f.name, mime: f.type, kind: "image", data });
      } else {
        if (f.size > 2 * 1024 * 1024) {
          setAttachHint(`${f.name} is too large (max 2 MB for text files).`);
          continue;
        }
        const data = await f.text();
        next.push({ name: f.name, mime: f.type || "text/plain", kind: "text", data });
      }
    }
    if (rejected) setAttachHint("This model can't read images — switch to a vision model to attach images.");
    else if (next.length) setAttachHint(null);
    if (next.length) setAttachments((a) => [...a, ...next]);
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

  const modelSupportsImages = useMemo(() => {
    if (!model) return false;
    const [pid, ...rest] = model.split("/");
    const mid = rest.join("/");
    return providers.find((x) => x.id === pid)?.models.find((m) => m.id === mid)?.image === true;
  }, [model, providers]);

  // Warn when the selected model can't reliably call tools — the agent's DB
  // actions (connect, query, dashboards) all depend on tool calling.
  const toolRisk = useMemo(() => {
    if (!model) return false;
    const [pid, ...rest] = model.split("/");
    if (pid === "builtin") return false;
    const info = providers.find((x) => x.id === pid)?.models.find((m) => m.id === rest.join("/"));
    if (info?.toolCall === false) return true;
    // External local runtimes (Ollama/LM Studio/llama.cpp): reliability varies
    // by model + chat template, and we can't confirm it — flag as a caution.
    return (pid === "ollama" || pid === "lmstudio" || pid === "llamacpp") && info?.toolCall !== true;
  }, [model, providers]);

  const isLocalModel =
    model.startsWith("builtin/") || model.startsWith("ollama/") || model.startsWith("lmstudio/") || model.startsWith("llamacpp/");
  const ollama = providers.find((p) => p.id === "ollama");
  const thinking = sending && !items.some((it) => it.kind === "msg" && it.streaming && it.content);

  return (
    <aside className="relative flex h-full min-w-0 flex-col overflow-hidden border-l border-border bg-panel">
      {/* ── Header ── */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          <AgentMark className="h-4.5 w-4.5 shrink-0" active={sending} />
          <span className="truncate text-[13px] font-semibold text-foreground" title={title}>
            {showSessions ? "Chat history" : title}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md hover:text-foreground",
              showSessions ? "text-primary" : "text-muted-foreground",
            )}
            onClick={() => {
              const next = !showSessions;
              setShowPicker(false);
              setShowConnPicker(false);
              setShowSessions(next);
              if (next) void openSessionsMenu();
            }}
            aria-label="Chat history"
            title="Chat history"
          >
            <History className="h-3.5 w-3.5" />
          </button>
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
      {toolRisk ? (
        <div className="flex shrink-0 items-start gap-1.5 border-b border-warning/30 bg-warning/10 px-3 py-1.5 text-[11px] text-foreground">
          <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
          <span>
            This model may not reliably use tools, so database actions (connect, query, dashboards) can fail. For the
            agent, use a <span className="font-medium">Built-in AI</span> model or a cloud model.
          </span>
        </div>
      ) : null}

      {/* ── History (full-panel overlay below the header; never clipped) ── */}
      {showSessions ? (
        <div className="absolute inset-x-0 bottom-0 top-10 z-20 flex flex-col overflow-hidden bg-panel">
          <button
            onClick={() => {
              newChat();
              setShowSessions(false);
            }}
            className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5 text-left text-[12.5px] font-medium text-foreground hover:bg-secondary/60"
          >
            <Plus className="h-4 w-4 text-primary" /> New chat
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {sessionList.length === 0 ? (
              <p className="px-3 py-4 text-[12px] text-muted-foreground">No previous chats yet.</p>
            ) : (
              sessionList.map((sess) => (
                <div
                  key={sess.id}
                  className={cn(
                    "group flex w-full cursor-pointer items-center gap-2.5 border-b border-border/50 px-3 py-2.5 text-left",
                    sess.id === sessionRef.current ? "bg-secondary" : "hover:bg-secondary/60",
                  )}
                  onClick={() => {
                    void switchSession(sess.id);
                    setShowSessions(false);
                  }}
                >
                  <History className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] text-foreground">{sess.title}</div>
                    <div className="text-[10.5px] text-muted-foreground">{relTime(sess.updatedAt)}</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeSession(sess.id);
                    }}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
                    aria-label="Delete chat"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {/* ── Conversation ── */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden p-3">
        {agentError ? (
          <div className="[overflow-wrap:anywhere] rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] break-words text-foreground">
            {agentError}
          </div>
        ) : null}
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-4 pb-10 text-center">
            <AgentMark className="mb-3 h-12 w-12" />

            <p className="text-[14.5px] font-semibold text-foreground">Ask Exa anything</p>
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

        <div ref={pickerRef} className="relative rounded-xl border border-border bg-editor transition-colors focus-within:border-muted-foreground/40">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={modelSupportsImages ? undefined : ".txt,.md,.markdown,.csv,.tsv,.json,.sql,.log,.yaml,.yml,.xml,.html,.js,.ts,.py,.java,text/*"}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {attachments.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 px-2 pt-2">
              {attachments.map((a, i) => (
                <span key={i} className="flex items-center gap-1 rounded-md border border-border bg-panel/60 py-0.5 pl-1.5 pr-1 text-[10.5px] text-foreground">
                  {a.kind === "image" ? <ImageIcon className="h-3 w-3 text-primary" /> : <FileText className="h-3 w-3 text-muted-foreground" />}
                  <span className="max-w-[140px] truncate">{a.name}</span>
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                    className="flex h-3.5 w-3.5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${a.name}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          {attachHint ? <div className="px-3 pt-1.5 text-[10.5px] text-muted-foreground">{attachHint}</div> : null}
          <div className="relative">
            {/* Highlight overlay: colors the leading /command and @mentions.
                Mirrors the textarea's box exactly; textarea text is transparent
                so only its caret/selection show over this. */}
            <div
              ref={overlayRef}
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-3 pt-2.5 pb-1 text-[13px] leading-[inherit]"
            >
              {highlightInput(input)}
            </div>
            <textarea
              ref={inputRef}
              data-bare
              className="relative min-h-[40px] w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[13px] leading-[inherit] text-transparent caret-foreground outline-none selection:bg-primary/20 placeholder:text-muted-foreground"
              placeholder={model ? "Ask, or / for commands…" : "Pick a model to start…"}
              value={input}
              rows={1}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              onScroll={syncOverlayScroll}
            />
          </div>
          <div className="flex min-w-0 items-center gap-1 px-1.5 pb-1.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Attach files"
              title={modelSupportsImages ? "Attach files or images" : "Attach files (this model can't read images)"}
            >
              <Paperclip className="h-3.5 w-3.5" />
            </button>

            {/* Model + connection pills share the middle and truncate to fit —
                bounded + clipped so they can never reach the send button. */}
            <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  setShowConnPicker(false);
                  setShowSessions(false);
                  setShowPicker((s) => !s);
                }}
                className="flex min-w-0 max-w-[55%] shrink items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                title={modelLabel}
              >
                {isLocalModel ? <Cpu className="h-3 w-3 shrink-0 text-primary" /> : null}
                <span className="truncate font-mono">{modelLabel}</span>
                <ChevronDown className="h-2.5 w-2.5 shrink-0" />
              </button>

              {targetConn ? (
                <div className="relative min-w-0 max-w-[45%] shrink">
                  <button
                    type="button"
                    onClick={() => {
                      if (connections.length <= 1) return;
                      setShowPicker(false);
                      setShowSessions(false);
                      setShowConnPicker((s) => !s);
                    }}
                    className="flex w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    title={connections.length > 1 ? "Choose which database the agent works on" : `Agent works on ${targetConnName}`}
                  >
                    <Database className="h-3 w-3 shrink-0 text-primary" />
                    <span className="truncate">{targetConnName}</span>
                    {connections.length > 1 ? <ChevronDown className="h-2.5 w-2.5 shrink-0" /> : null}
                  </button>
                  {showConnPicker && connections.length > 1 ? (
                    <div className="absolute bottom-full left-0 z-30 mb-1.5 w-56 overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
                      <div className="border-b border-border px-2.5 py-1.5 eyebrow-muted">Agent works on</div>
                      {connections.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setPickedConn(c.id);
                            setShowConnPicker(false);
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-secondary/60",
                            c.id === targetConn && "bg-secondary",
                          )}
                        >
                          <Database className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="flex-1 truncate text-[12px] text-foreground">{c.name}</span>
                          {c.id === targetConn ? <Check className="h-3 w-3 shrink-0 text-primary" /> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {sending ? (
              <button
                type="button"
                onClick={() => void stop()}
                aria-label="Stop generating"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
              >
                <Square className="h-3 w-3" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void send(input)}
                disabled={!input.trim()}
                aria-label="Send"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-90 disabled:opacity-30"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {showPicker ? (
            <div className="absolute bottom-full left-1.5 right-1.5 z-30 mb-1.5">
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
            </div>
          ) : null}
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
  spawn_researcher: "Researcher",
  remember: "Saving to memory",
  kb_search: "Searching knowledge graph",
  kb_join_path: "Finding join path",
  kb_subsystem: "Mapping subsystem",
  kb_refresh: "Rebuilding knowledge graph",
  search_documents: "Searching documents",
  read_document: "Reading document",
  semantic_compile_request: "Compiling semantic query",
  semantic_compile_sql: "Compiling semantic SQL",
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
  for (const k of ["task", "near", "query", "schema", "table", "sql", "purpose", "note"]) {
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
        <span className="max-w-[45%] shrink-0 truncate font-mono text-[10px] text-muted-foreground" title={item.summary}>{item.summary}</span>
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
        <div className="[overflow-wrap:anywhere] max-w-[85%] min-w-0 whitespace-pre-wrap rounded-2xl rounded-br-md bg-secondary px-3 py-2 text-[13px] leading-relaxed break-words text-foreground">
          {highlightInput(message.content)}
        </div>
      </div>
    );
  }
  if (message.error) {
    return (
      <div className="[overflow-wrap:anywhere] rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px] leading-relaxed break-words text-foreground">
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
