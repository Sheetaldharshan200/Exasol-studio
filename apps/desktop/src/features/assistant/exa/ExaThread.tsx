import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  AssistantRuntimeProvider,
  useAui,
  useAuiState,
  useExternalStoreRuntime,
  type ThreadMessageLike,
  type AppendMessage,
} from "@assistant-ui/react";
import {
  AtSign,
  Bot,
  Database as DatabaseIcon,
  MessageSquare,
  NotebookPen,
  PanelLeft as PanelLeftIcon,
  Plus as PlusIcon,
  Search,
  ShieldCheck as ShieldCheckIcon,
  Sparkles as SparklesIcon,
  Upload as ShareIcon,
  Wrench as WrenchIcon,
  X,
  Zap as ZapIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { EngineSessionInfo } from "@/lib/agent-client";
import { cn } from "@/lib/utils";
import { AgentMark } from "@/components/studio/AgentMark";
import { Thread } from "@/components/assistant-ui/thread";
import type { AgentProviderInfo } from "@/lib/agent-client";
import { ExaModelSelector, type PickedModel } from "./ExaModelSelector";
import {
  filterProviders,
  resolveContext,
  schemaArguments,
  tableArguments,
  type ContextChip,
  type ContextProvider,
  type ExaSnapshot,
} from "./context";
import { filterCommands, type SlashCommand } from "./commands";

/**
 * The Exa thread — the official assistant-ui thread UI (registry components in
 * components/assistant-ui/) over our opencode engine via the external-store
 * runtime. This file is the bridge: message conversion, the Exasol-branded
 * welcome, and Studio's composer controls (mode pill, model menu, @ context,
 * / commands) injected into the registry composer through ExaComposerContext.
 */

/** The panel's message model: ordered parts, so tool calls sit inline. */
export type ExaPart =
  | { type: "text"; text: string }
  | { type: "tool"; callId: string; name: string; ok?: boolean };
export type ExaMessage = { role: "user" | "assistant"; parts: ExaPart[] };

/** Chat = no tools · Plan = read-only tools · Agent = all tools. */
export type ChatMode = "chat" | "plan" | "agent";

const MODES: { id: ChatMode; label: string; icon: typeof Bot; hint: string }[] = [
  { id: "agent", label: "Agent", icon: Bot, hint: "Agent — Exa can use all tools" },
  { id: "plan", label: "Plan", icon: NotebookPen, hint: "Plan — read-only tools, propose before changing" },
  { id: "chat", label: "Chat", icon: MessageSquare, hint: "Chat — conversation only, no tools" },
];

/** Plain text of a message (for /share and copy) — tool calls become lines. */
export function messageText(m: ExaMessage): string {
  return m.parts
    .map((p) => (p.type === "text" ? p.text : `\n> tool: ${p.name}${p.ok === false ? " (failed)" : ""}\n`))
    .join("")
    .trim();
}

function toThreadMessage(m: ExaMessage): ThreadMessageLike {
  return {
    role: m.role,
    content: m.parts.map((p) =>
      p.type === "text"
        ? ({ type: "text", text: p.text } as const)
        : ({ type: "tool-call", toolName: p.name, toolCallId: p.callId, result: p.ok === undefined ? undefined : { ok: p.ok } } as const),
    ),
  };
}

/** Grouped starter suggestions (category chip → expandable options). */
type SuggestionGroup = {
  label: string;
  icon: typeof Bot;
  options: { label: string; prompt: string }[];
};

const SUGGESTION_GROUPS: SuggestionGroup[] = [
  {
    label: "Explore",
    icon: DatabaseIcon,
    options: [
      { label: "overview of my schemas", prompt: "Give me an overview of the schemas and tables in this database." },
      { label: "largest tables", prompt: "Which tables have the most rows, and how large are they?" },
      { label: "describe a table", prompt: "Describe the columns and types of the most important table in my current schema." },
    ],
  },
  {
    label: "Generate",
    icon: SparklesIcon,
    options: [
      { label: "top customers by revenue", prompt: "/generate top customers by revenue" },
      { label: "monthly sales trend", prompt: "/generate monthly sales trend for the last year" },
      { label: "duplicate detection", prompt: "/generate find duplicate rows in a table" },
    ],
  },
  {
    label: "Optimize",
    icon: ZapIcon,
    options: [
      { label: "current query", prompt: "/optimize" },
      { label: "find slow queries", prompt: "Which of my recent queries were slowest, and why?" },
    ],
  },
  {
    label: "Fix",
    icon: WrenchIcon,
    options: [
      { label: "the failing query", prompt: "/fix" },
      { label: "explain the last error", prompt: "Explain the error my last query produced and how to resolve it." },
    ],
  },
  {
    label: "Review",
    icon: ShieldCheckIcon,
    options: [
      { label: "current SQL", prompt: "/review" },
      { label: "destructive statements", prompt: "/review focus on destructive statements and missing WHERE clauses" },
    ],
  },
];

// ── Composer controls context (consumed inside the registry thread.tsx) ──
export type ExaComposerApi = {
  providers: AgentProviderInfo[];
  model: PickedModel | null;
  onPickModel: (m: PickedModel) => void;
  onSaveKey: (providerId: string, key: string) => Promise<void>;
  getSnapshot: () => ExaSnapshot;
  mode: ChatMode;
  setMode: (m: ChatMode) => void;
  chips: ContextChip[];
  addChip: (c: ContextChip | null) => void;
  removeChip: (id: string) => void;
};

const ExaComposerContext = createContext<ExaComposerApi | null>(null);
export const useExaComposer = () => useContext(ExaComposerContext);

/** Apply-a-SQL-block-to-the-editor handler, consumed by the markdown code header. */
const ExaApplySqlContext = createContext<((sql: string) => void) | null>(null);
export const useExaApplySql = () => useContext(ExaApplySqlContext);

/** Bucket sessions by recency for the sidebar's date-group headers. */
export function groupSessions(sessions: EngineSessionInfo[], now: number): { label: string; items: EngineSessionInfo[] }[] {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const today = dayStart.getTime();
  const yesterday = today - 86_400_000;
  const week = today - 6 * 86_400_000;
  const buckets: Record<string, EngineSessionInfo[]> = { Today: [], Yesterday: [], "Previous 7 days": [], Earlier: [] };
  const sorted = [...sessions].sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0));
  for (const s of sorted) {
    const t = s.updated ?? 0;
    const label = t >= today ? "Today" : t >= yesterday ? "Yesterday" : t >= week ? "Previous 7 days" : "Earlier";
    buckets[label].push(s);
  }
  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

/** Exa-branded welcome — plain logo (no bordered tile), example typography. */
function ExaWelcome() {
  return (
    <div className="mx-auto mb-6 flex w-full max-w-(--thread-max-width) flex-col items-center px-4 text-center">
      <AgentMark className="fade-in slide-in-from-bottom-1 animate-in fill-mode-both mb-4 h-10 w-10 duration-200" />
      <h1 className="fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-xl font-semibold duration-200 @md:text-2xl">
        How can I help you today?
      </h1>
      <p className="fade-in slide-in-from-bottom-2 animate-in fill-mode-both mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground duration-300">
        Grounded in your live schema. <span className="font-mono">@</span> attaches context,{" "}
        <span className="font-mono">/</span> runs commands.
      </p>
    </div>
  );
}

const suggestionChipClass =
  "text-foreground hover:bg-muted border-border/60 flex h-auto items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-normal whitespace-nowrap transition-colors [&_svg]:size-4";

/** Grouped starter chips below the composer (category → expandable options). */
export function ExaThreadSuggestions() {
  const aui = useAui();
  const api = useExaComposer();
  const [expandedLabel, setExpandedLabel] = useState<string | null>(null);
  const expandedGroup = SUGGESTION_GROUPS.find((g) => g.label === expandedLabel);

  const sendPrompt = (prompt: string) => {
    // Commands with an open argument (trailing space) go to the input to
    // finish typing; complete prompts send through the normal flow.
    if (prompt.endsWith(" ")) {
      aui.composer().setText(prompt);
      return;
    }
    void aui.thread().append({ role: "user", content: [{ type: "text", text: prompt }] });
  };
  if (!api) return null;

  return (
    <div className="flex w-full flex-col gap-2 px-4">
      <div className="scrollbar-none w-full overflow-x-auto">
        <div className="mx-auto flex w-max items-center gap-2">
          {SUGGESTION_GROUPS.map((group) => (
            <button
              key={group.label}
              type="button"
              className={cn(suggestionChipClass, group.label === expandedLabel && "bg-muted")}
              onClick={() => setExpandedLabel(group.label === expandedLabel ? null : group.label)}
            >
              <group.icon className="size-4" />
              {group.label}
            </button>
          ))}
        </div>
      </div>
      {expandedGroup && (
        <div key={expandedGroup.label} className="fade-in slide-in-from-top-1 animate-in scrollbar-none w-full overflow-x-auto duration-200">
          <div className="mx-auto flex w-max items-center gap-2">
            {expandedGroup.options.map((option) => (
              <button key={option.label} type="button" className={suggestionChipClass} onClick={() => sendPrompt(option.prompt)}>
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Mode pill · model menu · @-context button — rendered inside the registry
 * composer's action row (left side). Null-safe when the context is absent.
 */
export function ExaComposerControls() {
  const api = useExaComposer();
  const aui = useAui();
  if (!api) return null;
  const modeInfo = MODES.find((m) => m.id === api.mode)!;
  const ModeIcon = modeInfo.icon;
  return (
    <div className="flex items-center gap-1">
      {/* `+` adds @-context — our equivalent of the example's attach button. */}
      <button
        type="button"
        title="Add context (@)"
        onClick={() => {
          const text = aui.composer().getState?.()?.text ?? "";
          const next = text.endsWith("@") ? text : text + (text && !text.endsWith(" ") ? " @" : "@");
          aui.composer().setText(next);
        }}
        className="hover:bg-muted flex size-7 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:text-foreground"
      >
        <PlusIcon className="size-4" />
      </button>
      <ExaModelSelector providers={api.providers} model={api.model} onPick={api.onPickModel} onSaveKey={api.onSaveKey} />
      <button
        type="button"
        onClick={() => api.setMode(MODES[(MODES.findIndex((x) => x.id === api.mode) + 1) % MODES.length].id)}
        title={`${modeInfo.hint} — click to switch`}
        className="hover:bg-muted flex h-7 items-center gap-1 rounded-full px-2 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ModeIcon className="h-3.5 w-3.5" />
        <span className="hidden @md:inline">{modeInfo.label}</span>
      </button>
    </div>
  );
}

/** Context chips row shown above the registry composer's input. */
export function ExaComposerChips() {
  const api = useExaComposer();
  if (!api || api.chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 px-3 pt-2">
      {api.chips.map((c) => (
        <span key={c.id} className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 py-0.5 pl-1.5 pr-1 text-[10.5px] text-primary">
          <AtSign className="h-2.5 w-2.5" />
          {c.label}
          <button type="button" onClick={() => api.removeChip(c.id)} className="rounded hover:bg-primary/20" aria-label={`Remove ${c.label}`}>
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
    </div>
  );
}

/**
 * The @-context / /-command menus, floating above the registry composer.
 * Watches the runtime composer text; a trailing `@token` or leading `/token`
 * opens the menu. Picks resolve into chips (context) or rewrite the text
 * (commands) — submit itself stays with the registry composer.
 */
export function ExaComposerMenus() {
  const api = useExaComposer();
  const aui = useAui();
  const text = useAuiState((s) => s.composer.text);
  const [argFor, setArgFor] = useState<ContextProvider | null>(null);
  const [argQuery, setArgQuery] = useState("");

  const atTrigger = useMemo(() => {
    const m = /(?:^|\s)@([\w]*)$/.exec(text ?? "");
    return m ? { query: m[1] } : null;
  }, [text]);
  const slashTrigger = useMemo(() => {
    const m = /^\/([\w-]*)$/.exec(text ?? "");
    return m ? { query: m[1] } : null;
  }, [text]);

  if (!api) return null;
  const providerMenu = atTrigger && !argFor ? filterProviders(atTrigger.query) : [];
  const commandMenu = slashTrigger && !argFor ? filterCommands(slashTrigger.query) : [];
  const open = !!argFor || providerMenu.length > 0 || commandMenu.length > 0;
  if (!open) return null;

  const setText = (v: string) => aui.composer().setText(v);
  const stripAt = () => setText((text ?? "").replace(/(?:^|\s)@[\w]*$/, (m) => (m.startsWith("@") ? "" : m[0])));

  function pickProvider(p: ContextProvider) {
    if (p.needsArg) {
      setArgFor(p);
      setArgQuery("");
      return;
    }
    api!.addChip(resolveContext(p.id, null, api!.getSnapshot()));
    stripAt();
  }
  function pickArg(value: string) {
    if (argFor) api!.addChip(resolveContext(argFor.id, value, api!.getSnapshot()));
    setArgFor(null);
    stripAt();
  }
  function pickCommand(c: SlashCommand) {
    setText(`/${c.title} `);
  }

  const argOptions = (() => {
    if (!argFor) return [];
    const snap = api.getSnapshot();
    const all = argFor.needsArg === "schema" ? schemaArguments(snap) : tableArguments(snap);
    const q = argQuery.trim().toLowerCase();
    return q ? all.filter((o) => o.toLowerCase().includes(q)) : all;
  })();

  return (
    <div className="absolute bottom-full left-0 z-50 mb-1.5 max-h-[300px] w-[320px] overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
      {argFor ? (
        <>
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">
            <button type="button" onClick={() => setArgFor(null)} className="hover:text-foreground">@{argFor.title}</button>
            <span className="text-muted-foreground/50">/</span>
            <span className="text-foreground">pick a {argFor.needsArg}</span>
          </div>
          <div className="relative border-b border-border">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={argQuery}
              onChange={(e) => setArgQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && argOptions[0]) { e.preventDefault(); pickArg(argOptions[0]); }
                if (e.key === "Escape") { e.preventDefault(); setArgFor(null); }
              }}
              placeholder={`Search ${argFor.needsArg}s…`}
              className="h-8 w-full bg-transparent pl-8 pr-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto py-1 [scrollbar-width:thin]">
            {argOptions.length === 0 ? (
              <p className="px-3 py-3 text-center text-[11px] text-muted-foreground">Nothing cached yet — run a query to populate the catalog.</p>
            ) : (
              argOptions.slice(0, 200).map((o) => (
                <button key={o} type="button" onClick={() => pickArg(o)} className="flex w-full items-center px-3 py-1.5 text-left font-mono text-[11.5px] text-foreground hover:bg-secondary">
                  {o}
                </button>
              ))
            )}
          </div>
        </>
      ) : providerMenu.length > 0 ? (
        <div className="py-1">
          {providerMenu.map((p) => (
            <button key={p.id} type="button" onClick={() => pickProvider(p)} className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-secondary">
              <AtSign className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block text-[12px] font-medium text-foreground">@{p.title}</span>
                <span className="block truncate text-[10.5px] text-muted-foreground">{p.description}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="py-1">
          {commandMenu.map((c) => (
            <button key={c.id} type="button" onClick={() => pickCommand(c)} className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-secondary">
              <span className="mt-0.5 font-mono text-[12px] text-primary">/</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-medium text-foreground">
                  /{c.title}
                  {c.hint ? <span className="ml-1.5 font-normal text-muted-foreground">{c.hint}</span> : null}
                </span>
                <span className="block truncate text-[10.5px] text-muted-foreground">{c.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExaThread({
  messages,
  busy,
  onSendText,
  onCancel,
  onApplySql,
  composerApi,
  sessions,
  activeSessionId,
  onNewThread,
  onSelectSession,
  onShare,
  headerActions,
  sidebarFooter,
  defaultSidebarOpen = false,
}: {
  messages: ExaMessage[];
  busy: boolean;
  /** Send plain text (registry composer submit, suggestions, edits). */
  onSendText: (text: string) => void;
  onCancel: () => void;
  /** Apply a reply's SQL block into the workbench editor. */
  onApplySql?: (sql: string) => void;
  composerApi: ExaComposerApi;
  /** Persisted engine sessions for the sidebar (auto-titled). */
  sessions: EngineSessionInfo[];
  activeSessionId: string | null;
  onNewThread: () => void;
  onSelectSession: (id: string) => void;
  onShare: () => void;
  /** Surface controls (status dot, expand/collapse/close) for the header. */
  headerActions?: ReactNode;
  /** Extra content pinned to the sidebar bottom (CLI install, etc.). */
  sidebarFooter?: ReactNode;
  /** Full tab starts with the sidebar open; the narrow dock starts closed. */
  defaultSidebarOpen?: boolean;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(defaultSidebarOpen);
  const title = sessions.find((s) => s.id === activeSessionId)?.title ?? "New Chat";
  const groups = groupSessions(sessions, Date.now());
  // Latest handler behind a stable ref so the adapter never goes stale.
  const sendRef = useRef(onSendText);
  useEffect(() => {
    sendRef.current = onSendText;
  });

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: busy,
    convertMessage: toThreadMessage,
    onNew: async (m: AppendMessage) => {
      const text = m.content.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("");
      if (text.trim()) sendRef.current(text);
    },
    onCancel: async () => onCancel(),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ExaComposerContext.Provider value={composerApi}>
        <ExaApplySqlContext.Provider value={onApplySql ?? null}>
          {/* Neutral accent inside the thread: the example's design is
              monochrome (no green) — scope primary to foreground here so the
              send button, links and chips render neutral while the rest of
              Studio keeps its brand color. */}
          <div
            className="@container relative flex min-h-0 flex-1 bg-background"
            style={{
              ["--primary" as string]: "var(--foreground)",
              ["--primary-foreground" as string]: "var(--background)",
            }}
          >
            {/* ── Sidebar: brand, New Thread, date-grouped sessions ── */}
            {sidebarOpen ? (
              <>
                {/* Narrow containers overlay the sidebar; wide ones dock it. */}
                <div className="absolute inset-0 z-20 bg-black/30 @3xl:hidden" onClick={() => setSidebarOpen(false)} aria-hidden />
                <aside className="absolute inset-y-0 left-0 z-30 flex w-60 shrink-0 flex-col bg-muted/50 backdrop-blur-sm @3xl:static @3xl:z-auto @3xl:bg-muted/30 @3xl:backdrop-blur-none">
                  <div className="flex h-12 shrink-0 items-center gap-2 px-4 text-sm font-medium">
                    <AgentMark className="size-5 shrink-0" />
                    <span className="text-foreground/90 truncate">Exa</span>
                    <span className="rounded-full border border-border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Beta
                    </span>
                  </div>
                  <div className="px-2 pb-1">
                    <button
                      type="button"
                      onClick={onNewThread}
                      className="bg-muted hover:bg-muted/80 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition-colors"
                    >
                      <PlusIcon className="size-4" /> New Thread
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 [scrollbar-width:thin]">
                    {groups.map((g) => (
                      <div key={g.label}>
                        <p className="px-3 pt-3 pb-1 text-xs text-muted-foreground">{g.label}</p>
                        {g.items.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => onSelectSession(s.id)}
                            className={cn(
                              "hover:bg-muted flex w-full items-center rounded-md px-3 py-1.5 text-left text-sm text-foreground/90 transition-colors",
                              s.id === activeSessionId && "bg-muted",
                            )}
                          >
                            <span className="truncate">{s.title?.trim() || "Untitled chat"}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                  {sidebarFooter ? <div className="shrink-0 px-3 pb-3">{sidebarFooter}</div> : null}
                </aside>
              </>
            ) : null}

            {/* ── Main column: header + thread ── */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <header className="flex h-12 shrink-0 items-center gap-2 px-3">
                <button
                  type="button"
                  title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
                  onClick={() => setSidebarOpen((o) => !o)}
                  className="hover:bg-muted flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                >
                  <PanelLeftIcon className="size-4" />
                </button>
                <span className="min-w-0 truncate text-sm font-medium">{title}</span>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    title="Export conversation as Markdown"
                    onClick={onShare}
                    disabled={messages.length === 0}
                    className="hover:bg-muted flex size-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-40"
                  >
                    <ShareIcon className="size-4" />
                  </button>
                  {headerActions}
                </div>
              </header>
              <div className="min-h-0 flex-1">
                <Thread components={{ Welcome: ExaWelcome }} />
              </div>
            </div>
          </div>
        </ExaApplySqlContext.Provider>
      </ExaComposerContext.Provider>
    </AssistantRuntimeProvider>
  );
}
