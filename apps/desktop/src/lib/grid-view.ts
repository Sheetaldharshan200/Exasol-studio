// The results grid's view of its rows: sort order, the window of rows worth
// rendering, and column widths. Pure; ResultsGrid.tsx draws it.

import { cellText } from "./result-stats.ts";

export type SortDir = "asc" | "desc";
export type GridSort = { col: number; dir: SortDir } | null;

const NUMERIC_TYPE = /^(DECIMAL|DOUBLE|FLOAT|INT|INTEGER|BIGINT|SMALLINT|TINYINT|NUMBER|NUMERIC|REAL)/i;

/** A value comparable as a number, or null. Exact decimals arrive as text. */
function asNumber(v: unknown, numericType: boolean): number | null {
  if (typeof v === "number") return Number.isNaN(v) ? null : v;
  if (typeof v === "bigint") return Number(v);
  if (numericType && typeof v === "string" && /^-?\d+(\.\d+)?(E[+-]?\d+)?$/i.test(v.trim())) return Number(v);
  return null;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Row indices in sorted order. NULLs last either way; numbers by value;
 *  text by a natural, case-insensitive order; ties keep their place. */
export function sortOrder(rows: readonly unknown[][], sort: GridSort, typeName = ""): number[] {
  const order = rows.map((_, i) => i);
  if (!sort) return order;
  const numeric = NUMERIC_TYPE.test(typeName);
  const sign = sort.dir === "asc" ? 1 : -1;
  const key = rows.map((r) => r[sort.col]);
  return order.sort((a, b) => {
    const x = key[a];
    const y = key[b];
    const xNull = x === null || x === undefined;
    const yNull = y === null || y === undefined;
    if (xNull || yNull) return xNull === yNull ? a - b : xNull ? 1 : -1;
    const nx = asNumber(x, numeric);
    const ny = asNumber(y, numeric);
    const c = nx !== null && ny !== null ? nx - ny : collator.compare(cellText(x), cellText(y));
    return c === 0 ? a - b : sign * c;
  });
}

/** The next sort for a click on column `col`: ascending, descending, off. */
export function nextSort(sort: GridSort, col: number): GridSort {
  if (!sort || sort.col !== col) return { col, dir: "asc" };
  return sort.dir === "asc" ? { col, dir: "desc" } : null;
}

/** The rows to render for a scroll position, with `overscan` extra on each
 *  side, and the blank space above and below them. */
export function rowWindow(scrollTop: number, viewport: number, rowHeight: number, count: number, overscan = 20) {
  if (count <= 0 || rowHeight <= 0) return { start: 0, end: 0, top: 0, bottom: 0 };
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const start = Math.max(0, Math.min(count - 1, first) - overscan);
  const end = Math.min(count, first + Math.ceil(Math.max(0, viewport) / rowHeight) + overscan);
  return { start, end, top: start * rowHeight, bottom: (count - end) * rowHeight };
}

export const MIN_COL_WIDTH = 48;
export const MAX_COL_WIDTH = 2000;

/** A column's width after dragging its edge by `delta` pixels. */
export const resizedWidth = (start: number, delta: number) => Math.round(Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, start + delta)));
