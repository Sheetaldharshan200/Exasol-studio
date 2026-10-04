// Result rows as text for the clipboard or a file: tab-separated (pastes
// into spreadsheets), CSV, Markdown, SQL INSERT and JSON. Pure.

import type { ColumnMeta } from "./ipc.ts";
import { cellText, toCsv } from "./result-stats.ts";
import { sqlName } from "./sql-completion-scope.ts";

export type CopyFormat = "tsv" | "csv" | "markdown" | "insert" | "json";

/** A field for tab-separated text: quoted (spreadsheet style) only when it
 *  holds a tab, a newline or a quote, so plain values paste as they are. */
function tsvField(v: unknown): string {
  const t = cellText(v);
  return /[\t\r\n"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

function markdownField(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  return cellText(v).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>") || " ";
}

const NUMERIC_TYPE = /^(DECIMAL|DOUBLE|FLOAT|INT|INTEGER|BIGINT|SMALLINT|TINYINT|NUMBER|NUMERIC|REAL)/i;

/** A value as an Exasol SQL literal, by its column type. */
export function sqlLiteral(v: unknown, typeName: string): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number" || typeof v === "bigint") return Number.isFinite(Number(v)) ? String(v) : "NULL";
  const t = cellText(v);
  if (NUMERIC_TYPE.test(typeName) && /^-?\d+(\.\d+)?(E[+-]?\d+)?$/i.test(t)) return t;
  if (/^BOOLEAN/i.test(typeName) && /^(true|false)$/i.test(t)) return t.toUpperCase();
  const quoted = `'${t.replace(/'/g, "''")}'`;
  if (/^DATE/i.test(typeName)) return `DATE ${quoted}`;
  if (/^TIMESTAMP/i.test(typeName)) return `TIMESTAMP ${quoted}`;
  return quoted;
}

/** Rows as text. `table` names the INSERT target (default "TABLE_NAME");
 *  `header` adds column names to tab-separated text (default true). */
export function formatRows(
  format: CopyFormat,
  columns: readonly ColumnMeta[],
  rows: readonly unknown[][],
  opts: { table?: string; header?: boolean } = {},
): string {
  switch (format) {
    case "tsv": {
      const lines = rows.map((r) => r.map(tsvField).join("\t"));
      if (opts.header ?? true) lines.unshift(columns.map((c) => tsvField(c.name)).join("\t"));
      return lines.join("\n");
    }
    case "csv":
      // A clipboard is not a spreadsheet file: no formula guard here.
      return toCsv(columns, rows, { guardFormulas: false });
    case "markdown": {
      const head = `| ${columns.map((c) => markdownField(c.name)).join(" | ")} |`;
      const rule = `|${columns.map(() => " --- ").join("|")}|`;
      return [head, rule, ...rows.map((r) => `| ${r.map(markdownField).join(" | ")} |`)].join("\n");
    }
    case "insert": {
      const target = opts.table?.trim() || "TABLE_NAME";
      const names = columns.map((c) => sqlName(c.name)).join(", ");
      return rows.map((r) => `INSERT INTO ${target} (${names}) VALUES (${r.map((v, i) => sqlLiteral(v, columns[i]?.typeName ?? "")).join(", ")});`).join("\n");
    }
    case "json":
      return JSON.stringify(
        rows.map((r) => Object.fromEntries(columns.map((c, i) => [c.name, r[i] ?? null]))),
        (_k, v) => (typeof v === "bigint" ? v.toString() : v),
        2,
      );
  }
}

/** One column's values, one per line. */
export function columnText(rows: readonly unknown[][], col: number): string {
  return rows.map((r) => cellText(r[col])).join("\n");
}

/** A cell's text for a viewer: JSON objects and arrays pretty-printed, else as is. */
export function prettyCell(v: unknown): { text: string; json: boolean } {
  const t = cellText(v);
  const s = t.trim();
  if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
    try {
      return { text: JSON.stringify(JSON.parse(s), null, 2), json: true };
    } catch {
      /* not JSON */
    }
  }
  return { text: t, json: false };
}
