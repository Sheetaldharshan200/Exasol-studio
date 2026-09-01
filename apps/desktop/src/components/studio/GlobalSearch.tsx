import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { fuzzyRank, type FuzzyMatch } from "@/lib/fuzzy";
import { cn } from "@/lib/utils";

export type SearchItem = {
  id: string;
  kind: "action" | "tab" | "connection" | "table" | "schema" | "setting" | "docs";
  label: string;
  detail?: string;
  keywords?: string;
  run: () => void;
};

const KIND_LABEL: Record<SearchItem["kind"], string> = {
  action: "Actions",
  tab: "Open tabs",
  connection: "Connections",
  schema: "Schemas",
  table: "Tables",
  setting: "Settings",
  docs: "Documentation",
};
const KIND_ORDER: SearchItem["kind"][] = ["action", "tab", "connection", "schema", "table", "setting", "docs"];

function Highlight({ text, match }: { text: string; match: FuzzyMatch }) {
  const set = new Set(match.positions);
  return (
    <>
      {text.split("").map((ch, i) => (
        <span key={i} className={set.has(i) ? "text-primary" : undefined}>
          {ch}
        </span>
      ))}
    </>
  );
}

/**
 * Universal search (⌘K / the title-bar field): one box over everything —
 * actions, open tabs, connections, schema objects, settings pages, docs —
 * ranked by real fuzzy relevance (word boundaries, camelCase, consecutive
 * runs), not letter containment.
 */
export function GlobalSearch({ getItems }: { getItems: () => SearchItem[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<SearchItem[]>([]);

  const show = useCallback(() => {
    setItems(getItems());
    setQuery("");
    setCursor(0);
    setOpen(true);
  }, [getItems]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        show();
      }
    };
    const onOpen = () => show();
    window.addEventListener("keydown", onKey);
    window.addEventListener("studio:global-search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("studio:global-search", onOpen);
    };
  }, [show]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const ranked = useMemo(() => {
    const scored = fuzzyRank(query, items, (i) => `${i.label} ${i.detail ?? ""} ${i.keywords ?? ""}`);
    const capped = query.trim() ? scored.slice(0, 40) : scored.slice(0, 24);
    const groups = new Map<SearchItem["kind"], { item: SearchItem; match: FuzzyMatch }[]>();
    for (const r of capped) {
      const list = groups.get(r.item.kind) ?? [];
      list.push(r);
      groups.set(r.item.kind, list);
    }
    const flat: { item: SearchItem; match: FuzzyMatch }[] = [];
    for (const kind of KIND_ORDER) for (const r of groups.get(kind) ?? []) flat.push(r);
    return flat;
  }, [query, items]);

  useEffect(() => setCursor(0), [query]);

  const runItem = (item: SearchItem) => {
    setOpen(false);
    item.run();
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[140] flex items-start justify-center bg-black/40 pt-[12vh]" onMouseDown={() => setOpen(false)}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-[min(640px,92vw)] overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            data-bare
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, ranked.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === "Enter" && ranked[cursor]) {
                runItem(ranked[cursor].item);
              }
            }}
            placeholder="Search everything — actions, tabs, tables, connections, settings, docs…"
            className="h-11 w-full bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">esc</kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-1.5 [scrollbar-width:thin]">
          {ranked.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">Nothing matches “{query}”.</p>
          ) : (
            ranked.map((r, i) => {
              const prev = ranked[i - 1];
              const showHeader = !prev || prev.item.kind !== r.item.kind;
              return (
                <div key={r.item.id}>
                  {showHeader ? (
                    <p className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                      {KIND_LABEL[r.item.kind]}
                    </p>
                  ) : null}
                  <button
                    onClick={() => runItem(r.item)}
                    onMouseMove={() => setCursor(i)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left",
                      i === cursor ? "bg-secondary" : "hover:bg-secondary/60",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-foreground">
                        <Highlight text={r.item.label} match={r.match} />
                      </span>
                      {r.item.detail ? <span className="block truncate text-[11px] text-muted-foreground">{r.item.detail}</span> : null}
                    </span>
                    {i === cursor ? <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
