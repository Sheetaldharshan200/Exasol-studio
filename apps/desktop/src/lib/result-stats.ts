// Pure helpers for the query-results panel: filtering, CSV export, and the
// "Query Statistics" side panel. Kept out of the React component so each piece
// is unit-testable in isolation (KISS: extract the pure logic first).
import type { ColumnMeta } from "@/lib/ipc";

/** A cell value rendered as a display string. null/undefined become "". */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

/**
 * Case-insensitive substring filter across every cell of a row. An empty (or
 * whitespace-only) query keeps every row. NULL cells never match.
 */
export function filterRows(rows: readonly unknown[][], query: string): unknown[][] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows as unknown[][];
  return rows.filter((row) => row.some((cell) => cellText(cell).toLowerCase().includes(needle)));
}

/** Escape a single CSV field per RFC 4180 (quote when it contains , " or a newline). */
function csvField(value: unknown): string {
  const text = cellText(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Render columns + rows as RFC 4180 CSV (CRLF line endings, header row from
 * column names). Empty rows still emit the header.
 */
export function toCsv(columns: readonly ColumnMeta[], rows: readonly unknown[][]): string {
  const header = columns.map((c) => csvField(c.name)).join(",");
  const body = rows.map((row) => row.map(csvField).join(","));
  return [header, ...body].join("\r\n");
}

/** A short tab label for one statement's result in a multi-result run, e.g.
 *  "Result 2 · 42 rows", "Result 3 · error", "Result 1 · 5 affected". */
export function resultTabLabel(
  r: { kind: "resultSet" | "rowCount"; rowCount: number; error: string | null },
  index: number,
  /** The statement's leading verb (SELECT, INSERT, …) so a script's tabs say
   *  WHAT ran, not just "Result N". */
  verb?: string,
): string {
  const head = verb ? `${index + 1} ${verb}` : `Result ${index + 1}`;
  if (r.error) return `${head} · error`;
  if (r.kind === "rowCount") return `${head} · ${r.rowCount} affected`;
  return `${head} · ${r.rowCount} row${r.rowCount === 1 ? "" : "s"}`;
}

/** Leading keyword of a statement, uppercased ("SELECT", "CREATE", …),
 *  skipping any leading comments. */
export function statementVerb(sql: string | undefined): string | undefined {
  let s = (sql ?? "").trim();
  for (;;) {
    if (s.startsWith("--")) {
      const nl = s.indexOf("\n");
      if (nl < 0) return undefined;
      s = s.slice(nl + 1).trim();
      continue;
    }
    if (s.startsWith("/*")) {
      const end = s.indexOf("*/");
      if (end < 0) return undefined;
      s = s.slice(end + 2).trim();
      continue;
    }
    break;
  }
  const m = s.match(/^[A-Za-z]+/);
  return m ? m[0].toUpperCase() : undefined;
}

export type QueryStats = {
  /** Wall-clock the statement took, in milliseconds. */
  timeMs: number;
  /** Rows currently shown in the grid (after any client-side filtering). */
  rows: number;
  /** Column count. */
  cols: number;
  /** Rows per second (0 when time or rows is 0 — never NaN/Infinity). */
  throughputPerSec: number;
  /** Average milliseconds per row (0 when there are no rows). */
  avgPerRowMs: number;
};

/**
 * Derive the "Query Statistics" numbers. `rows` is what the grid is showing
 * (so a filtered view reflects the filtered count); everything guards against
 * division by zero so the panel never renders NaN or Infinity.
 */
export function computeStats(input: { timeMs: number; rows: number; cols: number }): QueryStats {
  const timeMs = Math.max(0, input.timeMs);
  const rows = Math.max(0, input.rows);
  const cols = Math.max(0, input.cols);
  return {
    timeMs,
    rows,
    cols,
    throughputPerSec: timeMs > 0 && rows > 0 ? (rows / timeMs) * 1000 : 0,
    avgPerRowMs: rows > 0 ? timeMs / rows : 0,
  };
}
