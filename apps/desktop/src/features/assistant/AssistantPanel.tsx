import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Check,
  ChevronDown,
  Copy,
  Cpu,
  Database,
  Download,
  FileSearch,
  FileText,
  Gauge,
  History,
  Image as ImageIcon,
  Loader2,
  PanelRightClose,
  Paperclip,
  Plus,
  ShieldAlert,
  SlidersHorizontal,
  Table2,
  Trash2,
  Wand2,
  Wrench,
  X,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { extractTableDataFromElement, tableDataToCSV, tableDataToMarkdown } from "streamdown";
import type { BundledLanguage } from "shiki";
import ReactMarkdown from "react-markdown";
import { AgentMark, AgentLoader } from "@/components/studio/AgentMark";
import { ModelPicker } from "@/features/assistant/ModelPicker";
import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Suggestions, Suggestion } from "@/components/ai-elements/suggestion";
import { PromptInputTools, PromptInputButton, PromptInputSubmit } from "@/components/ai-elements/prompt-input";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { Button } from "@/components/ui/button";
import { agent, type AgentAttachment, type AgentEvent, type AgentProviderInfo, type ReplayItem, type SessionMeta } from "@/lib/agent-client";
import { EV_AI_PROVIDERS_CHANGED, openAiProvidersWindow } from "@/lib/ai-window";
import { sessionBus } from "@/lib/session-bus";
import { errorMessage, ipc, isTauri, type PersonalLocalStatus } from "@/lib/ipc";
import { cn } from "@/lib/utils";

type ChatItem =
  | { kind: "msg"; id: string; role: "user" | "assistant"; content: string; error?: boolean; streaming?: boolean; attachments?: string[] }
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

/** Split text into prose and fenced-code regions. A fence is ``` or ''' and
 *  runs until the matching marker (or end-of-text while the user is still
 *  typing). The markers are kept inside the code region so they highlight too. */
function splitFences(s: string): { code: boolean; text: string }[] {
  const out: { code: boolean; text: string }[] = [];
  const re = /(```|''')/g;
  let last = 0;
  let open: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const marker = m[1];
    if (open === null) {
      if (m.index > last) out.push({ code: false, text: s.slice(last, m.index) });
      open = marker;
      last = m.index;
    } else if (marker === open) {
      out.push({ code: true, text: s.slice(last, m.index + marker.length) });
      open = null;
      last = m.index + marker.length;
    }
  }
  if (open !== null) out.push({ code: true, text: s.slice(last) });
  else if (last < s.length) out.push({ code: false, text: s.slice(last) });
  return out;
}

/** Color @mentions within a prose fragment. */
function pushProse(nodes: React.ReactNode[], rest: string, keyBase: number): void {
  const re = /(^|\s)(@[a-z:_]+)/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest))) {
    if (m.index + m[1].length > last) nodes.push(rest.slice(last, m.index + m[1].length));
    nodes.push(
      <span key={`at-${keyBase}-${m.index}`} className="text-primary">
        {m[2]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  nodes.push(rest.slice(last));
}

/** Render the composer text with the leading /command, @mentions, and fenced
 *  code (``` or ''') tinted so pasted code reads distinctly from prose. Only
 *  color/background changes — never font/size — so it stays pixel-aligned with
 *  the transparent textarea sitting on top. */
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
  const rest = text.slice(i);
  // Fences that start on their own line render as a full-width block box
  // (Slack/Teams style). A block element implies a line break before and
  // after it, so the \n that delimited the fence in the raw text is dropped
  // from the neighboring prose — this keeps the overlay's line count identical
  // to the textarea's, which is what keeps the caret pixel-aligned.
  const segs = splitFences(rest).map((p) => ({ ...p, block: false }));
  for (let k = 0; k < segs.length; k++) {
    const p = segs[k];
    if (!p.code) continue;
    const prev = k > 0 ? segs[k - 1] : null;
    const next = segs[k + 1];
    const atLineStart = k === 0 ? i === 0 : !prev!.code && (prev!.text.endsWith("\n") || prev!.text === "");
    // The fence must also END its line — a block implies a break after it, so
    // trailing same-line text ("'''…'''more") must stay inline to keep the
    // overlay's line count matching the textarea's.
    const endsLine = !next || (!next.code && next.text.startsWith("\n"));
    if (!atLineStart || !endsLine) continue; // mid-line fence → inline tint
    p.block = true;
    if (prev && !prev.code && prev.text.endsWith("\n")) prev.text = prev.text.slice(0, -1);
    if (next && !next.code && next.text.startsWith("\n")) next.text = next.text.slice(1);
  }
  segs.forEach((part, idx) => {
    if (part.code) {
      nodes.push(
        part.block ? (
          <span
            key={`code-${idx}`}
            className="-mx-1 block w-[calc(100%+0.5rem)] whitespace-pre-wrap break-words rounded-md bg-secondary/80 px-1 text-syntax-type ring-1 ring-border"
          >
            {part.text}
          </span>
        ) : (
          <span key={`code-${idx}`} className="rounded-sm bg-primary/15 text-syntax-type ring-1 ring-primary/25">
            {part.text}
          </span>
        ),
      );
    } else {
      pushProse(nodes, part.text, idx);
    }
  });
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
  onOpenAttachment,
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
  /** Open a sent attachment in a workbench preview tab. */
  onOpenAttachment?: (file: AgentAttachment) => void;
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
  // Files already sent in THIS chat — pinned above the conversation so the
  // user can reopen any of them in a preview tab at any time.
  const [sessionFiles, setSessionFiles] = useState<AgentAttachment[]>([]);
  const [attachHint, setAttachHint] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<string | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);
  const pickerRef = useRef<HTMLFormElement>(null);
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
    // The shadcn textarea ships `field-sizing: content` (CSS auto-grow) which
    // would override our measured height and bypass the max-height cap — pin it
    // to fixed so this JS sizing stays authoritative.
    ta.style.setProperty("field-sizing", "fixed");
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
      setItems((m) => {
        if (m.some((it) => it.kind === "tool" && it.id === e.callId)) {
          return m.map((it) => (it.kind === "tool" && it.id === e.callId ? { ...it, args: e.args ?? it.args } : it));
        }
        // Tool activity reads best ABOVE the answer. When the model's text
        // already streamed (text-rescue runs tools after the fact), insert
        // the tool card before the trailing assistant bubbles so the order
        // stays: tools first, answer last.
        const tool = { kind: "tool", id: e.callId, name: e.name, args: e.args, done: false } as ChatItem;
        let at = m.length;
        while (at > 0) {
          const it = m[at - 1];
          if (it.kind === "msg" && it.role === "assistant" && !it.error) at--;
          else break;
        }
        return [...m.slice(0, at), tool, ...m.slice(at)];
      });
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
    setSessionFiles([]);
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
      setSessionFiles([]); // attachment payloads live in panel memory, per chat
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
    setItems((m) => [...m, {
      kind: "msg",
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed || "(attached files)",
      attachments: sentAttachments.length ? sentAttachments.map((a) => a.name) : undefined,
    }]);
    if (sentAttachments.length) {
      // Pin sent files (dedup by name — a re-send replaces the payload).
      setSessionFiles((prev) => [...prev.filter((p) => !sentAttachments.some((a) => a.name === p.name)), ...sentAttachments]);
    }
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
      } else if (/\.parquet$/i.test(f.name) || /parquet/i.test(f.type)) {
        // Parquet is binary/columnar — read bytes and ship as base64 for import.
        if (f.size > 100 * 1024 * 1024) {
          setAttachHint(`${f.name} is too large (max 100 MB).`);
          continue;
        }
        const data = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => {
            const res = String(r.result);
            resolve(res.slice(res.indexOf(",") + 1)); // strip "data:...;base64,"
          };
          r.readAsDataURL(f);
        });
        next.push({ name: f.name, mime: f.type || "application/vnd.apache.parquet", kind: "binary", data });
      } else {
        // Delimited data files can be loaded into a table (import_csv), so they
        // get a much larger budget than a text doc read for RAG.
        const isData = /\.(csv|tsv|txt)$/i.test(f.name) || /csv|tab-separated/i.test(f.type);
        const cap = isData ? 60 * 1024 * 1024 : 4 * 1024 * 1024;
        if (f.size > cap) {
          setAttachHint(`${f.name} is too large (max ${Math.round(cap / (1024 * 1024))} MB).`);
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
                  <SessionGlyph id={sess.id} title={sess.title} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] text-foreground">{sess.title}</div>
                    <div className="text-[10.5px] text-muted-foreground">
                      {relTime(sess.updatedAt)}
                      {sess.messageCount ? ` · ${sess.messageCount} messages` : ""}
                    </div>
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

      {/* ── Pinned files: everything sent this chat, click to open a preview tab ── */}
      {sessionFiles.length > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border/60 px-3 py-2">
          {sessionFiles.map((f) => (
            <button
              key={f.name}
              type="button"
              onClick={() => onOpenAttachment?.(f)}
              title={`Open ${f.name} in a tab`}
              className="group flex max-w-[46%] items-center gap-1.5 rounded-full border border-border bg-muted/40 py-1 pr-2.5 pl-2 text-[11px] text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10"
            >
              {f.kind === "image" ? (
                <ImageIcon className="h-3 w-3 shrink-0 text-primary" />
              ) : (
                <FileText className="h-3 w-3 shrink-0 text-muted-foreground group-hover:text-primary" />
              )}
              <span className="truncate">{f.name}</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* ── Conversation (shadcn AI Elements) ── */}
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="space-y-3">
          {agentError ? (
            <div className="[overflow-wrap:anywhere] rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] break-words text-foreground">
              {agentError}
            </div>
          ) : null}
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 px-2 pb-10 text-center">
              <AgentMark className="mb-3 h-12 w-12" />
              <p className="text-[14.5px] font-semibold text-foreground">Ask Exa anything</p>
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                SQL generation, tuning and answers — grounded in Exasol.
                {ollama?.running ? " Running on your local models." : ""}
              </p>
              <Suggestions className="mt-4 justify-center">
                {SUGGESTIONS.map((s) => (
                  <Suggestion
                    key={s.label}
                    suggestion={s.label}
                    onClick={() => {
                      if (s.kind === "run") void send(s.payload);
                      else {
                        setInput(s.payload);
                        inputRef.current?.focus();
                      }
                    }}
                  />
                ))}
              </Suggestions>
            </div>
          ) : (
            items.map((it) =>
              it.kind === "msg" ? (
                <Bubble key={it.id} message={it} />
              ) : it.kind === "tool" ? (
                <ToolView key={it.id} item={it} />
              ) : it.kind === "perm" ? (
                <PermissionCard key={it.id} item={it} onAnswer={answerPermission} />
              ) : (
                <div key={it.id} className="flex items-center gap-2 py-0.5">
                  <span className="h-px flex-1 bg-border" />
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{it.text}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              ),
            )
          )}
          {thinking ? (
            <div className="flex items-center gap-2 px-0.5 text-xs text-muted-foreground">
              <AgentLoader className="h-5 w-5" />
              <span className="agent-shimmer">Thinking…</span>
            </div>
          ) : null}
        </ConversationContent>
      </Conversation>

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

        <form
          ref={pickerRef}
          onSubmit={(e) => {
            e.preventDefault();
            if (!sending && input.trim()) void send(input);
          }}
          className="relative"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={modelSupportsImages ? undefined : ".txt,.md,.markdown,.csv,.tsv,.json,.sql,.log,.yaml,.yml,.xml,.html,.js,.ts,.py,.java,.parquet,text/*"}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <InputGroup
            // Tap anywhere on the box (not just the text area) → focus, and
            // focus alone lights the box up — not only once typing starts.
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest("button, textarea, input, select, [role=button]")) {
                inputRef.current?.focus();
              }
            }}
            className="flex-col items-stretch rounded-xl border-border bg-editor transition-colors focus-within:border-muted-foreground/60 focus-within:ring-1 focus-within:ring-muted-foreground/25"
          >
          {attachments.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 px-2 pt-2">
              {attachments.map((a, i) => (
                <span key={i} className="flex items-center gap-1 rounded-md border border-border bg-panel/60 py-0.5 pl-1.5 pr-1 text-[10.5px] text-foreground">
                  {a.kind === "image" ? <ImageIcon className="h-3 w-3 text-primary" /> : <FileText className="h-3 w-3 text-muted-foreground" />}
                  <span className="max-w-[140px] truncate">{a.name}</span>
                  <button
                    type="button"
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
            {/* Plain textarea (not the shadcn one): its metrics must be
                byte-identical to the overlay above or the caret drifts —
                shadcn's Textarea adds md:text-sm and field-sizing which
                misalign at desktop widths. */}
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
          <InputGroupAddon align="block-end" className="gap-1">
            <PromptInputButton
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach files"
              title={modelSupportsImages ? "Attach files or images" : "Attach files (this model can't read images)"}
            >
              <Paperclip className="h-3.5 w-3.5" />
            </PromptInputButton>

            {/* Model + connection pills share the middle and truncate to fit —
                bounded + clipped so they can never reach the send button. */}
            <PromptInputTools className="min-w-0 flex-1 gap-0.5 overflow-hidden">
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
            </PromptInputTools>

            <PromptInputSubmit
              status={sending ? "streaming" : undefined}
              variant={sending ? "outline" : "default"}
              disabled={!sending && !input.trim()}
              onClick={(e) => {
                if (sending) {
                  e.preventDefault();
                  void stop();
                }
              }}
              className={cn(
                "shrink-0 rounded-full",
                sending
                  ? "border-border bg-transparent text-muted-foreground hover:border-destructive/60 hover:bg-destructive/10 hover:text-destructive"
                  : "bg-primary text-primary-foreground hover:bg-primary/85",
              )}
              aria-label={sending ? "Stop generating" : "Send"}
            />
          </InputGroupAddon>

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
          </InputGroup>
        </form>
      </div>
    </aside>
  );
}

/**
 * A visual identity for each chat in selection lists: a deterministic
 * gradient tile (hashed from the session id, stable forever) with an icon
 * matching what the chat is about, or the title's initial.
 */
function SessionGlyph({ id, title }: { id: string; title: string }) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  const t = title.toLowerCase();
  const Icon = /dashboard|chart|graph|kpi|visuali|report/.test(t)
    ? BarChart3
    : /csv|parquet|import|load|upload|pump/.test(t)
      ? FileText
      : /sql|query|select|table|schema|join|optimi/.test(t)
        ? Database
        : null;
  const initial = (title.trim()[0] ?? "?").toUpperCase();
  return (
    <div
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
      style={{ background: `linear-gradient(135deg, hsl(${hue} 55% 42%), hsl(${(hue + 40) % 360} 60% 30%))` }}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : <span className="text-[12px] font-semibold">{initial}</span>}
    </div>
  );
}

function relTime(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
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

function ToolView({ item }: { item: Extract<ChatItem, { kind: "tool" }> }) {
  const label = TOOL_LABELS[item.name] ?? item.name;
  const preview = argPreview(item.args);
  const state = !item.done ? "input-available" : item.ok ? "output-available" : "output-error";
  return (
    <Tool>
      <ToolHeader type={`tool-${item.name}`} title={preview ? `${label} — ${preview}` : label} state={state} />
      <ToolContent>
        {item.args && typeof item.args === "object" && Object.keys(item.args).length ? (
          <ToolInput input={item.args} />
        ) : null}
        {item.done ? (
          <ToolOutput
            output={item.ok ? item.summary : undefined}
            errorText={item.ok ? undefined : item.summary}
          />
        ) : null}
      </ToolContent>
    </Tool>
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
      {item.detail ? (
        <CodeBlock code={item.detail} language="sql" className="mt-2 border-border text-[11px]" />
      ) : null}
      {pending ? (
        <div className="mt-2 flex justify-end gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAnswer(item.id, false)}
            className="h-7 text-[12px] hover:border-destructive/50 hover:text-destructive"
          >
            Deny
          </Button>
          <Button
            size="sm"
            onClick={() => onAnswer(item.id, true)}
            className="h-7 text-[12px]"
          >
            Allow &amp; run
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// Small local models often print a tool call as fenced JSON inside their text
// (chat-template misfire) — e.g. `{"name":"list_tables","arguments":{}}` — and
// tangle the closing fence into the prose, so the whole reply renders as one
// JSON code box. The rescue layer already extracts + EXECUTES those calls, so
// the raw JSON must never reach the chat. We detect a leaked tool call, remove
// its JSON object with real brace-matching (regex can't handle nesting or a
// streaming cut-off), and drop the now-untrustworthy fences so the prose reads
// as chat. Gated on the name being a KNOWN tool so genuine JSON answers pass
// through untouched.

/** True if the text contains a leaked call to a tool this UI knows about. */
function hasLeakedToolCall(s: string): boolean {
  const m = /\{\s*"name"\s*:\s*"([a-zA-Z0-9_]+)"/.exec(s);
  if (!m) return false;
  return m[1] in TOOL_LABELS || /"(?:arguments|parameters|args|input)"\s*:/.test(s);
}

/** Remove every `{"name":...}` tool-call object via brace-aware scanning; an
 *  unterminated one (streaming cut-off) drops everything from its start. */
function stripToolJson(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const m = /\{\s*"name"\s*:\s*"[a-zA-Z0-9_]+"/.exec(s.slice(i));
    if (!m) return out + s.slice(i);
    const start = i + m.index;
    out += s.slice(i, start);
    let depth = 0;
    let inStr = false;
    let esc = false;
    let closed = false;
    let j = start;
    for (; j < s.length; j++) {
      const ch = s[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) { j++; closed = true; break; }
      }
    }
    if (!closed) return out; // truncated tool call — drop the tail
    i = j;
  }
  return out;
}

function cleanAssistant(raw: string): string {
  if (!raw) return raw;
  if (!hasLeakedToolCall(raw)) return raw;
  let t = stripToolJson(raw);
  // The misfire tangled the fences (JSON + prose in one block) — strip fence
  // markers so the remaining prose/list renders as normal chat. Remove opening
  // fences (```lang\n) first, then any bare ``` / '''. The two-step order keeps
  // a prose word glued to a closing fence (```It) intact.
  t = t.replace(/```[a-zA-Z0-9]+\n/g, "").replace(/```/g, "").replace(/'''/g, "");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

const LANG_EXT: Record<string, string> = {
  sql: "sql", javascript: "js", js: "js", typescript: "ts", ts: "ts", tsx: "tsx", jsx: "jsx",
  python: "py", py: "py", json: "json", html: "html", css: "css", bash: "sh", sh: "sh",
  shell: "sh", yaml: "yaml", yml: "yaml", xml: "xml", markdown: "md", md: "md", java: "java",
};

/**
 * Code block for assistant replies: shiki-highlighted body (AI Elements
 * CodeBlock) with copy + download that actually work inside the Tauri webview.
 * streamdown's built-in download uses a browser blob anchor that no-ops here,
 * so we route copy through navigator.clipboard and download through the native
 * save dialog + Rust file write.
 */
const SHIKI_LANGS = new Set([
  "sql", "javascript", "js", "typescript", "ts", "tsx", "jsx", "python", "py", "json", "html",
  "css", "bash", "sh", "shell", "yaml", "yml", "xml", "markdown", "md", "java", "go", "rust",
  "c", "cpp", "csharp", "php", "ruby", "kotlin", "swift", "scala", "r", "dart", "diff", "text",
]);

/** Clipboard write that works in every webview (async API + textarea fallback). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    return true;
  } catch {
    return false;
  }
}

function ChatCodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  // Raw label for the download extension; safe (shiki-bundled) lang for render.
  const lang = language || "text";
  const safeLang = (SHIKI_LANGS.has(lang.toLowerCase()) ? lang.toLowerCase() : "text") as BundledLanguage;
  const copy = async () => {
    if (await copyText(code)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    }
  };
  const download = async () => {
    const ext = LANG_EXT[lang.toLowerCase()] ?? "txt";
    try {
      const path = await saveDialog({
        defaultPath: `snippet.${ext}`,
        filters: [{ name: lang.toUpperCase(), extensions: [ext] }],
      });
      if (path) await ipc.writeTextFile(path, code);
    } catch {
      /* user cancelled or save failed — nothing to do */
    }
  };
  return (
    <div className="group relative my-2">
      <CodeBlock code={code} language={safeLang}>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy code"
          title="Copy"
          className="flex h-6 w-6 items-center justify-center rounded-md bg-background/70 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-foreground group-hover:opacity-100"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => void download()}
          aria-label="Download code"
          title="Download"
          className="flex h-6 w-6 items-center justify-center rounded-md bg-background/70 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-foreground group-hover:opacity-100"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </CodeBlock>
    </div>
  );
}

/**
 * Table for assistant replies with Tauri-native copy (markdown → clipboard)
 * and download (CSV → native save dialog). Replaces streamdown's built-in
 * table controls, whose dropdown clips inside the scroll container and whose
 * blob download no-ops in the Tauri webview.
 */
function ChatTable({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLTableElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!ref.current) return;
    const data = extractTableDataFromElement(ref.current);
    if (await copyText(tableDataToMarkdown(data))) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    }
  };
  const download = async () => {
    if (!ref.current) return;
    const data = extractTableDataFromElement(ref.current);
    try {
      const path = await saveDialog({
        defaultPath: "table.csv",
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (path) await ipc.writeTextFile(path, tableDataToCSV(data));
    } catch {
      /* user cancelled */
    }
  };
  return (
    <div className="group/table my-2">
      <div className="flex justify-end gap-1 pb-1 opacity-0 transition-opacity group-hover/table:opacity-100">
        <button
          type="button"
          onClick={() => void copy()}
          aria-label="Copy table"
          title="Copy as markdown"
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => void download()}
          aria-label="Download table"
          title="Download as CSV"
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table ref={ref} className="w-full border-collapse text-[12px]">
          {children}
        </table>
      </div>
    </div>
  );
}

/** Extract raw text + language from react-markdown's <pre><code> children. */
function extractCode(children: unknown): { code: string; language: string } {
  const el = (Array.isArray(children) ? children[0] : children) as
    | { props?: { className?: string; children?: unknown } }
    | undefined;
  const className = el?.props?.className ?? "";
  const language = /language-(\S+)/.exec(className)?.[1] ?? "";
  const raw = el?.props?.children;
  const code = (typeof raw === "string" ? raw : Array.isArray(raw) ? raw.join("") : String(raw ?? "")).replace(/\n$/, "");
  return { code, language };
}

// streamdown/react-markdown component overrides for assistant replies: render
// fenced code blocks with our Tauri-native copy + download panel.
const CHAT_MD_COMPONENTS = {
  pre: ({ children }: { children?: unknown }) => {
    const { code, language } = extractCode(children);
    // Backstop: if a leaked tool call still reached a code block (e.g. a fence
    // the sanitizer couldn't untangle), strip the JSON and show only leftover
    // prose — never a raw JSON box.
    if (hasLeakedToolCall(code)) {
      const rest = stripToolJson(code).replace(/```/g, "").replace(/'''/g, "").trim();
      return rest ? <p className="whitespace-pre-wrap">{rest}</p> : null;
    }
    return <ChatCodeBlock code={code} language={language} />;
  },
  table: ({ children }: { children?: React.ReactNode }) => <ChatTable>{children}</ChatTable>,
  // Tailwind's reset strips list markers — restore 1. / • for reply lists.
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="my-1 list-decimal space-y-0.5 pl-5">{children}</ol>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="my-1 list-disc space-y-0.5 pl-5">{children}</ul>
  ),
} as const;

function Bubble({ message }: { message: Extract<ChatItem, { kind: "msg" }> }) {
  if (message.role === "user") {
    return (
      <Message from="user">
        <MessageContent className="[overflow-wrap:anywhere] whitespace-pre-wrap break-words">
          {message.content}
        </MessageContent>
        {message.attachments?.length ? (
          <div className="ml-auto flex max-w-full flex-wrap justify-end gap-1">
            {message.attachments.map((name) => (
              <span
                key={name}
                title={name}
                className="max-w-[180px] truncate rounded-md border border-border bg-secondary/50 px-2 py-0.5 text-[10.5px] text-muted-foreground"
              >
                {name}
              </span>
            ))}
          </div>
        ) : null}
      </Message>
    );
  }
  if (message.error) {
    return (
      <Message from="assistant">
        <MessageContent className="[overflow-wrap:anywhere] break-words text-destructive">
          {message.content}
        </MessageContent>
      </Message>
    );
  }
  return (
    <Message from="assistant">
      <MessageContent className="min-w-0 bg-transparent p-0">
        <MessageResponse components={CHAT_MD_COMPONENTS} controls={{ table: false }}>
          {cleanAssistant(message.content)}
        </MessageResponse>
        {message.streaming ? (
          <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-primary/70 align-middle" />
        ) : null}
      </MessageContent>
    </Message>
  );
}
