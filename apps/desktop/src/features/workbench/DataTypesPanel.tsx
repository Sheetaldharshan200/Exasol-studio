import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Loader2, Search } from "lucide-react";
import { errorMessage, ipc } from "@/lib/ipc";
import { cn } from "@/lib/utils";

/**
 * Data Types — the classic DB-tool grid over SYS.EXA_SQL_TYPES:
 * every column the server reports, booleans as checkboxes, headers that
 * SORT (tap: asc → desc) and REARRANGE (drag, like notebook cells; the
 * order persists), and a find bar with next/previous occurrence jumping.
 */

const ORDER_KEY = "exasol-datatypes-col-order";

/** TYPE_NAME → Type Name */
function pretty(col: string): string {
  return col
    .toLowerCase()
    .split("_")
    .map((w) => (w === "sql" || w === "jdbc" ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function isBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}

export function DataTypesPanel({
  profileId,
  connectionName,
}: {
  profileId: string;
  connectionName: string;
}) {
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<unknown[][]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [order, setOrder] = useState<string[]>([]);
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>({ col: "TYPE_NAME", dir: 1 });
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const dragCol = useRef<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    // Full metadata straight from the catalog view — every column the server
    // exposes, no curation. addHistory=false keeps it out of the log.
    ipc
      .executeSql(profileId, connectionName, "SELECT * FROM SYS.EXA_SQL_TYPES ORDER BY TYPE_NAME", 500, false, false)
      .then((res) => {
        if (!alive) return;
        const r = res.results[0];
        if (!r || r.error) throw new Error(r?.error ?? "No result");
        const cols = r.columns.map((c) => c.name);
        setColumns(cols);
        setRows(r.rows);
        const saved = JSON.parse(window.localStorage.getItem(ORDER_KEY) ?? "null") as string[] | null;
        // Saved order wins where it still matches; new columns append.
        const base = saved ? [...saved.filter((c) => cols.includes(c)), ...cols.filter((c) => !saved.includes(c))] : cols;
        setOrder(base);
      })
      .catch((err) => alive && setError(errorMessage(err)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [profileId, connectionName]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const idx = columns.indexOf(sort.col);
    if (idx < 0) return rows;
    return [...rows].sort((a, b) => {
      const va = a[idx];
      const vb = b[idx];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : isBool(va) && isBool(vb)
            ? Number(va) - Number(vb)
            : String(va).localeCompare(String(vb), undefined, { numeric: true });
      return cmp * sort.dir;
    });
  }, [rows, sort, columns]);

  // Find matches: [rowIndex, colName] of every cell containing the query.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as { row: number; col: string }[];
    const out: { row: number; col: string }[] = [];
    sorted.forEach((r, ri) => {
      for (const col of order) {
        const v = r[columns.indexOf(col)];
        if (v !== null && v !== undefined && String(v).toLowerCase().includes(q)) out.push({ row: ri, col });
      }
    });
    return out;
  }, [query, sorted, order, columns]);

  useEffect(() => setCursor(0), [query, sort]);

  const jump = (delta: number) => {
    if (!matches.length) return;
    const next = (cursor + delta + matches.length) % matches.length;
    setCursor(next);
    const m = matches[next];
    bodyRef.current
      ?.querySelector(`[data-cell="${m.row}:${m.col}"]`)
      ?.scrollIntoView({ block: "center", inline: "nearest" });
  };

  const flip = (col: string) =>
    setSort((cur) => (cur?.col === col ? { col, dir: cur.dir === 1 ? -1 : 1 } : { col, dir: 1 }));

  const moveCol = (from: string, to: string) => {
    if (from === to) return;
    setOrder((cur) => {
      const next = cur.filter((c) => c !== from);
      next.splice(next.indexOf(to) + (cur.indexOf(from) < cur.indexOf(to) ? 1 : 0), 0, from);
      window.localStorage.setItem(ORDER_KEY, JSON.stringify(next));
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading data types…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-muted-foreground">{error}</div>
      </div>
    );
  }

  const curMatch = matches[cursor];
  const matched = new Set(matches.map((m) => `${m.row}:${m.col}`));

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      {/* find bar — navigates occurrences instead of filtering the grid */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") jump(e.shiftKey ? -1 : 1);
            }}
            placeholder="Search"
            className="h-7 w-full rounded-md border border-border bg-secondary/30 pr-2 pl-8 text-[12px] text-foreground outline-none focus:border-primary/60"
          />
        </div>
        {query.trim() ? (
          <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
            {matches.length ? `${cursor + 1}/${matches.length}` : "0/0"}
          </span>
        ) : null}
        <button
          onClick={() => jump(1)}
          disabled={!matches.length}
          aria-label="Next occurrence"
          title="Next occurrence (Enter)"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => jump(-1)}
          disabled={!matches.length}
          aria-label="Previous occurrence"
          title="Previous occurrence (Shift+Enter)"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
      </div>

      <div ref={bodyRef} className="min-h-0 flex-1 overflow-auto [scrollbar-width:thin]">
        <table className="w-max min-w-full border-separate border-spacing-0 text-[12px]">
          <thead className="sticky top-0 z-10">
            <tr>
              {order.map((col) => (
                <th
                  key={col}
                  draggable
                  onDragStart={(e) => {
                    dragCol.current = col;
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragCol.current) moveCol(dragCol.current, col);
                    dragCol.current = null;
                  }}
                  onClick={() => flip(col)}
                  title={`${pretty(col)} — click to sort, drag to reorder`}
                  className="cursor-pointer border-r border-b border-border bg-secondary px-3 py-1.5 text-left font-medium whitespace-nowrap text-muted-foreground select-none last:border-r-0 hover:text-foreground"
                >
                  <span className="flex items-center gap-1">
                    {pretty(col)}
                    {sort?.col === col ? (
                      sort.dir === 1 ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, ri) => (
              <tr key={ri} className="hover:bg-accent/40">
                {order.map((col) => {
                  const v = r[columns.indexOf(col)];
                  const key = `${ri}:${col}`;
                  const isCur = curMatch && curMatch.row === ri && curMatch.col === col;
                  return (
                    <td
                      key={col}
                      data-cell={key}
                      className={cn(
                        "border-r border-b border-border/60 px-3 py-1 whitespace-nowrap last:border-r-0",
                        typeof v === "number" && "text-right font-mono",
                        col === "TYPE_NAME" && "font-mono font-medium text-syntax-type",
                        matched.has(key) && "bg-warning/20",
                        isCur && "bg-warning/50 outline outline-1 outline-warning",
                      )}
                    >
                      {isBool(v) ? (
                        <span
                          className={cn(
                            "inline-flex h-3.5 w-3.5 items-center justify-center rounded border align-middle",
                            v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary/40",
                          )}
                        >
                          {v ? <Check className="h-2.5 w-2.5" /> : null}
                        </span>
                      ) : v === null || v === undefined ? (
                        ""
                      ) : typeof v === "number" ? (
                        v.toLocaleString()
                      ) : (
                        String(v)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex h-6 shrink-0 items-center border-t border-border px-3 font-mono text-[10.5px] text-muted-foreground">
        {rows.length} types · {connectionName} · drag headers to reorder, click to sort
      </div>
    </div>
  );
}
