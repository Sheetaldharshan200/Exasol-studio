import { useEffect, useMemo, useRef, useState } from "react";
import { AtSign, Bot, MessageSquare, Search, Send, Square, X } from "lucide-react";
import type { AgentProviderInfo } from "@/lib/agent-client";
import { cn } from "@/lib/utils";
import { ModelMenu, type PickedModel } from "./ModelMenu";
import {
  CONTEXT_PROVIDERS,
  filterProviders,
  resolveContext,
  schemaArguments,
  tableArguments,
  type ContextChip,
  type ContextProvider,
  type ContextProviderId,
  type ExaSnapshot,
} from "./context";

export type ChatMode = "agent" | "ask";

/**
 * The Exa composer — continue.dev's input grammar on Studio components: a
 * rounded, focus-ringed surface with context chips on top, the textarea, and a
 * bottom toolbar (mode pill · inline model selector · @ context · send). Typing
 * `@` opens the context-provider menu; providers that need a schema/table open
 * a second searchable list. Resolved context becomes a chip and is injected
 * into the prompt by the caller via `buildPrompt`.
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
}: {
  providers: AgentProviderInfo[];
  model: PickedModel | null;
  onPickModel: (m: PickedModel) => void;
  onSaveKey: (providerId: string, key: string) => Promise<void>;
  getSnapshot: () => ExaSnapshot;
  busy: boolean;
  onSend: (text: string, chips: ContextChip[], mode: ChatMode) => void;
  onStop: () => void;
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

  // A trailing `@token` in the draft opens the provider menu, filtered live.
  const trigger = useMemo(() => {
    const m = /(?:^|\s)@([\w]*)$/.exec(draft);
    return m ? { query: m[1] } : null;
  }, [draft]);
  const providerMenu = trigger && !argFor ? filterProviders(trigger.query) : [];
  const menuOpen = (!!trigger && !argFor && providerMenu.length > 0) || !!argFor;

  useEffect(() => setHover(0), [trigger?.query, argFor]);

  function stripTrigger() {
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
    stripTrigger();
    taRef.current?.focus();
  }

  function pickArg(value: string) {
    if (argFor) addChip(resolveContext(argFor.id, value, getSnapshot()));
    setArgFor(null);
    stripTrigger();
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
    onSend(text, chips, mode);
    setDraft("");
    setChips([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (menuOpen && !argFor) {
      if (e.key === "ArrowDown") { e.preventDefault(); setHover((h) => (h + 1) % providerMenu.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setHover((h) => (h - 1 + providerMenu.length) % providerMenu.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickProvider(providerMenu[hover]); return; }
      if (e.key === "Escape") { e.preventDefault(); stripTrigger(); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && !menuOpen) {
      e.preventDefault();
      submit();
    }
  }

  function openAtMenu() {
    setDraft((d) => (d.endsWith("@") ? d : d + (d && !d.endsWith(" ") ? " @" : "@")));
    taRef.current?.focus();
  }

  return (
    <div className="shrink-0 px-2 pb-2">
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

      <div className={cn("relative rounded-xl border bg-editor transition-colors", focused ? "border-primary/60 ring-1 ring-primary/30" : "border-border")}>
        {/* @ provider menu / argument submenu, anchored above the input. */}
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
                  <input autoFocus value={argQuery} onChange={(e) => setArgQuery(e.target.value)} placeholder={`Search ${argFor.needsArg}s…`} className="h-8 w-full bg-transparent pl-8 pr-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground" />
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
            ) : (
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
          placeholder="Ask Exa about your database…  (@ for context, Enter to send)"
          className="max-h-40 min-h-[44px] w-full resize-none bg-transparent px-3 pt-2.5 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground"
        />

        {/* Bottom toolbar — left: mode · model · @ ; right: send. */}
        <div className="flex items-center gap-1 px-1.5 pb-1.5">
          <button
            type="button"
            onClick={() => setMode((m) => (m === "agent" ? "ask" : "agent"))}
            title={mode === "agent" ? "Agent — Exa can use tools" : "Ask — chat only, no tools"}
            className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {mode === "agent" ? <Bot className="h-3.5 w-3.5 text-primary" /> : <MessageSquare className="h-3.5 w-3.5" />}
            {mode === "agent" ? "Agent" : "Ask"}
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

// Re-export so the panel can list provider ids for its empty-state hints.
export { CONTEXT_PROVIDERS };
export type { ContextChip, ContextProviderId };
