import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Code2, CopyPlus, Loader2, Plus, RotateCcw, Save, ShieldOff, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { pendingSummary, rowToDraft, type Draft } from "./edit-grid-model";
import { buildDml, qualify } from "./edit-dml";
import { pairWidths, scrollbarGutter, totalWidth } from "@/lib/table-widths";
import type { ColumnMeta } from "@/lib/ipc";

type Cell = unknown;

/** A row the user has staged for INSERT, with an id of its own. */
type StagedInsert = { id: string; values: Draft };
let insertSeq = 0;
const newInsert = (values: Draft = {}): StagedInsert => ({ id: `new-${++insertSeq}`, values });

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
  catalogColumns,
  initialFocus,
  autoAddRow,
  colWidths,
  onOpenSql,
  onApply,
  onExit,
}: {
  columns: ColumnMeta[];
  rows: Cell[][];
  schema?: string;
  table: string;
  pk: string[];
  /** The table's real column identifiers from the catalog (exact stored case).
   *  Result metadata can report a different case than what's stored, so we
   *  quote these — otherwise UPDATE/DELETE hit "object not found". */
  catalogColumns?: string[];
  /** Cell to focus when the grid opens (the one the user double-tapped). */
  initialFocus?: { row: number; col: number } | null;
  /** Open with one empty row already staged (entered via "Add row"). */
  autoAddRow?: boolean;
  /** Column widths (px) captured from the read-only table — keeps geometry stable. */
  colWidths?: number[] | null;
  /** Open the generated DML in a new query tab (the review/run surface). */
  onOpenSql?: (sql: string, title?: string) => void;
  /** Run the DML directly ("Confirm & Save"); returns the first DB error. */
  onApply?: (statements: string[]) => Promise<{ ok: boolean; error?: string; failedSql?: string }>;
  onExit: () => void;
}) {
  // The last direct-save DB error, shown inline. Edits are KEPT on failure.
  const [applyError, setApplyError] = useState<{ message: string; sql?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // edits: rowIndex -> colIndex -> new value (string)
  const [edits, setEdits] = useState<Record<number, Record<number, string>>>({});
  // Focus the double-tapped cell once, when the grid mounts. The guard is what
  // makes it once: a callback ref is re-attached on every render, so without
  // it each keystroke would drag the caret back to the end of the cell.
  const focusedInitial = useRef(false);
  const focusOnce = useCallback((el: HTMLInputElement | null) => {
    if (!el || focusedInitial.current) return;
    focusedInitial.current = true;
    el.focus();
    // Place the caret at the end instead of selecting all — so typing edits
    // the existing value rather than replacing it on the first keypress.
    const n = el.value.length;
    el.setSelectionRange(n, n);
  }, []);
  // The widths the read-only grid was using, so entering edit mode does not
  // shift the columns; measured here if it could not supply them.
  const [widths, setWidths] = useState<number[] | null>(colWidths?.length ? colWidths : null);
  const headRef = useRef<HTMLTableSectionElement | null>(null);
  const bodyRef = useRef<HTMLTableSectionElement | null>(null);
  const headScrollRef = useRef<HTMLDivElement | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const [gutter, setGutter] = useState(0);
  useLayoutEffect(() => {
    const scroller = bodyScrollRef.current;
    if (scroller) setGutter((g) => { const next = scrollbarGutter(scroller.offsetWidth, scroller.clientWidth); return next === g ? g : next; });
    if (widths) return;
    const cells = (el: Element | null | undefined) => (el ? Array.from(el.children).map((c) => (c as HTMLElement).offsetWidth) : []);
    const paired = pairWidths(cells(headRef.current?.querySelector("tr")), cells(bodyRef.current?.querySelector("tr")));
    if (paired) setWidths(paired);
  }, [widths, columns, rows]);
  // A resize can add or remove the scrollbar with no React update at all, and
  // the header has to give back exactly what the body loses.
  useEffect(() => {
    const scroller = bodyScrollRef.current;
    if (!scroller || typeof ResizeObserver === "undefined") return;
    const measure = () =>
      setGutter((g) => {
        const next = scrollbarGutter(scroller.offsetWidth, scroller.clientWidth);
        return next === g ? g : next;
      });
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    measure();
    return () => ro.disconnect();
  }, []);
  const tableFix = widths
    ? { className: "table-fixed", style: { width: totalWidth(widths) } }
    : { className: "w-full", style: undefined };
  const [deleted, setDeleted] = useState<Set<number>>(new Set());
  // Staged rows carry an id: two rows added in one tick would otherwise both
  // be "the last index", and removing one would shift every ref after it.
  const firstRows = useRef<StagedInsert[]>(autoAddRow ? [newInsert()] : []);
  const [inserts, setInserts] = useState<StagedInsert[]>(firstRows.current);
  // A staged row appears at the bottom of the table, which is usually off
  // screen: the grid goes to it and puts the caret in its first cell, so
  // "Add row" lands you where you type rather than leaving you where you were.
  const [focusInsert, setFocusInsert] = useState<string | null>(firstRows.current[0]?.id ?? null);
  const newRowRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  useEffect(() => {
    if (focusInsert === null) return;
    const el = newRowRefs.current.get(focusInsert);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    el?.focus();
    setFocusInsert(null);
  }, [focusInsert]);
  const addRow = (values: Draft = {}) => {
    const row = newInsert(values);
    setInserts((v) => [...v, row]);
    setFocusInsert(row.id);
  };

  // Row identity for UPDATE/DELETE WHERE clauses. Prefer the primary key; when
  // the table has none (common in Exasol), fall back to matching on every
  // selected column value.
  const noPk = pk.length === 0;
  const identity = useMemo(() => (noPk ? columns.map((c) => c.name) : pk), [noPk, pk, columns]);
  const t = qualify(schema, table);

  const dirty =
    Object.keys(edits).length > 0 || deleted.size > 0 || inserts.length > 0;
  const summary = pendingSummary({ edits, deleted, inserts });

  function setCell(r: number, c: number, v: string) {
    setEdits((prev) => ({ ...prev, [r]: { ...(prev[r] ?? {}), [c]: v } }));
  }

  async function save() {
    if (!onApply || !dirty || saving) return;
    const dml = build();
    if (!dml.length) return;
    setApplyError(null);
    setSaving(true);
    const r = await onApply(dml);
    setSaving(false);
    // Keep edits on failure; clear them only when the DB accepted them.
    if (r?.ok) reset();
    else setApplyError({ message: r?.error ?? "The update failed.", sql: r?.failedSql });
  }

  const build = (): string[] =>
    buildDml({ schema, table, columns, rows, identity, catalogColumns, edits, deleted, inserts });

  function reset() {
    setEdits({});
    setDeleted(new Set());
    setInserts([]);
  }

  return (
    <div
      className="flex h-full flex-col"
      onKeyDown={(e) => {
        // Save with the shortcut every editor uses; leave only when there is
        // nothing to lose, so Escape can never discard staged work.
        if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "Enter")) {
          e.preventDefault();
          void save();
        } else if (e.key === "Escape" && !dirty) {
          onExit();
        }
      }}
    >
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
          onClick={() => addRow()}
          title="Stage a new row (⌘↵ saves, ⌘S too)"
          className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Add row
        </button>
        {summary ? <span className="rounded-md bg-amber-400/15 px-1.5 py-0.5 font-mono text-[10.5px] text-foreground">{summary}</span> : null}
        <button
          onClick={reset}
          disabled={!dirty}
          className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Revert
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => { const dml = build(); if (dml.length && onOpenSql) onOpenSql(dml.join("\n"), `Edit ${table}`); }}
            disabled={!dirty || saving || !onOpenSql}
            title="Open these changes as SQL in a new query tab"
            className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
          >
            <Code2 className="h-3.5 w-3.5" /> Review SQL
          </button>
          <button
            onClick={() => void save()}
            disabled={!dirty || saving || !onApply}
            title="Run these changes now"
            className="cta-glow flex h-6 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Confirm &amp; Save
          </button>
          <button onClick={onExit} className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" /> Done
          </button>
        </div>
      </div>

      {applyError ? (
        <div className="flex shrink-0 items-start gap-2 border-b border-destructive/40 bg-destructive/10 px-3 py-2">
          <ShieldOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-destructive">Update failed — your edits are kept. Fix and Save again, or use Review SQL.</p>
            <p className="mt-0.5 break-words font-mono text-[11px] text-destructive/90">{applyError.message}</p>
            {applyError.sql ? <p className="mt-1 break-all font-mono text-[10.5px] text-muted-foreground">{applyError.sql}</p> : null}
          </div>
          <button onClick={() => setApplyError(null)} aria-label="Dismiss" className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : null}

      {/* Column names sit outside the scroller, as in the read-only grid, so
          the scrollbar starts at the first row instead of running up beside
          the header. Both tables are fixed to the same widths. */}
      <div ref={headScrollRef} className="shrink-0 overflow-hidden px-px pt-px" style={gutter ? { marginRight: gutter } : undefined}>
        {/* The seam between the two tables is the header's own bottom border:
            each table draws only the edges it owns, so it is not doubled. */}
        <table className={cn("border-collapse border-x border-t border-border text-[12px]", tableFix.className)} style={tableFix.style}>
          {widths ? (
            <colgroup>
              {widths.map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
          ) : null}
          <thead ref={headRef}>
            <tr className="bg-secondary">
              <th className="w-14 border-b border-r border-border px-1 py-1.5" />
              {columns.map((col) => (
                <th key={col.name} className="border-b border-r border-border px-3 py-1.5 text-left font-medium text-foreground">
                  {col.name}
                  {pk.includes(col.name) ? <span className="ml-1 text-[9px] text-primary">PK</span> : null}
                </th>
              ))}
            </tr>
          </thead>
        </table>
      </div>
      <div
        ref={bodyScrollRef}
        className="min-h-0 flex-1 overflow-auto px-px pb-px"
        onScroll={(e) => {
          const head = headScrollRef.current;
          if (head) head.scrollLeft = e.currentTarget.scrollLeft;
        }}
      >
        <table className={cn("border-collapse border-x border-b border-border text-[12px]", tableFix.className)} style={tableFix.style}>
          {widths ? (
            <colgroup>
              {widths.map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
          ) : null}
          <tbody ref={bodyRef} className="font-mono">
            {rows.map((row, r) => {
              const del = deleted.has(r);
              return (
                <tr key={r} className={cn("even:bg-secondary/30", del && "opacity-40 line-through")}>
                  <td className="border-b border-r border-border px-1">
                    <div className="flex items-center justify-center gap-1">
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
                      <button
                        onClick={() => addRow(rowToDraft(row, columns))}
                        className="text-muted-foreground hover:text-primary"
                        title="Duplicate this row as a new one"
                      >
                        <CopyPlus className="h-3 w-3" />
                      </button>
                    </div>
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
            {inserts.map(({ id, values: rec }) => (
              <tr key={id} className="bg-primary/8">
                <td className="border-b border-r border-border px-1 text-center">
                  <button
                    onClick={() => {
                      newRowRefs.current.delete(id);
                      setInserts((v) => v.filter((x) => x.id !== id));
                    }}
                    title="Discard this staged row"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </td>
                {columns.map((col, c) => (
                  <td key={c} className="border-b border-r border-border p-0.5">
                    <input
                      ref={
                        c === 0
                          ? (el) => {
                              if (el) newRowRefs.current.set(id, el);
                              else newRowRefs.current.delete(id);
                            }
                          : undefined
                      }
                      value={rec[col.name] ?? ""}
                      placeholder={rec[col.name] === null ? "NULL" : "default"}
                      onChange={(e) =>
                        setInserts((v) => v.map((x) => (x.id === id ? { ...x, values: { ...x.values, [col.name]: e.target.value } } : x)))
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

    </div>
  );
}
