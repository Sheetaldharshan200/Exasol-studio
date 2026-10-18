// Right-click menus of the results grid: on a cell (copy the value, the row,
// the column, or all shown rows in a format) and on a column name (sort,
// hide, copy). The text comes from lib/result-copy.ts.

import { ContextMenu } from "radix-ui";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Clipboard, EyeOff, Eye, Rows3, Columns3 } from "lucide-react";
import type { ColumnMeta } from "@/lib/ipc";
import { cellText } from "@/lib/result-stats";
import { columnText, formatRows, type CopyFormat } from "@/lib/result-copy";
import type { GridSort } from "@/lib/grid-view";

const CONTENT =
  "z-50 min-w-48 overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10";
const ITEM =
  "flex cursor-default items-center gap-2 rounded-md px-2 py-1 text-[12.5px] outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:text-muted-foreground";
const SEP = "my-1 h-px bg-border";

const FORMATS: { format: CopyFormat; label: string }[] = [
  { format: "tsv", label: "Tab-separated (spreadsheets)" },
  { format: "csv", label: "CSV" },
  { format: "markdown", label: "Markdown table" },
  { format: "insert", label: "SQL INSERT statements" },
  { format: "json", label: "JSON" },
];

export const copyToClipboard = (text: string) => void navigator.clipboard?.writeText(text).catch(() => undefined);

/** Cell menu items. `rows` and `columns` are what the grid shows, in its
 *  order; `row` / `col` index into them. */
export function CellMenu({
  columns,
  rows,
  cell,
  table,
}: {
  columns: ColumnMeta[];
  rows: unknown[][];
  cell: { row: number; col: number } | null;
  table?: string;
}) {
  const value = cell ? rows[cell.row]?.[cell.col] : undefined;
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content className={CONTENT}>
        <ContextMenu.Item className={ITEM} disabled={!cell} onSelect={() => copyToClipboard(cellText(value))}>
          <Clipboard /> Copy value
        </ContextMenu.Item>
        <ContextMenu.Item className={ITEM} disabled={!cell} onSelect={() => cell && copyToClipboard(formatRows("tsv", columns, [rows[cell.row]], { header: false }))}>
          <Rows3 /> Copy row
        </ContextMenu.Item>
        <ContextMenu.Item className={ITEM} disabled={!cell} onSelect={() => cell && copyToClipboard(columnText(rows, cell.col))}>
          <Columns3 /> Copy column
        </ContextMenu.Item>
        <ContextMenu.Separator className={SEP} />
        <ContextMenu.Label className="px-2 py-1 text-[11px] text-muted-foreground">
          Copy {rows.length.toLocaleString()} row{rows.length === 1 ? "" : "s"} as
        </ContextMenu.Label>
        {FORMATS.map((f) => (
          <ContextMenu.Item key={f.format} className={ITEM} onSelect={() => copyToClipboard(formatRows(f.format, columns, rows, { table }))}>
            {f.label}
          </ContextMenu.Item>
        ))}
      </ContextMenu.Content>
    </ContextMenu.Portal>
  );
}

/** Column-name menu items for column `col` (an index into all columns). */
export function HeaderMenu({
  col,
  name,
  sort,
  hiddenCount,
  onSort,
  onHide,
  onShowAll,
}: {
  col: number | null;
  name: string;
  sort: GridSort;
  hiddenCount: number;
  onSort: (sort: GridSort) => void;
  onHide: (col: number) => void;
  onShowAll: () => void;
}) {
  const sorted = col !== null && sort?.col === col ? sort.dir : null;
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content className={CONTENT}>
        <ContextMenu.Item className={ITEM} disabled={col === null || sorted === "asc"} onSelect={() => col !== null && onSort({ col, dir: "asc" })}>
          <ArrowUpNarrowWide /> Sort ascending
        </ContextMenu.Item>
        <ContextMenu.Item className={ITEM} disabled={col === null || sorted === "desc"} onSelect={() => col !== null && onSort({ col, dir: "desc" })}>
          <ArrowDownWideNarrow /> Sort descending
        </ContextMenu.Item>
        {sorted ? (
          <ContextMenu.Item className={ITEM} onSelect={() => onSort(null)}>
            Clear sort
          </ContextMenu.Item>
        ) : null}
        <ContextMenu.Separator className={SEP} />
        <ContextMenu.Item className={ITEM} disabled={col === null} onSelect={() => col !== null && onHide(col)}>
          <EyeOff /> Hide column
        </ContextMenu.Item>
        {hiddenCount ? (
          <ContextMenu.Item className={ITEM} onSelect={onShowAll}>
            <Eye /> Show {hiddenCount} hidden column{hiddenCount === 1 ? "" : "s"}
          </ContextMenu.Item>
        ) : null}
        <ContextMenu.Item className={ITEM} disabled={col === null} onSelect={() => copyToClipboard(name)}>
          <Clipboard /> Copy column name
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Portal>
  );
}
