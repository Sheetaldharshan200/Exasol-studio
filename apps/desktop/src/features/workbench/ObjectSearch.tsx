import { useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
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

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && hits[selected]) {
      open(hits[selected]);
    } else if (e.key === "Escape") {
      if (query) setQuery("");
      else onClose();
    }
  };

  const summary = useMemo(() => {
    if (!query.trim()) return "Search tables, views, columns, scripts…";
    if (loading) return "Searching…";
    return `${hits.length} result${hits.length === 1 ? "" : "s"}`;
  }, [query, loading, hits.length]);

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
        <p className="mt-1.5 px-0.5 text-[10.5px] text-muted-foreground">{summary}</p>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-auto py-1">
        {error ? (
          <p className="px-3 py-2 text-[11px] text-destructive">{error}</p>
        ) : hits.length === 0 && query.trim() && !loading ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">No objects found.</p>
        ) : (
          hits.map((hit, i) => {
            const Icon = HIT_ICON[hit.objectType] ?? Table2;
            const nav = target(hit);
            return (
              <button
                key={`${hit.objectType}:${hit.schema}:${hit.container ?? ""}:${hit.name}:${i}`}
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
                    <span className="truncate font-medium text-foreground">{hit.name}</span>
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
            );
          })
        )}
      </div>
    </div>
  );
}
