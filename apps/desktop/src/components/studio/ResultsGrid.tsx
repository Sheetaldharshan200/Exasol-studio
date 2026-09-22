/**
 * The results table: a read-only grid over one statement's rows, with the
 * column names in their own table ABOVE the scrolling area — so the vertical
 * scrollbar belongs to the rows and starts at the first one, instead of
 * running up beside the header. Two tables mean two sets of column widths, so
 * both are measured at their natural size and fixed to the wider of each pair
 * (see lib/table-widths.ts); the header follows the body sideways.
 *
 * Extracted from HistoryDock.tsx, which must not grow.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CircleSlash2, Pencil, Plus, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { cellText, filterRows, resultSummary } from "@/lib/result-stats";
import { pairWidths, scrollbarGutter, totalWidth } from "@/lib/table-widths";
import { EditableResultGrid } from "@/features/workbench/EditableResultGrid";
import type { StatementResult } from "@/lib/ipc";

export function ResultsGrid({
  result,
  error,
  editable,
  onOpenSql,
  onCommitEdits,
  editBusy,
  fontSize = 12,
  zebra = true,
  filterQuery,
  onCellClick,
  selected,
  hideToolbar = false,
}: {
  result: StatementResult | null;
  error: string | null;
  /** Present when this result maps to a single updatable table. */
  editable?: { schema?: string; table: string; pk: string[]; columns: string[] } | null;
  onOpenSql?: (sql: string, title?: string) => void;
  onCommitEdits?: (statements: string[]) => Promise<{ ok: boolean; error?: string; failedSql?: string }>;
  editBusy?: boolean;
  fontSize?: number;
  zebra?: boolean;
  /** Client-side substring filter applied to the read-only rows (empty = all). */
  filterQuery?: string;
  /** Single-click a data cell to inspect it. Row/col index into the DISPLAYED
   *  (post-filter) rows. */
  onCellClick?: (info: { value: unknown; column: string; row: number; col: number }) => void;
  /** The currently inspected cell (display indices), highlighted. */
  selected?: { row: number; col: number } | null;
  /** Hide the internal toolbar (Edit data + count) when the parent shows its own. */
  hideToolbar?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  // The cell the user double-tapped — edit mode opens with THAT cell focused.
  const [focusCell, setFocusCell] = useState<{ row: number; col: number } | null>(null);
  // Rows currently rendered into the DOM (grows via "Show more"); resets per result.
  const RENDER_STEP = 1000;
  const [renderCap, setRenderCap] = useState(RENDER_STEP);
  useEffect(() => setRenderCap(RENDER_STEP), [result]);
  // Column widths captured from the read-only table the moment editing starts,
  // so the editable grid renders with IDENTICAL geometry (no resize jump).
  const roTableRef = useRef<HTMLTableElement | null>(null);
  // The column names live OUTSIDE the scrolling area, so the vertical
  // scrollbar starts at the first data row instead of running up beside the
  // header. Two tables then have to be told the same widths: measure both at
  // their natural size, take the wider of each pair, and fix both to it.
  const headTableRef = useRef<HTMLTableElement | null>(null);
  const headScrollRef = useRef<HTMLDivElement | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const [colWidths, setColWidths] = useState<number[] | null>(null);
  // What a classic scrollbar takes from the body — the header must give back
  // the same, or mirroring scrollLeft shifts the columns by that much.
  const [gutter, setGutter] = useState(0);
  useLayoutEffect(() => setColWidths(null), [result, renderCap, fontSize, filterQuery]);
  useLayoutEffect(() => {
    const scroller = bodyScrollRef.current;
    if (scroller) setGutter((g) => { const next = scrollbarGutter(scroller.offsetWidth, scroller.clientWidth); return next === g ? g : next; });
    if (colWidths) return; // already fixed; measuring now would read back our own widths
    const head = headTableRef.current;
    const body = roTableRef.current;
    if (!head || !body) return;
    const cells = (el: Element | null | undefined) => (el ? Array.from(el.children).map((c) => (c as HTMLElement).offsetWidth) : []);
    const paired = pairWidths(cells(head.querySelector("thead tr")), cells(body.querySelector("tbody tr")));
    if (paired) setColWidths(paired);
  }, [colWidths, result, renderCap, fontSize, filterQuery]);
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
  const fixedTable = colWidths
    ? { className: "table-fixed", style: { width: totalWidth(colWidths) } }
    : { className: "w-full", style: undefined };
  const [editColWidths, setEditColWidths] = useState<number[] | null>(null);
  // "Add row" opens the editor with a row already staged, so inserting a row
  // is one click from the results, the way a data grid is expected to behave.
  const [openWithNewRow, setOpenWithNewRow] = useState(false);
  const startEditing = (cell: { row: number; col: number } | null, withNewRow = false) => {
    const ths = headTableRef.current?.querySelectorAll("thead th");
    setEditColWidths(ths ? Array.from(ths).map((th) => (th as HTMLElement).offsetWidth) : null);
    setFocusCell(cell);
    setOpenWithNewRow(withNewRow);
    setEditing(true);
  };
  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-lg rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
            <CircleSlash2 className="h-4 w-4 text-destructive" /> Statement failed
          </div>
          <pre className="font-mono text-xs whitespace-pre-wrap text-muted-foreground">{error}</pre>
        </div>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <Table2 className="h-6 w-6 opacity-40" />
        <p className="text-sm">Run a statement to see results here.</p>
      </div>
    );
  }
  if (result.kind !== "resultSet") {
    // A write, or a statement whose driver cannot report a count. The shared
    // summary says which — printing "0 rows affected" for the latter would be
    // a wrong answer, not a missing one.
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <span className="rounded-md bg-secondary px-3 py-1.5">
          {resultSummary(result)} · {result.elapsedMs} ms
        </span>
      </div>
    );
  }
  const canEdit = Boolean(editable && (onOpenSql || onCommitEdits));
  if (editing && editable && (onOpenSql || onCommitEdits)) {
    return (
      <EditableResultGrid
        columns={result.columns}
        rows={result.rows}
        schema={editable.schema}
        table={editable.table}
        pk={editable.pk}
        catalogColumns={editable.columns}
        initialFocus={focusCell}
        autoAddRow={openWithNewRow}
        colWidths={editColWidths}
        onOpenSql={onOpenSql}
        onApply={onCommitEdits}
        onExit={() => {
          setEditing(false);
          setFocusCell(null);
          setOpenWithNewRow(false);
        }}
      />
    );
  }
  const filterActive = Boolean(filterQuery && filterQuery.trim());
  const filtered = filterActive ? filterRows(result.rows, filterQuery!) : result.rows;
  // Editing addresses unfiltered `result.rows`, but the grid shows filtered
  // display indices — so double-click-to-edit is only safe when no filter is
  // active. Clear the filter to edit.
  const editableNow = canEdit && !filterActive;
  // Big results render incrementally: the DOM gets the first chunk and grows
  // on demand — 100k-row fetches must not freeze the window.
  const visible = filtered.length > renderCap ? filtered.slice(0, renderCap) : filtered;
  return (
    <div className="flex h-full flex-col">
      {hideToolbar ? null : (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1">
          {canEdit ? (
            <>
              <button
                onClick={() => startEditing(null)}
                title={`Edit rows in ${editable!.table}`}
                className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit data
              </button>
              <button
                onClick={() => startEditing(null, true)}
                title={`Insert a row into ${editable!.table}`}
                className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" /> Add row
              </button>
            </>
          ) : null}
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            {result.rowCount} row{result.rowCount === 1 ? "" : "s"} · {result.elapsedMs} ms
          </span>
        </div>
      )}
      <div className="flex h-full min-h-0 flex-1 flex-col" style={{ fontSize }}>
        {/* The column names are their own table, outside the scroller: the
            scrollbar then belongs to the rows and starts at row 1. It follows
            the body sideways (below), and border-separate (NOT collapse) keeps
            each header cell's own background and border. */}
        <div ref={headScrollRef} className="shrink-0 overflow-hidden" style={gutter ? { marginRight: gutter } : undefined}>
          <table ref={headTableRef} className={cn("border-separate border-spacing-0", fixedTable.className)} style={fixedTable.style}>
            {colWidths ? (
              <colgroup>
                {colWidths.map((w, i) => (
                  <col key={i} style={{ width: w }} />
                ))}
              </colgroup>
            ) : null}
          <thead>
            <tr>
              <th className="border-y border-r border-l border-border bg-secondary px-2 py-1.5 text-right font-mono text-[10px] text-muted-foreground">
                #
              </th>
              {result.columns.map((col) => (
                <th
                  key={col.name}
                  className="border-y border-r border-border bg-secondary px-3 py-1.5 text-left font-medium text-foreground"
                >
                  {col.name}
                  <span className="ml-1.5 font-mono text-[10px] font-normal text-muted-foreground">
                    {col.typeName}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          </table>
        </div>
        <div
          ref={bodyScrollRef}
          className="min-h-0 flex-1 overflow-auto"
          onScroll={(e) => {
            const head = headScrollRef.current;
            if (head) head.scrollLeft = e.currentTarget.scrollLeft;
          }}
        >
        <table ref={roTableRef} className={cn("border-separate border-spacing-0", fixedTable.className)} style={fixedTable.style}>
          {colWidths ? (
            <colgroup>
              {colWidths.map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
          ) : null}
          <tbody className="font-mono">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={result.columns.length + 1}
                  className="border-r border-b border-l border-border px-3 py-4 text-center text-[11px] text-muted-foreground"
                >
                  {filterActive ? <>No rows match “{filterQuery}”.</> : "No rows found."}
                </td>
              </tr>
            ) : (
              visible.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  title={editableNow ? "Double-click a cell to edit it" : undefined}
                  className={cn("hover:bg-accent/60", zebra && "even:bg-secondary/30", editableNow && "cursor-cell")}
                >
                  <td className="border-r border-b border-l border-border px-2 py-1 text-right text-[10px] text-muted-foreground">
                    {rowIndex + 1}
                  </td>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      onClick={onCellClick ? () => onCellClick({ value: cell, column: result.columns[cellIndex]?.name ?? "", row: rowIndex, col: cellIndex }) : undefined}
                      onDoubleClick={editableNow ? () => startEditing({ row: rowIndex, col: cellIndex }) : undefined}
                      className={cn(
                        "max-w-[380px] truncate border-r border-b border-border px-3 py-1 text-foreground",
                        onCellClick && "cursor-pointer",
                        selected && selected.row === rowIndex && selected.col === cellIndex && "bg-primary/15 ring-1 ring-inset ring-primary/40",
                      )}
                    >
                      {cell === null ? <span className="text-muted-foreground italic">null</span> : cellText(cell)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
        {filtered.length > visible.length ? (
          <div
            className="flex items-center justify-center gap-3 border-b border-border py-2"
            style={{ minWidth: "100%", width: colWidths ? totalWidth(colWidths) : undefined }}
          >
            <span className="font-mono text-[11px] text-muted-foreground">
              showing {visible.length.toLocaleString()} of {filtered.length.toLocaleString()} rows
            </span>
            <button
              onClick={() => setRenderCap((c) => c + RENDER_STEP)}
              className="h-6 rounded-md border border-border px-2.5 text-[11.5px] text-foreground transition-colors hover:bg-secondary"
            >
              Show {Math.min(RENDER_STEP, filtered.length - visible.length).toLocaleString()} more
            </button>
            <button
              onClick={() => setRenderCap(filtered.length)}
              className="h-6 rounded-md border border-border px-2.5 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Show all
            </button>
          </div>
        ) : null}
        </div>
      </div>
    </div>
  );
}

