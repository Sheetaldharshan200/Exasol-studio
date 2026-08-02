/**
 * Pure SQL text utilities for the editor: statement splitting, cursor-to-
 * statement resolution, comment stripping, and single-table detection.
 *
 * These were inline in ExasolStudio.tsx, where nothing could reach them without
 * mounting a ~5,000-line component. They are pure string functions with real
 * edge cases (quotes, comments, unterminated literals), so per CLAUDE.md's
 * "keep it small enough to test" rule they live here and are unit-tested in
 * sql-text.test.ts.
 */

export type Stmt = { text: string; start: number; end: number };

/**
 * Split SQL into statements on top-level semicolons, ignoring semicolons inside
 * single/double quotes, line comments (--), and block comments. Mirrors the
 * backend splitter (query.rs::split_statements) so "Run" sends exactly what the
 * server will execute.
 */
export function splitStatements(sql: string): Stmt[] {
  const out: Stmt[] = [];
  let start = 0;
  let inSingle = false;
  let inDouble = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const n = sql[i + 1];
    if (inLine) {
      if (c === "\n") inLine = false;
      continue;
    }
    if (inBlock) {
      if (c === "*" && n === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inSingle) {
      if (c === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (c === '"') inDouble = false;
      continue;
    }
    if (c === "'") inSingle = true;
    else if (c === '"') inDouble = true;
    else if (c === "-" && n === "-") {
      inLine = true;
      i++;
    } else if (c === "/" && n === "*") {
      inBlock = true;
      i++;
    } else if (c === ";") {
      const text = sql.slice(start, i).trim();
      if (text) out.push({ text, start, end: i });
      start = i + 1;
    }
  }
  const tail = sql.slice(start).trim();
  if (tail) out.push({ text: tail, start, end: sql.length });
  return out;
}

/**
 * The statement at the caret, following DbVisualizer's Execute Current rule:
 * "the statement containing the caret or that ends on the line with the
 * caret". So a caret resting just after a ";" (still on the same line) runs
 * the statement that was just written — not the next one. Falls back to the
 * next statement after the caret, or the whole input if it is a single
 * unterminated statement.
 */
export function statementAtOffset(sql: string, offset: number): string {
  const stmts = splitStatements(sql);
  if (stmts.length === 0) return sql.trim();
  // 1. The statement whose actual text (not leading whitespace) contains the caret.
  for (const s of stmts) {
    const span = sql.slice(s.start, s.end);
    const textStart = s.start + (span.length - span.trimStart().length);
    if (offset >= textStart && offset <= s.end) return s.text;
  }
  // 2. A statement that ends on the caret's line — prefer the last one ending
  //    at or before the caret (the one the user just finished typing).
  const lineStart = sql.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  const nl = sql.indexOf("\n", offset);
  const lineEnd = nl < 0 ? sql.length : nl;
  const onLine = stmts.filter((s) => s.end >= lineStart && s.end <= lineEnd);
  if (onLine.length > 0) {
    const before = onLine.filter((s) => s.end <= offset);
    return (before.length > 0 ? before[before.length - 1] : onLine[0]).text;
  }
  // 3. The next statement after the caret, else the last one.
  for (const s of stmts) {
    if (offset <= s.end) return s.text;
  }
  return stmts[stmts.length - 1].text;
}

/** The run modes offered by the query toolbar. */
export type RunScope = "auto" | "statement" | "selection" | "script" | "buffer";

/**
 * The SQL a given run mode targets (before comment-stripping / empty fallback).
 * Pure so every mode/permutation is unit-testable without the editor:
 *  - auto:      the selection if there is one, else the statement at the cursor
 *  - selection: the selection, or the whole buffer when nothing is selected
 *  - statement: the statement at the cursor
 *  - script:    the selection if there is one (run as a script), else the whole
 *               buffer — matches DBVisualizer's "Execute buffer as SQL script"
 *  - buffer:    the whole buffer, always (run as one statement)
 */
export function pickRunSql(scope: RunScope, full: string, selection: string, cursorOffset: number): string {
  switch (scope) {
    case "auto":
      return selection.trim() ? selection : statementAtOffset(full, cursorOffset);
    case "selection":
      return selection.trim() || full;
    case "statement":
      return statementAtOffset(full, cursorOffset);
    case "script":
      return selection.trim() ? selection : full;
    case "buffer":
      return full;
  }
}

/** Strip line (--) and block comments, preserving string literals. */
export function stripSqlComments(sql: string): string {
  let out = "";
  let inSingle = false;
  let inDouble = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const n = sql[i + 1];
    if (inLine) {
      if (c === "\n") {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === "*" && n === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inSingle) {
      out += c;
      if (c === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      out += c;
      if (c === '"') inDouble = false;
      continue;
    }
    if (c === "'") {
      inSingle = true;
      out += c;
    } else if (c === '"') {
      inDouble = true;
      out += c;
    } else if (c === "-" && n === "-") {
      inLine = true;
      i++;
    } else if (c === "/" && n === "*") {
      inBlock = true;
      i++;
    } else {
      out += c;
    }
  }
  return out;
}

/** Detect a simple single-table SELECT (safe to edit inline). Null otherwise. */
export function parseSingleTable(sql: string): { schema?: string; table: string } | null {
  // Normalize whitespace FIRST: builder/tree SQL is multi-line ("SELECT *\nFROM…")
  // and the single-space " from " probe below never matched it — which is why
  // query-builder results weren't editable while hand-typed one-liners were.
  const s = sql.trim().replace(/;+\s*$/, "").replace(/\s+/g, " ");
  if (!/^select\b/i.test(s)) return null;
  if (/\bjoin\b|\bgroup\s+by\b|\bunion\b|\bhaving\b|\bdistinct\b/i.test(s)) return null;
  const fromIdx = s.toLowerCase().indexOf(" from ");
  if (fromIdx < 0) return null;
  if (/\(/.test(s.slice(6, fromIdx))) return null; // function/aggregate in projection
  const m = s.slice(fromIdx + 6).match(/^\s*("?[\w$]+"?)(?:\s*\.\s*("?[\w$]+"?))?/);
  if (!m) return null;
  const clean = (x: string) => x.replace(/"/g, "");
  return m[2] ? { schema: clean(m[1]), table: clean(m[2]) } : { table: clean(m[1]) };
}

/**
 * Name a new query tab after its table (Open data / Generate SELECT), so the
 * tab strip reads "WEATHER_DAILY" instead of "Untitled". Empty/ambiguous SQL
 * keeps the "Untitled" placeholder.
 */
export function tabTitleFromSql(sql: string): string {
  const t = parseSingleTable(sql);
  return t?.table ?? "Untitled";
}

/** Wall-clock time for the run-status strip, 24-hour, locale-formatted. */
export function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}
