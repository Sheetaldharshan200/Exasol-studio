import { useMemo, useState } from "react";
import { Check, Loader2, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ColumnMeta } from "@/lib/ipc";

type Cell = unknown;

function isNumericType(typeName: string): boolean {
  return /DECIMAL|INT|DOUBLE|NUMBER|FLOAT|BIGINT|SMALLINT/i.test(typeName);
}

/** Render a SQL literal for a value, given the column type. */
function lit(v: Cell, typeName: string): string {
  if (v === null || v === undefined || v === "") return "NULL";
  const s = String(v);
  if (isNumericType(typeName) && /^-?\d+(\.\d+)?$/.test(s)) return s;
  if (/BOOL/i.test(typeName) && /^(true|false)$/i.test(s)) return s.toUpperCase();
  return `'${s.replace(/'/g, "''")}'`;
}

function qualify(schema: string | undefined, table: string): string {
  return schema ? `"${schema}"."${table}"` : `"${table}"`;
}

/**
 * Editable data grid for a single-table result. Stages cell edits, row inserts
 * and deletes, generates PK-based UPDATE/INSERT/DELETE, shows them for review,
 * then commits.
 */
export function EditableResultGrid({
  columns,
  rows,
  schema,
  table,
  pk,
  busy,
  initialFocus,
  onApply,
  onExit,
}: {
  columns: ColumnMeta[];
  rows: Cell[][];
  schema?: string;
  table: string;
  pk: string[];
  busy: boolean;
  /** Cell to focus when the grid opens (the one the user double-tapped). */
  initialFocus?: { row: number; col: number } | null;
  onApply: (statements: string[]) => void;
  onExit: () => void;
}) {
  // edits: rowIndex -> colIndex -> new value (string)
  const [edits, setEdits] = useState<Record<number, Record<number, string>>>({});
  // Focus + select the double-tapped cell once, when the grid mounts.
  const focusOnce = (el: HTMLInputElement | null) => {
    if (el) {
      el.focus();
      el.select();
    }
  };
  const [deleted, setDeleted] = useState<Set<number>>(new Set());
  const [inserts, setInserts] = useState<Record<string, string>[]>([]);
  const [review, setReview] = useState<string[] | null>(null);

  // Row identity for UPDATE/DELETE WHERE clauses. Prefer the primary key; when
  // the table has none (common in Exasol), fall back to matching on every
  // selected column value.
  const noPk = pk.length === 0;
  const identity = useMemo(() => (noPk ? columns.map((c) => c.name) : pk), [noPk, pk, columns]);
  const pkIdx = useMemo(() => identity.map((n) => columns.findIndex((c) => c.name === n)), [identity, columns]);
  const t = qualify(schema, table);

  const dirty =
    Object.keys(edits).length > 0 || deleted.size > 0 || inserts.length > 0;

  function setCell(r: number, c: number, v: string) {
    setEdits((prev) => ({ ...prev, [r]: { ...(prev[r] ?? {}), [c]: v } }));
  }

  function where(row: Cell[]): string {
    return identity
      .map((name, i) => `"${name}" = ${lit(row[pkIdx[i]], columns[pkIdx[i]]?.typeName ?? "")}`)
      .join(" AND ");
  }

  function build(): string[] {
    const out: string[] = [];
    // UPDATEs
    for (const [rStr, cols] of Object.entries(edits)) {
      const r = Number(rStr);
      if (deleted.has(r)) continue;
      const sets = Object.entries(cols)
        .map(([cStr, val]) => {
          const c = Number(cStr);
          return `"${columns[c].name}" = ${lit(val, columns[c].typeName)}`;
        })
        .join(", ");
      if (sets) out.push(`UPDATE ${t} SET ${sets} WHERE ${where(rows[r])};`);
    }
    // DELETEs
    for (const r of deleted) out.push(`DELETE FROM ${t} WHERE ${where(rows[r])};`);
    // INSERTs
    for (const rec of inserts) {
      const cols = columns.filter((c) => (rec[c.name] ?? "") !== "");
      if (!cols.length) continue;
      const names = cols.map((c) => `"${c.name}"`).join(", ");
      const vals = cols.map((c) => lit(rec[c.name], c.typeName)).join(", ");
      out.push(`INSERT INTO ${t} (${names}) VALUES (${vals});`);
    }
    return out;
  }

  function reset() {
    setEdits({});
    setDeleted(new Set());
    setInserts([]);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-2 py-1">
        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">Editing</span>
        <span className="font-mono text-[11px] text-muted-foreground">{t}</span>
        {noPk ? (
          <span
            className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning"
            title="This table has no primary key — edits match rows on all selected column values, so rows that are identical across those columns update together."
          >
            no PK · matches all columns
          </span>
        ) : null}
        <button
          onClick={() => setInserts((v) => [...v, {}])}
          className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Add row
        </button>
        <button
          onClick={reset}
          disabled={!dirty}
          className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Revert
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setReview(build())}
            disabled={!dirty || busy}
            className="cta-glow flex h-6 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Review &amp; apply
          </button>
          <button onClick={onExit} className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" /> Done
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-px">
        <table className="w-full border-collapse border border-border text-[12px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-secondary">
              <th className="w-8 border-b border-r border-border px-1 py-1.5" />
              {columns.map((col) => (
                <th key={col.name} className="border-b border-r border-border px-3 py-1.5 text-left font-medium text-foreground">
                  {col.name}
                  {pk.includes(col.name) ? <span className="ml-1 text-[9px] text-primary">PK</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((row, r) => {
              const del = deleted.has(r);
              return (
                <tr key={r} className={cn("even:bg-secondary/30", del && "opacity-40 line-through")}>
                  <td className="border-b border-r border-border px-1 text-center">
                    <button
                      onClick={() =>
                        setDeleted((s) => {
                          const n = new Set(s);
                          n.has(r) ? n.delete(r) : n.add(r);
                          return n;
                        })
                      }
                      className="text-muted-foreground hover:text-destructive"
                      title={del ? "Keep row" : "Delete row"}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                  {columns.map((col, c) => {
                    const edited = edits[r]?.[c];
                    const val = edited ?? (row[c] === null ? "" : String(row[c]));
                    return (
                      <td key={c} className={cn("border-b border-r border-border p-0.5", edited !== undefined && "bg-amber-400/15")}>
                        <input
                          ref={initialFocus && initialFocus.row === r && initialFocus.col === c ? focusOnce : undefined}
                          value={val}
                          disabled={del}
                          onChange={(e) => setCell(r, c, e.target.value)}
                          className="w-full min-w-[80px] max-w-[380px] rounded-sm border border-border/50 bg-background/40 px-2.5 py-0.5 text-foreground outline-none transition-colors hover:border-border focus:border-primary focus:bg-background focus:ring-1 focus:ring-primary/30 disabled:border-transparent disabled:bg-transparent"
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {inserts.map((rec, i) => (
              <tr key={`new-${i}`} className="bg-primary/8">
                <td className="border-b border-r border-border px-1 text-center">
                  <button onClick={() => setInserts((v) => v.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </td>
                {columns.map((col, c) => (
                  <td key={c} className="border-b border-r border-border p-0.5">
                    <input
                      value={rec[col.name] ?? ""}
                      placeholder="NULL"
                      onChange={(e) =>
                        setInserts((v) => v.map((x, j) => (j === i ? { ...x, [col.name]: e.target.value } : x)))
                      }
                      className="w-full min-w-[80px] max-w-[380px] rounded-sm border border-border/50 bg-background/40 px-2.5 py-0.5 text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 hover:border-border focus:border-primary focus:bg-background focus:ring-1 focus:ring-primary/30"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {review ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setReview(null)}>
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-border px-4 py-3 text-[13px] font-semibold text-foreground">
              Review {review.length} statement{review.length === 1 ? "" : "s"}
            </div>
            <pre className="min-h-[120px] flex-1 overflow-auto bg-editor p-3 font-mono text-[12px] text-foreground [scrollbar-width:thin]">
              {review.length ? review.join("\n") : "No changes to apply."}
            </pre>
            <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
              <span className="flex-1 text-[11px] text-muted-foreground">These run against {t}. Review carefully.</span>
              <button onClick={() => setReview(null)} className="h-7 rounded-md border border-border px-3 text-[12px] text-muted-foreground hover:text-foreground">
                Cancel
              </button>
              <button
                disabled={!review.length || busy}
                onClick={() => {
                  const stmts = review;
                  setReview(null);
                  reset();
                  onApply(stmts);
                }}
                className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" /> Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
