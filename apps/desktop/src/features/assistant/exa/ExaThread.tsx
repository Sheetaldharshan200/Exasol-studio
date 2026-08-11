import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AssistantRuntimeProvider, useAui, useAuiState } from "@assistant-ui/react";
import { OpenCodeAttachmentAdapter, useOpenCodePermissions, useOpenCodeRuntime } from "@assistant-ui/react-opencode";
import type { createOpencodeClient } from "@assistant-ui/react-opencode";

type OpencodeClient = ReturnType<typeof createOpencodeClient>;
import {
  Archive as ArchiveIcon,
  ArrowUp as SendArrowIcon,
  Bot,
  Database as DatabaseIcon,
  History as HistoryIcon,
  MessageSquare,
  NotebookPen,
  Pencil as PencilIcon,
  Plus as PlusIcon,
  Search,
  ShieldCheck as ShieldCheckIcon,
  Sparkles as SparklesIcon,
  Trash2 as Trash2Icon,
  Upload as ShareIcon,
  Wrench as WrenchIcon,
  X,
  Zap as ZapIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { EngineCatalogProvider, EngineSessionInfo } from "@/lib/agent-client";
import { cn } from "@/lib/utils";
import { AgentMark } from "@/components/studio/AgentMark";
import { Thread } from "@/components/assistant-ui/thread";
import { ComposerAddAttachment } from "@/components/assistant-ui/attachment";
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
import { filterCommands, type LocalCommandId, type SlashCommand } from "./commands";
import { ExaMcpPanel } from "./ExaMcpPanel";

/**
 * The Exa thread — the official assistant-ui thread UI (registry components in
 * components/assistant-ui/) over our opencode engine via the official
 * @assistant-ui/react-opencode runtime. This file adds the Exasol-branded
 * welcome, the sessions sidebar, and Studio's composer controls (mode pill,
 * model menu, @ context, / commands) via ExaComposerContext.
 */

/** Chat = no tools · Plan = read-only tools · Agent = all tools. */
export type ChatMode = "chat" | "plan" | "agent";

const MODES: { id: ChatMode; label: string; icon: typeof Bot; hint: string }[] = [
  { id: "agent", label: "Agent", icon: Bot, hint: "Agent — Exa can use all tools" },
  { id: "plan", label: "Plan", icon: NotebookPen, hint: "Plan — read-only tools, propose before changing" },
  { id: "chat", label: "Chat", icon: MessageSquare, hint: "Chat — conversation only, no tools" },
];

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
  /** A picked slash command, shown as a chip; the input text becomes its argument. */
  pendingCommand: SlashCommand | null;
  setPendingCommand: (c: SlashCommand | null) => void;
  /** Run a local command (/new, /export, /compact) immediately. */
  runLocal: (id: LocalCommandId) => void;
  /** The FULL models.dev catalog (every provider opencode supports). */
  loadCatalog: () => Promise<EngineCatalogProvider[]>;
  /** Refresh providers/models after a successful OAuth connect. */
  onConnected: () => Promise<void> | void;
  /**
   * The panel's send pipeline: slash-command expansion, @-context chips,
   * mode directives, quote injection. Returns the final engine text, or
   * null when the input was a local command it handled itself.
   */
  expandForSend: (text: string, quote?: string) => string | null;
};

const ExaComposerContext = createContext<ExaComposerApi | null>(null);
export const useExaComposer = () => useContext(ExaComposerContext);

/** Apply-a-SQL-block-to-the-editor handler, consumed by the markdown code header. */
const ExaApplySqlContext = createContext<((sql: string) => void) | null>(null);
export const useExaApplySql = () => useContext(ExaApplySqlContext);

/**
 * /share and the floating share button: export the CURRENT runtime thread as
 * Markdown (the runtime owns messages now — no panel copy exists).
 */
function ExaShareListener() {
  const aui = useAui();
  useEffect(() => {
    const onShare = () => {
      const msgs = aui.thread().getState?.()?.messages ?? [];
      const lines: string[] = ["# Exa conversation", ""];
      for (const m of msgs as unknown as { role: string; content: readonly { type: string; text?: string; toolName?: string }[] }[]) {
        if (m.role !== "user" && m.role !== "assistant") continue;
        lines.push(m.role === "user" ? "## You" : "## Exa", "");
        for (const part of m.content) {
          if (part.type === "text" && part.text) lines.push(part.text, "");
          else if (part.type === "tool-call") lines.push(`> tool: ${part.toolName ?? "tool"}`, "");
        }
      }
      void (async () => {
        try {
          const { save } = await import("@tauri-apps/plugin-dialog");
          const { ipc } = await import("@/lib/ipc");
          const path = await save({ defaultPath: "exa-conversation.md", filters: [{ name: "Markdown", extensions: ["md"] }] });
          if (path) await ipc.writeTextFile(path, lines.join("\n"));
        } catch {
          /* cancelled */
        }
      })();
    };
    window.addEventListener("exa:share", onShare);
    return () => window.removeEventListener("exa:share", onShare);
  }, [aui]);
  return null;
}

/**
 * Tool-permission approvals: the engine PAUSES a turn until the request is
 * answered, so pending asks must always be visible. Rendered as a bar pinned
 * above the composer; each request offers Allow once / Always / Reject.
 */
function ExaPermissionBar() {
  const { pending, reply } = useOpenCodePermissions();
  if (pending.length === 0) return null;
  return (
    <div className="pointer-events-auto mx-auto mb-2 w-full max-w-2xl px-4">
      {pending.map((req) => {
        const label = req.title?.trim() || req.toolName || req.permission;
        return (
          <div key={req.id} className="mb-1.5 flex items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2 shadow-sm">
            <ShieldCheckIcon className="size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium text-foreground">Exa asks to use {label}</p>
              {req.patterns.length > 0 && req.patterns[0] !== "*" ? (
                <p className="truncate font-mono text-[10.5px] text-muted-foreground">{req.patterns.join("  ")}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void reply(req.id, "once").catch(() => undefined)}
              className="h-6.5 shrink-0 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/85"
            >
              Allow once
            </button>
            <button
              type="button"
              onClick={() => void reply(req.id, "always").catch(() => undefined)}
              className="h-6.5 shrink-0 rounded-md border border-border px-2 text-[11px] text-foreground hover:bg-muted"
            >
              Always
            </button>
            <button
              type="button"
              onClick={() => void reply(req.id, "reject").catch(() => undefined)}
              className="h-6.5 shrink-0 rounded-md border border-border px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Reject
            </button>
          </div>
        );
      })}
    </div>
  );
}

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
    // finish typing; complete prompts run the panel's expand pipeline first.
    if (prompt.endsWith(" ")) {
      aui.composer().setText(prompt);
      return;
    }
    const expanded = api?.expandForSend(prompt);
    if (expanded === null || expanded === undefined || !expanded.trim()) return;
    void aui.thread().append(expanded);
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
  // The model pill's "All providers…" entry opens the provider menu directly;
  // /connect and /models open it from the composer.
  const [providersOpen, setProvidersOpen] = useState(false);
  useEffect(() => {
    const openProviders = () => setProvidersOpen(true);
    window.addEventListener("exa:open-providers", openProviders);
    return () => window.removeEventListener("exa:open-providers", openProviders);
  }, []);
  if (!api) return null;
  const modeInfo = MODES.find((m) => m.id === api.mode)!;
  const ModeIcon = modeInfo.icon;
  return (
    <div className="flex min-w-0 items-center gap-1">
      {/* `+` attaches files/photos (multi-select, sent to the engine as
          file parts); typing @ still opens the DB context menu. */}
      <ComposerAddAttachment />
      <ExaModelSelector
        providers={api.providers}
        model={api.model}
        onPick={api.onPickModel}
        onSaveKey={api.onSaveKey}
        onConnected={api.onConnected}
        loadCatalog={api.loadCatalog}
        open={providersOpen}
        onOpenChange={setProvidersOpen}
      />
      <button
        type="button"
        onClick={() => api.setMode(MODES[(MODES.findIndex((x) => x.id === api.mode) + 1) % MODES.length].id)}
        title={`${modeInfo.hint} — click to switch`}
        className="hover:bg-muted focus-visible:bg-muted flex h-7 items-center gap-1 rounded-full px-2 text-[11.5px] text-muted-foreground outline-none transition-colors hover:text-foreground"
      >
        <ModeIcon className="h-3.5 w-3.5" />
        <span className="hidden @md:inline">{modeInfo.label}</span>
      </button>
    </div>
  );
}

/**
 * The composer's submit path: expand (slash commands, chips, directives)
 * via the panel pipeline, then append through the official runtime. Replaces
 * ComposerPrimitive.Send so the ENGINE receives the expanded prompt while
 * the composer stays a plain text box. Also captures Enter on the input.
 */
export function ExaSendButton() {
  const api = useExaComposer();
  const aui = useAui();
  const text = useAuiState((s) => s.composer.text);
  const quote = useAuiState((s) => s.composer.quote);
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const submitRef = useRef(() => {});
  const hasAttachments = useAuiState((s) => s.composer.attachments.length > 0);
  submitRef.current = () => {
    const raw = (text ?? "").trim();
    if (!api || isRunning) return;
    if (!raw && !hasAttachments) return;
    // The quote isn't serialized to the engine by the runtime — embed it in
    // the text; the composer clears its own state on send().
    const expanded = api.expandForSend(raw, quote?.text);
    if (expanded === null) {
      // Local command — handled panel-side; just clear the input.
      aui.composer().setText("");
      return;
    }
    // send() carries text + attachments + clears the composer. setText is
    // store-synchronous, so send() sees the expanded prompt.
    aui.composer().setText(expanded);
    void aui.composer().send();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      if (document.body.dataset.exaMenuOpen) return; // menus own Enter
      const t = e.target as HTMLElement | null;
      if (!t?.closest?.('[data-slot="aui_composer-shell"]')) return;
      e.preventDefault();
      e.stopPropagation();
      submitRef.current();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);
  useEffect(() => {
    const PASTE_ATTACH_THRESHOLD = 4000;
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest?.('[data-slot="aui_composer-shell"]')) return;
      const pasted = e.clipboardData?.getData("text/plain") ?? "";
      if (pasted.length <= PASTE_ATTACH_THRESHOLD) return;
      e.preventDefault();
      e.stopPropagation();
      const file = new File([pasted], `pasted-${pasted.length}-chars.txt`, { type: "text/plain" });
      void aui.composer().addAttachment(file);
    };
    document.addEventListener("paste", onPaste, true);
    return () => document.removeEventListener("paste", onPaste, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!api) return null;
  return (
    <button
      type="button"
      title="Send message"
      aria-label="Send message"
      disabled={isRunning || !(text ?? "").trim()}
      onClick={() => submitRef.current()}
      className="bg-primary text-primary-foreground hover:bg-primary/85 flex size-7 items-center justify-center rounded-full outline-none disabled:opacity-40"
    >
      <SendArrowIcon className="size-4.5" />
    </button>
  );
}

/** Context chips row shown above the registry composer's input. */
export function ExaComposerChips() {
  const api = useExaComposer();
  if (!api || (api.chips.length === 0 && !api.pendingCommand)) return null;
  return (
    <div className="flex flex-wrap gap-1 px-2 pt-1.5">
      {api.pendingCommand ? (
        <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-1.5 py-0.5 text-[12px] leading-none font-medium text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
          /{api.pendingCommand.title}
          <button type="button" onClick={() => api.setPendingCommand(null)} className="rounded opacity-70 hover:opacity-100" aria-label="Remove command">
            <X className="size-3" />
          </button>
        </span>
      ) : null}
      {api.chips.map((c) => (
        <span
          key={c.id}
          className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-1.5 py-0.5 text-[12px] leading-none font-medium text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
        >
          <WrenchIcon className="size-3" />
          {c.label}
          <button type="button" onClick={() => api.removeChip(c.id)} className="rounded opacity-70 hover:opacity-100" aria-label={`Remove ${c.label}`}>
            <X className="size-3" />
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
  // Keyboard selection: the first row is auto-active, ↑/↓ move, Enter picks.
  const [hover, setHover] = useState(0);

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
  useEffect(() => {
    if (open) document.body.dataset.exaMenuOpen = "1";
    else delete document.body.dataset.exaMenuOpen;
    return () => {
      delete document.body.dataset.exaMenuOpen;
    };
  }, [open]);
  const listKind: "provider" | "command" | null =
    !argFor && providerMenu.length > 0 ? "provider" : !argFor && commandMenu.length > 0 ? "command" : null;

  // Keyboard grammar for the list menus, captured BEFORE the composer's own
  // Enter-submits handler: first row auto-active, ↑/↓ move, Enter/Tab pick,
  // Esc dismisses the trigger. Refs keep the capture listener current.
  const kbRef = useRef({ len: 0, hover: 0, pick: (_i: number) => {}, esc: () => {} });
  kbRef.current.len = listKind === "provider" ? providerMenu.length : commandMenu.length;
  kbRef.current.hover = hover;
  kbRef.current.pick = (i: number) => {
    if (listKind === "provider") {
      const p = providerMenu[i] ?? providerMenu[0];
      if (p) pickProvider(p);
    } else if (listKind === "command") {
      const c = commandMenu[i] ?? commandMenu[0];
      if (c) pickCommand(c);
    }
  };
  kbRef.current.esc = () => {
    if (listKind === "provider") stripAt();
    else setText("");
  };
  useEffect(() => setHover(0), [atTrigger?.query, slashTrigger?.query, argFor]);
  useEffect(() => {
    if (!listKind) return;
    const onKey = (e: KeyboardEvent) => {
      const k = kbRef.current;
      if (k.len === 0) return;
      if (e.key === "ArrowDown") setHover((h) => (h + 1) % k.len);
      else if (e.key === "ArrowUp") setHover((h) => (h - 1 + k.len) % k.len);
      else if (e.key === "Enter" || e.key === "Tab") k.pick(k.hover);
      else if (e.key === "Escape") k.esc();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [listKind]);

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
    // Local commands run immediately; prompt commands become a chip and the
    // input text becomes their argument (the example's directive-chip flow).
    setText("");
    if (c.kind === "local") {
      api!.runLocal(c.id as LocalCommandId);
      return;
    }
    api!.setPendingCommand(c);
  }

  const argOptions = (() => {
    if (!argFor) return [];
    const snap = api.getSnapshot();
    const all = argFor.needsArg === "schema" ? schemaArguments(snap) : tableArguments(snap);
    const q = argQuery.trim().toLowerCase();
    return q ? all.filter((o) => o.toLowerCase().includes(q)) : all;
  })();

  return (
    <div className="absolute bottom-full left-0 z-50 mb-1.5 max-h-[300px] w-80 max-w-full overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
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
        <div className="max-h-[260px] overflow-y-auto py-1 [scrollbar-width:thin]">
          {providerMenu.map((p, i) => {
            // Grey out providers whose data isn't attachable right now, so a
            // pick never fails silently.
            const snap = api!.getSnapshot();
            const available =
              p.needsArg !== null ||
              (p.id === "query"
                ? snap.editorSql.trim().length > 0
                : p.id === "results"
                  ? snap.lastResult !== null
                  : p.id === "history"
                    ? snap.history.length > 0
                    : true);
            return (
              <button
                key={p.id}
                type="button"
                disabled={!available}
                // Keep the keyboard-active row visible while ↑/↓ navigating.
                ref={i === hover ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                onMouseEnter={() => setHover(i)}
                onClick={() => pickProvider(p)}
                className={cn(
                  "flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent",
                  i === hover && "bg-secondary",
                )}
              >
                <span className="text-[12px] font-medium text-foreground">
                  {p.title}
                  {!available ? <span className="ml-1.5 font-normal text-muted-foreground">nothing to attach</span> : null}
                </span>
                <span className="block max-w-full truncate text-[10.5px] text-muted-foreground">{p.description}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="max-h-[260px] overflow-y-auto py-1 [scrollbar-width:thin]">
          {commandMenu.map((c, i) => (
            <button
              key={c.id}
              type="button"
              // Keep the keyboard-active row visible while ↑/↓ navigating.
              ref={i === hover ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
              onMouseEnter={() => setHover(i)}
              onClick={() => pickCommand(c)}
              className={cn("flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-secondary", i === hover && "bg-secondary")}
            >
              <span className="text-[12px] font-medium text-foreground">
                {c.title}
                {c.hint ? <span className="ml-1.5 font-normal text-muted-foreground">{c.hint}</span> : null}
              </span>
              <span className="block max-w-full truncate text-[10.5px] text-muted-foreground">{c.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExaThread({
  client,
  initialSessionId,
  onSessionChange,
  hideTools = false,
  onApplySql,
  composerApi,
  sessions,
  activeSessionId,
  onNewThread,
  onSelectSession,
  onRenameSession,
  onDeleteSession,
  onArchiveSession,
  headerActions,
  sidebarFooter,
  defaultSidebarOpen = false,
}: {
  /** The engine SDK client (tauri-plugin-http transport) — see engine-client. */
  client: OpencodeClient;
  /** Session restored on mount (the runtime owns sessions from here on). */
  initialSessionId?: string;
  /** The runtime's live session id (persist + drive undo/compact from it). */
  onSessionChange?: (id: string | undefined) => void;
  /** /details — hide tool-execution chips in the thread. */
  hideTools?: boolean;
  /** Apply a reply's SQL block into the workbench editor. */
  onApplySql?: (sql: string) => void;
  composerApi: ExaComposerApi;
  /** Persisted engine sessions for the sidebar (auto-titled). */
  sessions: EngineSessionInfo[];
  activeSessionId: string | null;
  onNewThread: () => void;
  onSelectSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  onDeleteSession: (id: string) => void;
  onArchiveSession: (id: string) => void;
  /** Surface controls (status dot, expand/collapse/close) for the header. */
  headerActions?: ReactNode;
  /** Extra content pinned to the sidebar bottom (CLI install, etc.). */
  sidebarFooter?: ReactNode;
  /** Full tab starts with the sidebar open; the narrow dock starts closed. */
  defaultSidebarOpen?: boolean;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(defaultSidebarOpen);
  // Inline rename state for the sidebar rows (pencil → input, Enter/Esc).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const groups = groupSessions(sessions, Date.now());

  const commitRename = () => {
    if (editingId && titleDraft.trim()) onRenameSession(editingId, titleDraft);
    setEditingId(null);
  };

  // /sessions opens the thread list; /mcp opens server configuration.
  const [mcpOpen, setMcpOpen] = useState(false);
  useEffect(() => {
    const openSessions = () => setSidebarOpen(true);
    const openMcp = () => setMcpOpen(true);
    window.addEventListener("exa:open-sessions", openSessions);
    window.addEventListener("exa:open-mcp", openMcp);
    return () => {
      window.removeEventListener("exa:open-sessions", openSessions);
      window.removeEventListener("exa:open-mcp", openMcp);
    };
  }, []);

  // The OFFICIAL assistant-ui opencode runtime: sessions, streaming part
  // projection, tool calls, permissions and reconnect are all handled by it —
  // this replaced our hand-rolled external-store bridge (event mapping,
  // replay hydration, upserts, cross-surface sync).
  const attachmentAdapter = useMemo(() => new OpenCodeAttachmentAdapter(), []);
  const runtime = useOpenCodeRuntime({
    client,
    initialSessionId,
    adapters: { attachments: attachmentAdapter },
    // Chat mode rides the tools-free "exa-chat" agent (no tools attached at
    // all — also what keeps small local models usable); Plan/Agent ride "exa"
    // (MCP tools on, coding tools permission-denied). The hook reads options
    // per render, so this follows the mode pill live.
    defaultAgent: composerApi.mode === "chat" ? "exa-chat" : "exa",
    defaultModel: composerApi.model ? { providerID: composerApi.model.providerID, modelID: composerApi.model.modelID } : undefined,
    onThreadIdChange: (id) => onSessionChange?.(id),
    onError: (err) => {
      // Console-only errors leave the working indicator implying progress
      // forever — surface the failure where the user can see it.
      console.error("[exa] engine runtime error", err);
      const msg = err instanceof Error ? err.message : String(err);
      window.dispatchEvent(
        new CustomEvent("studio:notice", {
          detail: { kind: "error", title: "Exa couldn't complete the turn", body: msg.slice(0, 300) },
        }),
      );
    },
  });

  // Engine sessions are created EAGERLY, never lazily on first message: the
  // runtime reports a session-less thread as disabled, which disables the
  // composer textarea — a fresh install could never type its first message.
  const creatingRef = useRef(false);
  const startFreshSession = async () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    try {
      const created = await client.session.create({});
      const id = (created as { data?: { id?: string } })?.data?.id;
      if (id) await runtime.threads.switchToThread(id);
    } catch (err) {
      console.error("[exa] could not create an engine session", err);
    } finally {
      creatingRef.current = false;
    }
  };
  useEffect(() => {
    if (!initialSessionId) void startFreshSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "New chat" (panel button, /new command) starts a fresh engine session.
  useEffect(() => {
    const newThread = () => void startFreshSession();
    window.addEventListener("exa:new-thread", newThread);
    return () => window.removeEventListener("exa:new-thread", newThread);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime, client]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ExaComposerContext.Provider value={composerApi}>
        <ExaApplySqlContext.Provider value={onApplySql ?? null}>
          <ExaShareListener />
          {/* Neutral accent inside the thread: the example's design is
              monochrome (no green) — scope primary to foreground here so the
              send button, links and chips render neutral while the rest of
              Studio keeps its brand color. */}
          <div
            className="@container relative flex min-h-0 flex-1 bg-background"
            data-hide-tools={hideTools || undefined}
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
                        {g.items.map((s) =>
                          editingId === s.id ? (
                            <input
                              key={s.id}
                              autoFocus
                              data-bare
                              value={titleDraft}
                              onChange={(e) => setTitleDraft(e.target.value)}
                              onBlur={commitRename}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitRename();
                                if (e.key === "Escape") setEditingId(null);
                              }}
                              className="bg-muted w-full rounded-md border border-border px-3 py-1.5 text-sm text-foreground outline-none"
                            />
                          ) : (
                            <div
                              key={s.id}
                              className={cn(
                                "group/session hover:bg-muted flex w-full items-center rounded-md transition-colors",
                                s.id === activeSessionId && "bg-muted",
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  // The engine session id doubles as the remote
                                  // thread id — the runtime fetches it on demand.
                                  // Persist/highlight only once the switch took,
                                  // so state never points at a session the
                                  // runtime failed to open.
                                  runtime.threads
                                    .switchToThread(s.id)
                                    .then(() => onSelectSession(s.id))
                                    .catch((err) => console.error("[exa] session switch failed", err));
                                }}
                                className="min-w-0 flex-1 px-3 py-1.5 text-left text-sm text-foreground/90"
                              >
                                <span className="block truncate">{s.title?.trim() || "Untitled chat"}</span>
                              </button>
                              {/* Hover actions: rename / archive / delete. */}
                              <div className="mr-1 hidden shrink-0 items-center gap-0.5 group-hover/session:flex">
                                <button
                                  type="button"
                                  title="Rename"
                                  onClick={() => {
                                    setEditingId(s.id);
                                    setTitleDraft(s.title ?? "");
                                  }}
                                  className="hover:bg-background/60 flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                                >
                                  <PencilIcon className="size-3" />
                                </button>
                                <button
                                  type="button"
                                  title="Archive (hide from this list)"
                                  onClick={() => onArchiveSession(s.id)}
                                  className="hover:bg-background/60 flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                                >
                                  <ArchiveIcon className="size-3" />
                                </button>
                                <button
                                  type="button"
                                  title="Delete permanently"
                                  onClick={() => onDeleteSession(s.id)}
                                  className="hover:bg-background/60 flex size-6 items-center justify-center rounded text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2Icon className="size-3" />
                                </button>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    ))}
                  </div>
                  {sidebarFooter ? <div className="shrink-0 px-3 pb-3">{sidebarFooter}</div> : null}
                </aside>
              </>
            ) : null}

            {/* ── Main column: headerless — a floating cluster carries the
                controls; the workbench tab already names the surface. ── */}
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="pointer-events-none absolute right-2 top-1.5 z-10">
                <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-border/40 bg-background/70 px-1 py-0.5 backdrop-blur-sm">
                  <button
                    type="button"
                    title={sidebarOpen ? "Hide history" : "Chat history"}
                    onClick={() => setSidebarOpen((o) => !o)}
                    className="hover:bg-muted flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <HistoryIcon className="size-4" />
                  </button>
                  <button
                    type="button"
                    title="Export conversation as Markdown"
                    onClick={() => window.dispatchEvent(new CustomEvent("exa:share"))}
                    className="hover:bg-muted flex size-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <ShareIcon className="size-4" />
                  </button>
                  {headerActions}
                </div>
              </div>
              <div className="relative flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1">
                  <Thread components={{ Welcome: ExaWelcome }} />
                </div>
                <div className="absolute inset-x-0 bottom-0 z-10">
                  <ExaPermissionBar />
                </div>
              </div>
            </div>

            {/* /mcp — engine-side MCP server configuration overlay. */}
            <ExaMcpPanel open={mcpOpen} onClose={() => setMcpOpen(false)} />
          </div>
        </ExaApplySqlContext.Provider>
      </ExaComposerContext.Provider>
    </AssistantRuntimeProvider>
  );
}
