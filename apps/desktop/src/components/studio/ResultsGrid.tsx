/**
 * The results table: a read-only grid over one statement's rows — only the
 * rows in view are in the DOM (lib/grid-view.ts), columns can be sorted,
 * resized and hidden, and right-click copies (ResultsGridMenus.tsx) — with the
 * column names in their own table ABOVE the scrolling area — so the vertical
 * scrollbar belongs to the rows and starts at the first one, instead of
 * running up beside the header. Two tables mean two sets of column widths, so
 * both are measured at their natural size and fixed to the wider of each pair
 * (see lib/table-widths.ts); the header follows the body sideways.
 *
 * Extracted from HistoryDock.tsx, which must not grow.
 */
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ContextMenu } from "radix-ui";
import { NullTextContext } from "./null-text";
import { ArrowDown, ArrowUp, CircleSlash2, Pencil, Plus, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { cellText, filterRows, resultSummary } from "@/lib/result-stats";
import { pairWidths, scrollbarGutter, totalWidth } from "@/lib/table-widths";
import { nextSort, resizedWidth, rowWindow, sortOrder, type GridSort } from "@/lib/grid-view";
import { errorHint, parseExaError } from "@/lib/exa-error";
import { CellMenu, HeaderMenu, copyToClipboard } from "./ResultsGridMenus";
import { sqlName } from "@/lib/sql-completion-scope";
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
  const nullText = useContext(NullTextContext);
  const [editing, setEditing] = useState(false);
  // The cell the user double-tapped — edit mode opens with THAT cell focused.
  const [focusCell, setFocusCell] = useState<{ row: number; col: number } | null>(null);
  // Sort, hidden columns and the scroll window, per result.
  const [sort, setSort] = useState<GridSort>(null);
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());
  useEffect(() => {
    setSort(null);
    setHidden(new Set());
  }, [result]);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(600);
  const [rowHeight, setRowHeight] = useState(24);
  // The right-clicked cell (display row, shown column) or column name.
  const [menuCell, setMenuCell] = useState<{ row: number; col: number } | null>(null);
  const [menuCol, setMenuCol] = useState<number | null>(null);
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
  // Widths of "#" and of every column (hidden ones too), measured once per
  // result and then only changed by dragging a column's edge.
  useLayoutEffect(() => setColWidths(null), [result, fontSize, filterQuery]);
  useLayoutEffect(() => {
    const scroller = bodyScrollRef.current;
    if (scroller) setGutter((g) => { const next = scrollbarGutter(scroller.offsetWidth, scroller.clientWidth); return next === g ? g : next; });
    if (colWidths) return; // already fixed; measuring now would read back our own widths
    const head = headTableRef.current;
    const body = roTableRef.current;
    if (!head || !body) return;
    const cells = (el: Element | null | undefined) => (el ? Array.from(el.children).map((c) => (c as HTMLElement).offsetWidth) : []);
    const firstRow = body.querySelector("tbody tr[data-row]") as HTMLElement | null;
    if (firstRow?.offsetHeight) setRowHeight(firstRow.offsetHeight);
    const paired = pairWidths(cells(head.querySelector("thead tr")), cells(firstRow));
    if (paired) setColWidths(paired);
  }, [colWidths, result, fontSize, filterQuery]);
  // A resize can add or remove the scrollbar with no React update at all, and
  // the header has to give back exactly what the body loses.
  useEffect(() => {
    const scroller = bodyScrollRef.current;
    if (!scroller || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      setGutter((g) => {
        const next = scrollbarGutter(scroller.offsetWidth, scroller.clientWidth);
        return next === g ? g : next;
      });
      setViewport(scroller.clientHeight || 600);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    measure();
    return () => ro.disconnect();
  }, []);
  const allCols = result?.columns ?? [];
  // Measuring needs every column on screen; afterwards hidden ones are left out.
  const shownCols = useMemo(() => allCols.map((_, i) => i).filter((i) => !colWidths || !hidden.has(i)), [allCols, hidden, colWidths]);
  const shownWidths = colWidths ? [colWidths[0], ...shownCols.map((c) => colWidths[c + 1])] : null;
  const fixedTable = shownWidths
    ? { className: "table-fixed", style: { width: totalWidth(shownWidths) } }
    : { className: "w-full", style: undefined };
  const filterActive = Boolean(filterQuery && filterQuery.trim());
  const filtered = useMemo(() => (result && filterActive ? filterRows(result.rows, filterQuery!) : (result?.rows ?? [])), [result, filterActive, filterQuery]);
  const order = useMemo(() => sortOrder(filtered, sort, sort ? allCols[sort.col]?.typeName : ""), [filtered, sort, allCols]);
  const startResize = (col: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const from = colWidths?.[col + 1];
    if (!from) return;
    const x0 = e.clientX;
    const move = (ev: PointerEvent) => setColWidths((w) => (w ? w.map((v, i) => (i === col + 1 ? resizedWidth(from, ev.clientX - x0) : v)) : w));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  /** What the grid shows, in its order: for copying. */
  const shownData = () => ({
    columns: shownCols.map((c) => allCols[c]),
    rows: order.map((i) => shownCols.map((c) => filtered[i][c])),
  });
  const [menuData, setMenuData] = useState<ReturnType<typeof shownData> | null>(null);
  const [editColWidths, setEditColWidths] = useState<number[] | null>(null);
  // "Add row" opens the editor with a row already staged, so inserting a row
  // is one click from the results, the way a data grid is expected to behave.
  const [openWithNewRow, setOpenWithNewRow] = useState(false);
  const startEditing = (cell: { row: number; col: number } | null, withNewRow = false) => {
    // Every column's width (hidden ones too): the editor shows them all.
    setEditColWidths(colWidths);
    setFocusCell(cell);
    setOpenWithNewRow(withNewRow);
    setEditing(true);
  };
  if (error) {
    const e = parseExaError(error);
    const hint = errorHint(e.code);
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-lg rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
            <CircleSlash2 className="h-4 w-4 text-destructive" /> Statement failed
            {e.code ? <span className="rounded bg-destructive/15 px-1.5 font-mono text-[11px] text-destructive">{e.code}</span> : null}
          </div>
          <pre className="font-mono text-xs whitespace-pre-wrap text-foreground">{e.message}</pre>
          {e.line !== null || e.session ? (
            <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
              {e.line !== null ? `Line ${e.line}, column ${e.column}` : null}
              {e.line !== null && e.session ? " · " : null}
              {e.session ? `Session ${e.session}` : null}
            </p>
          ) : null}
          {hint ? <p className="mt-1.5 text-[12px] text-muted-foreground">{hint}</p> : null}
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
  // Editing addresses unfiltered `result.rows`; with a filter the display
  // rows are a subset. Clear the filter to edit (a sort is mapped back).
  const editableNow = canEdit && !filterActive;
  // Only the rows in view (and some overscan) are in the DOM.
  const win = rowWindow(scrollTop, viewport, rowHeight, order.length);
  const colSpan = shownCols.length + 1;
  const insertTarget = editable ? [editable.schema, editable.table].filter(Boolean).map((n) => sqlName(n!)).join(".") : undefined;
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
        <ContextMenu.Root onOpenChange={(open) => !open && setMenuCol(null)}>
          <ContextMenu.Trigger asChild>
            <div ref={headScrollRef} className="shrink-0 overflow-hidden" style={gutter ? { marginRight: gutter } : undefined}>
              <table ref={headTableRef} className={cn("border-separate border-spacing-0", fixedTable.className)} style={fixedTable.style}>
                {shownWidths ? (
                  <colgroup>
                    {shownWidths.map((w, i) => (
                      <col key={i} style={{ width: w }} />
                    ))}
                  </colgroup>
                ) : null}
                <thead>
                  <tr>
                    <th className="border-y border-r border-l border-border bg-secondary px-2 py-1.5 text-right font-mono text-[10px] text-muted-foreground">
                      #
                    </th>
                    {shownCols.map((c) => {
                      const col = allCols[c];
                      return (
                        <th
                          key={c}
                          onClick={() => setSort((s) => nextSort(s, c))}
                          onContextMenu={() => setMenuCol(c)}
                          title="Sort by this column; right-click for more"
                          className="relative cursor-pointer truncate border-y border-r border-border bg-secondary px-3 py-1.5 text-left font-medium text-foreground select-none hover:bg-accent/60"
                        >
                          {col.name}
                          <span className="ml-1.5 font-mono text-[10px] font-normal text-muted-foreground">{col.typeName}</span>
                          {sort?.col === c ? (
                            sort.dir === "asc" ? <ArrowUp className="ml-1 inline h-3 w-3 text-primary" /> : <ArrowDown className="ml-1 inline h-3 w-3 text-primary" />
                          ) : null}
                          {colWidths ? (
                            <span
                              onPointerDown={(e) => startResize(c, e)}
                              onClick={(e) => e.stopPropagation()}
                              className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40"
                            />
                          ) : null}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
              </table>
            </div>
          </ContextMenu.Trigger>
          <HeaderMenu
            col={menuCol}
            name={menuCol !== null ? (allCols[menuCol]?.name ?? "") : ""}
            sort={sort}
            hiddenCount={hidden.size}
            onSort={setSort}
            onHide={(c) => shownCols.length > 1 && setHidden((h) => new Set(h).add(c))}
            onShowAll={() => setHidden(new Set())}
          />
        </ContextMenu.Root>
        <ContextMenu.Root
          onOpenChange={(open) => {
            if (open) return;
            setMenuData(null);
            setMenuCell(null);
          }}
        >
          <ContextMenu.Trigger asChild>
            <div
              ref={bodyScrollRef}
              tabIndex={0}
              className="min-h-0 flex-1 overflow-auto outline-none"
              onScroll={(e) => {
                const head = headScrollRef.current;
                if (head) head.scrollLeft = e.currentTarget.scrollLeft;
                setScrollTop(e.currentTarget.scrollTop);
              }}
              onContextMenu={() => setMenuData(shownData())}
              onKeyDown={(e) => {
                // Cmd/Ctrl+C copies the selected cell.
                if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "c" && selected && order[selected.row] !== undefined) {
                  e.preventDefault();
                  copyToClipboard(cellText(filtered[order[selected.row]][selected.col]));
                }
              }}
            >
              <table ref={roTableRef} className={cn("border-separate border-spacing-0", fixedTable.className)} style={fixedTable.style}>
                {shownWidths ? (
                  <colgroup>
                    {shownWidths.map((w, i) => (
                      <col key={i} style={{ width: w }} />
                    ))}
                  </colgroup>
                ) : null}
                <tbody className="font-mono">
                  {order.length === 0 ? (
                    <tr>
                      <td colSpan={colSpan} className="border-r border-b border-l border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
                        {filterActive ? <>No rows match “{filterQuery}”.</> : "No rows found."}
                      </td>
                    </tr>
                  ) : (
                    <>
                      {win.top ? (
                        <tr aria-hidden>
                          <td colSpan={colSpan} style={{ height: win.top, padding: 0, border: 0 }} />
                        </tr>
                      ) : null}
                      {order.slice(win.start, win.end).map((src, k) => {
                        const rowIndex = win.start + k;
                        const row = filtered[src];
                        return (
                          <tr
                            key={rowIndex}
                            data-row
                            title={editableNow ? "Double-click a cell to edit it" : undefined}
                            className={cn("hover:bg-accent/60", zebra && rowIndex % 2 === 1 && "bg-secondary/30", editableNow && "cursor-cell")}
                          >
                            <td className="border-r border-b border-l border-border px-2 py-1 text-right text-[10px] text-muted-foreground">{rowIndex + 1}</td>
                            {shownCols.map((c, shownIndex) => {
                              const cell = row[c];
                              return (
                                <td
                                  key={c}
                                  onClick={onCellClick ? () => onCellClick({ value: cell, column: allCols[c]?.name ?? "", row: rowIndex, col: c }) : undefined}
                                  onContextMenu={() => setMenuCell({ row: rowIndex, col: shownIndex })}
                                  onDoubleClick={editableNow ? () => startEditing({ row: src, col: c }) : undefined}
                                  className={cn(
                                    "truncate border-r border-b border-border px-3 py-1 text-foreground",
                                    !colWidths && "max-w-[380px]",
                                    onCellClick && "cursor-pointer",
                                    selected && selected.row === rowIndex && selected.col === c && "bg-primary/15 ring-1 ring-primary/40 ring-inset",
                                  )}
                                >
                                  {cell === null ? <span className="text-muted-foreground italic">{nullText}</span> : cellText(cell)}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                      {win.bottom ? (
                        <tr aria-hidden>
                          <td colSpan={colSpan} style={{ height: win.bottom, padding: 0, border: 0 }} />
                        </tr>
                      ) : null}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </ContextMenu.Trigger>
          {menuData ? <CellMenu columns={menuData.columns} rows={menuData.rows} cell={menuCell} table={insertTarget} /> : null}
        </ContextMenu.Root>
        {hidden.size ? (
          <div className="flex shrink-0 items-center gap-2 border-t border-border px-2 py-1 text-[11px] text-muted-foreground">
            {hidden.size} column{hidden.size === 1 ? "" : "s"} hidden
            <button onClick={() => setHidden(new Set())} className="rounded px-1.5 text-foreground hover:bg-secondary">
              Show all
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

