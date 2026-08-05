import { useEffect, useMemo, useRef, useState } from "react";
import { AtSign, Bot, MessageSquare, NotebookPen, Search, Send, SlashSquare, Square, X } from "lucide-react";
import type { AgentProviderInfo } from "@/lib/agent-client";
import { cn } from "@/lib/utils";
import { ModelMenu, type PickedModel } from "./ModelMenu";
import {
  filterProviders,
  resolveContext,
  schemaArguments,
  tableArguments,
  type ContextChip,
  type ContextProvider,
  type ContextProviderId,
  type ExaSnapshot,
} from "./context";
import { expandCommand, filterCommands, parseSlash, type SlashCommand, type SlashCommandId } from "./commands";

/** Chat = no tools · Plan = read-only tools · Agent = all tools (continue.dev's modes). */
export type ChatMode = "chat" | "plan" | "agent";

const MODES: { id: ChatMode; label: string; icon: typeof Bot; hint: string }[] = [
  { id: "agent", label: "Agent", icon: Bot, hint: "Agent — Exa can use all tools" },
  { id: "plan", label: "Plan", icon: NotebookPen, hint: "Plan — read-only tools, propose before changing" },
  { id: "chat", label: "Chat", icon: MessageSquare, hint: "Chat — conversation only, no tools" },
];

/** What a submit hands the panel: display text, engine prompt text, context. */
export type ComposerSubmission = { shown: string; engine: string; chips: ContextChip[]; mode: ChatMode };

/**
 * The Exa composer — continue.dev's input grammar on Studio components: a
 * rounded, focus-ringed surface with context chips on top, the textarea, and a
 * bottom toolbar (mode pill · inline model selector · @ context · send).
 *
 * `@` opens the context-provider menu (schema/table pickers included); `/` at
 * the start opens the slash-command menu. Prompt-kind commands expand into an
 * engine prompt with auto-attached context; local commands (/clear, /share)
 * bubble up via `onLocalCommand`.
 */
export function ChatComposer({
  providers,
  model,
  onPickModel,
  onSaveKey,
  getSnapshot,
  busy,
  onSend,
  onStop,
  onLocalCommand,
}: {
  providers: AgentProviderInfo[];
  model: PickedModel | null;
  onPickModel: (m: PickedModel) => void;
  onSaveKey: (providerId: string, key: string) => Promise<void>;
  getSnapshot: () => ExaSnapshot;
  busy: boolean;
  onSend: (s: ComposerSubmission) => void;
  onStop: () => void;
  onLocalCommand: (id: Extract<SlashCommandId, "clear" | "share">) => void;
}) {
  const [draft, setDraft] = useState("");
  const [chips, setChips] = useState<ContextChip[]>([]);
  const [mode, setMode] = useState<ChatMode>("agent");
  const [focused, setFocused] = useState(false);
  // @-menu state: providers list, or a provider's argument (schema/table) list.
  const [argFor, setArgFor] = useState<ContextProvider | null>(null);
  const [argQuery, setArgQuery] = useState("");
  const [hover, setHover] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // A trailing `@token` opens the provider menu; a leading `/token` (no space
  // yet) opens the command menu. They are mutually exclusive by construction.
  const atTrigger = useMemo(() => {
    const m = /(?:^|\s)@([\w]*)$/.exec(draft);
    return m ? { query: m[1] } : null;
  }, [draft]);
  const slashTrigger = useMemo(() => {
    const m = /^\/([\w-]*)$/.exec(draft);
    return m ? { query: m[1] } : null;
  }, [draft]);

  const providerMenu = atTrigger && !argFor ? filterProviders(atTrigger.query) : [];
  const commandMenu = slashTrigger ? filterCommands(slashTrigger.query) : [];
  const listMenu: { kind: "provider" | "command"; length: number } | null = argFor
    ? null
    : providerMenu.length > 0
      ? { kind: "provider", length: providerMenu.length }
      : commandMenu.length > 0
        ? { kind: "command", length: commandMenu.length }
        : null;
  const menuOpen = !!listMenu || !!argFor;

  useEffect(() => setHover(0), [atTrigger?.query, slashTrigger?.query, argFor]);

  function stripAtTrigger() {
    setDraft((d) => d.replace(/(?:^|\s)@[\w]*$/, (m) => (m.startsWith("@") ? "" : m[0])));
  }

  function addChip(chip: ContextChip | null) {
    if (chip) setChips((cs) => (cs.some((c) => c.id === chip.id) ? cs : [...cs, chip]));
  }

  function pickProvider(p: ContextProvider) {
    if (p.needsArg) {
      setArgFor(p);
      setArgQuery("");
      return;
    }
    addChip(resolveContext(p.id, null, getSnapshot()));
    stripAtTrigger();
    taRef.current?.focus();
  }

  function pickArg(value: string) {
    if (argFor) addChip(resolveContext(argFor.id, value, getSnapshot()));
    setArgFor(null);
    stripAtTrigger();
    taRef.current?.focus();
  }

  function pickCommand(c: SlashCommand) {
    // Insert `/name ` so the user can type the argument, then Enter submits.
    // Local no-arg commands run immediately — nothing to type.
    if (c.kind === "local") {
      setDraft("");
      onLocalCommand(c.id as "clear" | "share");
      return;
    }
    setDraft(`/${c.title} `);
    taRef.current?.focus();
  }

  const argOptions = useMemo(() => {
    if (!argFor) return [];
    const snap = getSnapshot();
    const all = argFor.needsArg === "schema" ? schemaArguments(snap) : tableArguments(snap);
    const q = argQuery.trim().toLowerCase();
    return q ? all.filter((o) => o.toLowerCase().includes(q)) : all;
  }, [argFor, argQuery, getSnapshot]);

  function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    const slash = parseSlash(text);
    if (slash?.command.kind === "local") {
      setDraft("");
      onLocalCommand(slash.command.id as "clear" | "share");
      return;
    }
    let engine = text;
    let allChips = chips;
    if (slash) {
      // Expand the command and auto-attach its context (skipping providers
      // whose data isn't available), deduped against manual chips.
      const snap = getSnapshot();
      const e = expandCommand(slash.command.id, slash.arg, snap);
      engine = e.text;
      const auto = e.providerIds
        .map((id: ContextProviderId) => resolveContext(id, null, snap))
        .filter((c): c is ContextChip => c !== null);
      allChips = [...chips, ...auto.filter((a) => !chips.some((c) => c.id === a.id))];
    }
    onSend({ shown: text, engine, chips: allChips, mode });
    setDraft("");
    setChips([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (listMenu) {
      // hover is reset by an effect (post-render), so clamp at pick time — the
      // filtered list may have shrunk since the last keystroke.
      const pick = () => {
        if (listMenu.kind === "provider") {
          const item = providerMenu[hover] ?? providerMenu[0];
          if (item) pickProvider(item);
        } else {
          const item = commandMenu[hover] ?? commandMenu[0];
          if (item) pickCommand(item);
        }
      };
      if (e.key === "ArrowDown") { e.preventDefault(); setHover((h) => (h + 1) % listMenu.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setHover((h) => (h - 1 + listMenu.length) % listMenu.length); return; }
      if (e.key === "Tab") { e.preventDefault(); pick(); return; }
      if (e.key === "Enter") {
        // Enter on a command with an argument hint picks it (to type the arg);
        // Enter on a provider attaches it. Plain `/explain` + Enter submits.
        e.preventDefault();
        pick();
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); if (listMenu.kind === "provider") stripAtTrigger(); else setDraft(""); return; }
    }
    if (e.key === "Escape" && argFor) { e.preventDefault(); setArgFor(null); return; }
    if (e.key === "Enter" && !e.shiftKey && !menuOpen) {
      e.preventDefault();
      submit();
    }
  }

  function openAtMenu() {
    setDraft((d) => (d.endsWith("@") ? d : d + (d && !d.endsWith(" ") ? " @" : "@")));
    taRef.current?.focus();
  }

  const modeInfo = MODES.find((m) => m.id === mode)!;
  const ModeIcon = modeInfo.icon;

  return (
    <div className="mx-auto w-full max-w-[44rem] shrink-0 px-3 pb-3">
      {/* Context chips — continue.dev's context peek. */}
      {chips.length > 0 ? (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {chips.map((c) => (
            <span key={c.id} className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 py-0.5 pl-1.5 pr-1 text-[10.5px] text-primary">
              <AtSign className="h-2.5 w-2.5" />
              {c.label}
              <button type="button" onClick={() => setChips((cs) => cs.filter((x) => x.id !== c.id))} className="rounded hover:bg-primary/20" aria-label={`Remove ${c.label}`}>
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className={cn("relative rounded-2xl border bg-editor shadow-sm transition-all", focused ? "border-primary/60 shadow-md ring-1 ring-primary/25" : "border-border")}>
        {/* @ provider / argument / slash-command menu, anchored above the input. */}
        {menuOpen ? (
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
                      // The submenu's search input owns focus — give it its own
                      // keyboard grammar: Enter picks the top match, Esc backs out.
                      if (e.key === "Enter" && argOptions[0]) { e.preventDefault(); pickArg(argOptions[0]); }
                      if (e.key === "Escape") { e.preventDefault(); setArgFor(null); taRef.current?.focus(); }
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
            ) : listMenu?.kind === "provider" ? (
              <div className="py-1">
                {providerMenu.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseEnter={() => setHover(i)}
                    onClick={() => pickProvider(p)}
                    className={cn("flex w-full items-start gap-2 px-3 py-1.5 text-left", i === hover ? "bg-secondary" : "")}
                  >
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
                {commandMenu.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseEnter={() => setHover(i)}
                    onClick={() => pickCommand(c)}
                    className={cn("flex w-full items-start gap-2 px-3 py-1.5 text-left", i === hover ? "bg-secondary" : "")}
                  >
                    <SlashSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
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
        ) : null}

        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          rows={2}
          placeholder="Ask Exa about your database…  (@ context, / commands, Enter to send)"
          className="max-h-40 min-h-[44px] w-full resize-none bg-transparent px-3 pt-2.5 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground"
        />

        {/* Bottom toolbar — left: mode · model · @ ; right: send. */}
        <div className="flex items-center gap-1 px-1.5 pb-1.5">
          <button
            type="button"
            onClick={() => setMode((m) => MODES[(MODES.findIndex((x) => x.id === m) + 1) % MODES.length].id)}
            title={`${modeInfo.hint} — click to switch`}
            className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ModeIcon className={cn("h-3.5 w-3.5", mode === "agent" ? "text-primary" : "")} />
            {modeInfo.label}
          </button>
          <span className="text-border">|</span>
          <ModelMenu providers={providers} model={model} onPick={onPickModel} onSaveKey={onSaveKey} />
          <button type="button" onClick={openAtMenu} title="Add context (@)" className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <AtSign className="h-3.5 w-3.5" />
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            {busy ? (
              <button type="button" onClick={onStop} title="Stop" className="flex h-7 items-center gap-1 rounded-md border border-destructive/40 px-2 text-[11.5px] text-destructive hover:bg-destructive/10">
                <Square className="h-3.5 w-3.5" /> Stop
              </button>
            ) : (
              <button type="button" onClick={submit} disabled={!draft.trim()} title="Send (Enter)" className="flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[11.5px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-40">
                <Send className="h-3.5 w-3.5" /> Enter
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export type { ContextChip, ContextProviderId };
