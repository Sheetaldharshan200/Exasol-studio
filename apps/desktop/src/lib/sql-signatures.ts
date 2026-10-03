// Signature help and hover for the SQL editor: what a built-in Exasol
// function takes, which argument the caret is on, and what a table holds.
// Pure; the Monaco providers are in components/studio/sql-signature-help.ts.

import type { SqlCatalog } from "./sql-completion.ts";
import { IDENT, catalogName, tableRefs, type TableRef } from "./sql-completion-scope.ts";

/** `repeat`: how many parameters before `...` repeat as a group (default 1). */
export type Signature = { params: string[]; doc: string; repeat?: number };

const s = (doc: string, ...params: string[]): Signature => ({ doc, params });

/** Built-in functions. An optional argument is in brackets; `...` repeats. */
export const SIGNATURES: Record<string, Signature> = {
  // Conversion
  CAST: s("Converts a value to a data type.", "expr AS data_type"),
  CONVERT: s("Converts a value to a data type.", "data_type", "expr"),
  TO_CHAR: s("Formats a number or a date/timestamp as a string.", "value", "[format]", "[nls_param]"),
  TO_DATE: s("Reads a string as a DATE.", "string", "[format]"),
  TO_TIMESTAMP: s("Reads a string as a TIMESTAMP.", "string", "[format]"),
  TO_NUMBER: s("Reads a string as a number.", "string", "[format]"),
  IS_NUMBER: s("TRUE if the string can be read as a number.", "string", "[format]"),
  IS_DATE: s("TRUE if the string can be read as a DATE.", "string", "[format]"),
  IS_TIMESTAMP: s("TRUE if the string can be read as a TIMESTAMP.", "string", "[format]"),
  IS_BOOLEAN: s("TRUE if the string can be read as a BOOLEAN.", "string"),
  TYPEOF: s("The data type of the expression, as a string.", "expr"),
  // NULL handling
  COALESCE: s("The first argument that is not NULL.", "expr1", "expr2", "..."),
  NVL: s("expr2 when expr1 is NULL, else expr1.", "expr1", "expr2"),
  NVL2: s("expr2 when expr1 is not NULL, else expr3.", "expr1", "expr2", "expr3"),
  NULLIF: s("NULL when both are equal, else expr1.", "expr1", "expr2"),
  ZEROIFNULL: s("0 when the number is NULL.", "number"),
  NULLIFZERO: s("NULL when the number is 0.", "number"),
  DECODE: { ...s("Compares expr with each search value and returns the matching result; a last odd argument is the default.", "expr", "search", "result", "..."), repeat: 2 },
  GREATEST: s("The largest of the arguments.", "expr1", "expr2", "..."),
  LEAST: s("The smallest of the arguments.", "expr1", "expr2", "..."),
  // Strings
  SUBSTR: s("Part of a string, from a 1-based position.", "string", "position", "[length]"),
  SUBSTRING: s("Part of a string, from a 1-based position (also SUBSTRING(string FROM position FOR length)).", "string", "position", "[length]"),
  INSTR: s("Position of a search string (0 if not found).", "string", "search", "[position]", "[occurrence]"),
  REPLACE: s("Replaces every occurrence of a search string (removes it without a replacement).", "string", "search", "[replacement]"),
  TRANSLATE: s("Replaces characters one for one.", "string", "from_chars", "to_chars"),
  LPAD: s("Pads a string on the left to a length.", "string", "length", "[padding]"),
  RPAD: s("Pads a string on the right to a length.", "string", "length", "[padding]"),
  TRIM: s("Removes characters (spaces by default) from both ends.", "string", "[chars]"),
  LTRIM: s("Removes characters (spaces by default) from the start.", "string", "[chars]"),
  RTRIM: s("Removes characters (spaces by default) from the end.", "string", "[chars]"),
  LENGTH: s("Number of characters.", "string"),
  CHAR_LENGTH: s("Number of characters.", "string"),
  CONCAT: s("Joins strings.", "string1", "string2", "..."),
  UPPER: s("Upper case.", "string"),
  LOWER: s("Lower case.", "string"),
  INITCAP: s("First letter of each word in upper case.", "string"),
  REVERSE: s("The string backwards.", "string"),
  REPEAT: s("The string repeated n times.", "string", "n"),
  SPACE: s("n spaces.", "n"),
  ASCII: s("Code of the first character.", "char"),
  CHR: s("The character with this code.", "code"),
  EDIT_DISTANCE: s("Levenshtein distance between two strings.", "string1", "string2"),
  REGEXP_SUBSTR: s("The part matching a regular expression.", "string", "pattern", "[position]", "[occurrence]"),
  REGEXP_REPLACE: s("Replaces matches of a regular expression.", "string", "pattern", "[replacement]", "[position]", "[occurrence]"),
  REGEXP_INSTR: s("Position of a regular-expression match.", "string", "pattern", "[position]", "[occurrence]", "[return_opt]"),
  HASH_MD5: s("MD5 hash (hex) of the arguments.", "expr", "..."),
  HASH_SHA256: s("SHA-256 hash (hex) of the arguments.", "expr", "..."),
  JSON_VALUE: s("A scalar from a JSON document by path.", "json", "path"),
  // Numbers
  ROUND: s("Rounds a number to digits (or a date to a unit, e.g. 'MM').", "value", "[digits_or_unit]"),
  TRUNC: s("Truncates a number to digits (or a date to a unit, e.g. 'MM').", "value", "[digits_or_unit]"),
  ABS: s("Absolute value.", "number"),
  SIGN: s("-1, 0 or 1.", "number"),
  CEIL: s("Smallest integer not below the number.", "number"),
  FLOOR: s("Largest integer not above the number.", "number"),
  MOD: s("Remainder of m divided by n.", "m", "n"),
  POWER: s("base raised to exponent.", "base", "exponent"),
  SQRT: s("Square root.", "number"),
  EXP: s("e raised to the number.", "number"),
  LN: s("Natural logarithm.", "number"),
  LOG: s("Logarithm of n to a base.", "base", "n"),
  RANDOM: s("A random number between 0 and 1, or between min and max.", "[min, max]"),
  // Dates and times
  ADD_DAYS: s("Adds days to a date or timestamp.", "datetime", "days"),
  ADD_WEEKS: s("Adds weeks to a date or timestamp.", "datetime", "weeks"),
  ADD_MONTHS: s("Adds months to a date or timestamp.", "datetime", "months"),
  ADD_YEARS: s("Adds years to a date or timestamp.", "datetime", "years"),
  ADD_HOURS: s("Adds hours to a timestamp.", "datetime", "hours"),
  ADD_MINUTES: s("Adds minutes to a timestamp.", "datetime", "minutes"),
  ADD_SECONDS: s("Adds seconds (with fractions) to a timestamp.", "datetime", "seconds"),
  DAYS_BETWEEN: s("datetime1 minus datetime2, in days.", "datetime1", "datetime2"),
  MONTHS_BETWEEN: s("datetime1 minus datetime2, in months.", "datetime1", "datetime2"),
  YEARS_BETWEEN: s("datetime1 minus datetime2, in years.", "datetime1", "datetime2"),
  HOURS_BETWEEN: s("datetime1 minus datetime2, in hours.", "datetime1", "datetime2"),
  MINUTES_BETWEEN: s("datetime1 minus datetime2, in minutes.", "datetime1", "datetime2"),
  SECONDS_BETWEEN: s("datetime1 minus datetime2, in seconds.", "datetime1", "datetime2"),
  DATE_TRUNC: s("Truncates to a unit: 'year', 'month', 'day', 'hour', …", "unit", "datetime"),
  EXTRACT: s("A field of a date or timestamp.", "field FROM datetime"),
  CONVERT_TZ: s("Converts a timestamp between time zones.", "datetime", "from_tz", "to_tz", "[options]"),
  POSIX_TIME: s("Seconds since 1970-01-01 (of now, or of the timestamp).", "[datetime]"),
  FROM_POSIX_TIME: s("The timestamp of seconds since 1970-01-01.", "seconds"),
  YEAR: s("The year of a date.", "datetime"),
  MONTH: s("The month of a date.", "datetime"),
  DAY: s("The day of the month.", "datetime"),
  WEEK: s("The ISO week of the year.", "datetime"),
  HOUR: s("The hour of a timestamp.", "datetime"),
  MINUTE: s("The minute of a timestamp.", "datetime"),
  SECOND: s("The seconds of a timestamp.", "datetime", "[precision]"),
  // Aggregates and analytics
  COUNT: s("Number of rows, or of non-NULL values.", "* | [DISTINCT] expr"),
  SUM: s("Sum.", "[DISTINCT] expr"),
  AVG: s("Average.", "[DISTINCT] expr"),
  MIN: s("Smallest value.", "expr"),
  MAX: s("Largest value.", "expr"),
  MEDIAN: s("Median.", "expr"),
  STDDEV: s("Sample standard deviation.", "expr"),
  VARIANCE: s("Sample variance.", "expr"),
  APPROXIMATE_COUNT_DISTINCT: s("Fast approximate count of distinct values.", "expr"),
  LISTAGG: s("Joins values into one string: LISTAGG(expr, sep) WITHIN GROUP (ORDER BY …).", "expr", "[delimiter]"),
  GROUP_CONCAT: s("Joins values into one string: GROUP_CONCAT([DISTINCT] expr [ORDER BY …] [SEPARATOR sep]).", "expr"),
  ROW_NUMBER: s("Row number within the window: ROW_NUMBER() OVER (…)."),
  RANK: s("Rank with gaps: RANK() OVER (ORDER BY …)."),
  DENSE_RANK: s("Rank without gaps: DENSE_RANK() OVER (ORDER BY …)."),
  NTILE: s("Bucket number, 1 to n: NTILE(n) OVER (ORDER BY …).", "n"),
  LAG: s("A value from an earlier row: LAG(expr, offset, default) OVER (…).", "expr", "[offset]", "[default]"),
  LEAD: s("A value from a later row: LEAD(expr, offset, default) OVER (…).", "expr", "[offset]", "[default]"),
  FIRST_VALUE: s("The first value in the window.", "expr"),
  LAST_VALUE: s("The last value in the window.", "expr"),
  PERCENTILE_CONT: s("Interpolated percentile: PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY expr).", "fraction"),
  PERCENTILE_DISC: s("Percentile from the values: PERCENTILE_DISC(0.9) WITHIN GROUP (ORDER BY expr).", "fraction"),
};

/** The label Monaco shows: `NAME(a, [b])`. */
export const signatureLabel = (name: string, sig: Signature) => `${name}(${sig.params.join(", ")})`;

/** Which parameter argument `arg` (0-based) fills; a repeating list stays on its last named one. */
export function activeParam(sig: Signature, arg: number): number {
  const last = sig.params.length - 1;
  if (last < 0) return 0;
  const dots = sig.params.indexOf("...");
  if (dots < 0) return Math.min(arg, last);
  const first = Math.max(0, dots - (sig.repeat ?? 1));
  return arg < first ? arg : first + ((arg - first) % (dots - first));
}

const isWordChar = (c: string | undefined) => !!c && /[\w$]/.test(c);

/** The unqualified function name ending right before `end`, upper case, or
 *  "" (none, or `s.f` / `s . f`: a schema's UDF, not a built-in). */
function calleeBefore(text: string, end: number): string {
  let j = end;
  while (j > 0 && /\s/.test(text[j - 1])) j--;
  const nameEnd = j;
  while (j > 0 && isWordChar(text[j - 1])) j--;
  const name = text.slice(j, nameEnd);
  if (!/^[A-Za-z_]/.test(name)) return "";
  while (j > 0 && /\s/.test(text[j - 1])) j--;
  return text[j - 1] === "." ? "" : name.toUpperCase();
}

/** Open calls at the end of `before`, outermost first; null when `before`
 *  ends inside a string, quoted name or comment. */
function openCalls(before: string): { name: string; arg: number }[] | null {
  const stack: { name: string; arg: number }[] = [];
  let i = 0;
  while (i < before.length) {
    const c = before[i];
    if (c === "'" || c === '"') {
      let j = i + 1;
      for (;;) {
        if (j >= before.length) return null;
        if (before[j] === c && before[j + 1] === c) j += 2;
        else if (before[j] === c) break;
        else j++;
      }
      i = j + 1;
      continue;
    }
    if (before.startsWith("--", i)) {
      const end = before.indexOf("\n", i);
      if (end < 0) return null;
      i = end + 1;
      continue;
    }
    if (before.startsWith("/*", i)) {
      const end = before.indexOf("*/", i + 2);
      if (end < 0) return null;
      i = end + 2;
      continue;
    }
    if (c === "(") {
      stack.push({ name: calleeBefore(before, i), arg: 0 });
    } else if (c === ")") {
      stack.pop();
    } else if (c === "," && stack.length) {
      stack[stack.length - 1].arg++;
    }
    i++;
  }
  return stack;
}

/** The innermost open call at the end of `before` (the statement up to the
 *  caret): its name, upper case, and which argument the caret is in. Null
 *  outside a call, inside a string or comment, or in a bare parenthesis. */
export function callAtCaret(before: string): { name: string; arg: number } | null {
  const top = openCalls(before)?.at(-1);
  return top?.name ? top : null;
}

/** Whether `before` ends in SQL code, not in a string, quoted name or comment. */
export const endsInCode = (before: string) => openCalls(before) !== null;

/** Markdown for hovering a function name. */
export function functionHover(name: string): string | null {
  const sig = SIGNATURES[name.toUpperCase()];
  return sig ? `\`${signatureLabel(name.toUpperCase(), sig)}\`\n\n${sig.doc}` : null;
}

/** End (0-based, exclusive) of the identifier at 0-based `col` in a line —
 *  a quoted one whole, quotes included — or -1 when there is none. */
export function identifierEndAt(line: string, col: number): number {
  const tok = new RegExp(String.raw`'(?:[^']|'')*'?|${IDENT}`, "g");
  let m: RegExpExecArray | null;
  while ((m = tok.exec(line)) && m.index <= col) {
    if (col < m.index + m[0].length) return m[0].startsWith("'") ? -1 : m.index + m[0].length;
  }
  return -1;
}

/** The table a statement ends on, when it ends in a table position (after
 *  FROM / JOIN / INTO / UPDATE / TABLE, or in a FROM list): a column that
 *  happens to share a table's name is not one. */
export function tableAtEnd(stmt: string): TableRef | null {
  const m = new RegExp(String.raw`(?:(${IDENT})\s*\.\s*)?(${IDENT})$`).exec(stmt);
  if (!m) return null;
  const head = stmt.slice(0, m.index);
  const ref = { schema: m[1] ? catalogName(m[1]) : "", table: catalogName(m[2]) };
  // A WITH query of that name shadows the table.
  if (!ref.schema && cteNames(stmt).has(ref.table)) return null;
  if (/\b(FROM|JOIN|INTO|UPDATE|TABLE)\s+$/i.test(head)) return ref;
  const listed = tableRefs(stmt).get(ref.table);
  return /,\s*$/.test(head) && listed?.schema === ref.schema ? ref : null;
}

/** The names a statement's WITH clause defines, in catalog spelling. */
export function cteNames(stmt: string): Set<string> {
  const names = new Set<string>();
  if (!/^\s*WITH\b/i.test(stmt)) return names;
  const def = new RegExp(String.raw`(?:^\s*WITH(?:\s+RECURSIVE)?|,)\s*(${IDENT})\s*(?:\([^)]*\))?\s+AS\s*\(`, "gi");
  for (const m of stmt.matchAll(def)) names.add(catalogName(m[1]));
  return names;
}

const COLUMNS_SHOWN = 25;

/** Markdown for hovering a table or view, from the loaded catalog. With no
 *  schema, the table must be unique across schemas to be named. */
export function tableHover(cat: SqlCatalog, schema: string | null, table: string): string | null {
  const hits: [string, { name: string; type: string }[]][] = [];
  for (const [s, tables] of cat.schemas) {
    if (schema && s !== schema) continue;
    const cols = tables.get(table);
    if (cols) hits.push([s, cols]);
  }
  if (hits.length !== 1) return null;
  const [s, cols] = hits[0];
  const head = `**${s}.${table}**`;
  if (!cols.length) return cat.loaded?.has(s) ? `${head}\n\nNo columns.` : head;
  const lines = cols.slice(0, COLUMNS_SHOWN).map((c) => `- \`${c.name}\` ${c.type}`);
  if (cols.length > COLUMNS_SHOWN) lines.push(`- … ${cols.length - COLUMNS_SHOWN} more`);
  return `${head} — ${cols.length} column${cols.length === 1 ? "" : "s"}\n\n${lines.join("\n")}`;
}
