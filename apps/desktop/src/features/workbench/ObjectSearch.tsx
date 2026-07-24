import { useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  ChevronDown,
  ChevronUp,
  Columns3,
  CornerDownLeft,
  FileCode2,
  FunctionSquare,
  Loader2,
  ScrollText,
  Search,
  Table2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { errorMessage, ipc, type SearchHit } from "@/lib/ipc";
import { cn } from "@/lib/utils";

const HIT_ICON: Record<string, LucideIcon> = {
  SCHEMA: Boxes,
  TABLE: Table2,
  VIEW: ScrollText,
  COLUMN: Columns3,
  SCRIPT: FileCode2,
  FUNCTION: FunctionSquare,
};

const HIT_ACCENT: Record<string, string> = {
  SCHEMA: "text-primary",
  TABLE: "text-foreground",
  VIEW: "text-info",
  COLUMN: "text-syntax-type",
  SCRIPT: "text-syntax-function",
  FUNCTION: "text-syntax-function",
};

/** Where a double-click / Enter on this hit should navigate (if anywhere). */
function target(hit: SearchHit): { schema: string; name: string } | null {
  if ((hit.objectType === "TABLE" || hit.objectType === "VIEW") && hit.schema) {
    return { schema: hit.schema, name: hit.name };
  }
  if (hit.objectType === "COLUMN" && hit.schema && hit.container) {
    return { schema: hit.schema, name: hit.container };
  }
  return null;
}

function qualified(hit: SearchHit): string {
  if (hit.objectType === "COLUMN" && hit.container) {
    return `${hit.schema ? `${hit.schema}.` : ""}${hit.container}`;
  }
  return hit.schema ?? "";
}

const TYPE_ORDER = ["SCHEMA", "TABLE", "VIEW", "COLUMN", "SCRIPT", "FUNCTION"] as const;
const TYPE_LABEL: Record<string, string> = {
  SCHEMA: "Schemas", TABLE: "Tables", VIEW: "Views", COLUMN: "Columns", SCRIPT: "Scripts", FUNCTION: "Functions",
};

/** Bold the matched substring inside a hit name. */
function Highlight({ text, needle }: { text: string; needle: string }) {
  const i = needle ? text.toLowerCase().indexOf(needle.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span className="rounded-sm bg-warning/30 font-semibold text-foreground">{text.slice(i, i + needle.length)}</span>
      {text.slice(i + needle.length)}
    </>
  );
}

export function ObjectSearch({
  profileId,
  onOpenObject,
  onClose,
}: {
  profileId: string;
  onOpenObject: (schema: string, name: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Debounced search against the focused connection.
  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setHits([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      ipc
        .searchObjects(profileId, term, 200)
        .then((res) => {
          setHits(res.results);
          setSelected(0);
          setError(null);
        })
        .catch((err) => setError(errorMessage(err)))
        .finally(() => setLoading(false));
    }, 180);
    return () => clearTimeout(handle);
  }, [query, profileId]);

  const open = (hit: SearchHit) => {
    const t = target(hit);
    if (t) onOpenObject(t.schema, t.name);
  };

  // Counts per type (over ALL hits) drive the filter chips; the visible list
  // honors the active filter, grouped in a stable type order.
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const h of hits) c[h.objectType] = (c[h.objectType] ?? 0) + 1;
    return c;
  }, [hits]);
  const shown = useMemo(() => {
    const list = typeFilter ? hits.filter((h) => h.objectType === typeFilter) : hits;
    return [...list].sort((a, b) => TYPE_ORDER.indexOf(a.objectType as never) - TYPE_ORDER.indexOf(b.objectType as never));
  }, [hits, typeFilter]);
  useEffect(() => setSelected(0), [typeFilter]);

  const move = (delta: number) => {
    if (!shown.length) return;
    setSelected((s) => {
      const next = (s + delta + shown.length) % shown.length;
      listRef.current?.querySelector(`[data-hit="${next}"]`)?.scrollIntoView({ block: "nearest" });
      return next;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter" && shown[selected]) {
      if (e.shiftKey) move(-1);
      else open(shown[selected]);
    } else if (e.key === "F3") {
      e.preventDefault();
      move(e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape") {
      if (query) setQuery("");
      else onClose();
    }
  };

  const summary = useMemo(() => {
    if (!query.trim()) return "Search tables, views, columns, scripts…";
    if (loading) return "Searching…";
    const total = `${hits.length} result${hits.length === 1 ? "" : "s"}`;
    return typeFilter ? `${shown.length} of ${total}` : total;
  }, [query, loading, hits.length, shown.length, typeFilter]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          {loading ? (
            <Loader2 className="absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : query ? (
            <button
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className="h-7 pr-8 pl-8 text-xs"
            placeholder="Search database objects…"
          />
        </div>
        <div className="mt-1.5 flex items-center gap-1 px-0.5">
          <p className="min-w-0 flex-1 truncate text-[10.5px] text-muted-foreground">{summary}</p>
          {shown.length ? (
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{selected + 1}/{shown.length}</span>
          ) : null}
          <button
            onClick={() => move(1)}
            disabled={!shown.length}
            aria-label="Next occurrence"
            title="Next occurrence (F3)"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => move(-1)}
            disabled={!shown.length}
            aria-label="Previous occurrence"
            title="Previous occurrence (Shift+F3)"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
        </div>
        {hits.length ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1 px-0.5">
            <button
              onClick={() => setTypeFilter(null)}
              className={cn(
                "rounded-full border px-1.5 py-px text-[10px]",
                typeFilter === null ? "border-primary/50 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              All {hits.length}
            </button>
            {TYPE_ORDER.filter((t) => counts[t]).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter((cur) => (cur === t ? null : t))}
                className={cn(
                  "rounded-full border px-1.5 py-px text-[10px]",
                  typeFilter === t ? "border-primary/50 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {TYPE_LABEL[t]} {counts[t]}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-auto py-1">
        {error ? (
          <p className="px-3 py-2 text-[11px] text-destructive">{error}</p>
        ) : hits.length === 0 && query.trim() && !loading ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">No objects found.</p>
        ) : (
          shown.map((hit, i) => {
            const Icon = HIT_ICON[hit.objectType] ?? Table2;
            const nav = target(hit);
            const groupStart = i === 0 || shown[i - 1].objectType !== hit.objectType;
            return (
              <div key={`${hit.objectType}:${hit.schema}:${hit.container ?? ""}:${hit.name}:${i}`}>
                {groupStart && !typeFilter ? (
                  <p className="sticky top-0 z-10 bg-panel px-2.5 pt-2 pb-0.5 text-[9.5px] font-semibold tracking-[0.12em] text-muted-foreground/70 uppercase">
                    {TYPE_LABEL[hit.objectType] ?? hit.objectType} · {counts[hit.objectType]}
                  </p>
                ) : null}
                <button
                  data-hit={i}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => open(hit)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors",
                    i === selected ? "bg-secondary" : "hover:bg-secondary/60",
                  )}
                >
                  <Icon
                    className={cn("h-3.5 w-3.5 shrink-0", HIT_ACCENT[hit.objectType] ?? "text-muted-foreground")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium text-foreground">
                        <Highlight text={hit.name} needle={query.trim()} />
                      </span>
                      {hit.detail ? (
                        <span className="truncate font-mono text-[10px] text-syntax-type/80">
                          {hit.detail}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="rounded bg-secondary/80 px-1 py-px font-mono uppercase">
                        {hit.objectType.toLowerCase()}
                      </span>
                      {qualified(hit) ? <span className="truncate">{qualified(hit)}</span> : null}
                    </span>
                  </span>
                  {nav && i === selected ? (
                    <CornerDownLeft className="h-3 w-3 shrink-0 text-muted-foreground" />
                  ) : null}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
