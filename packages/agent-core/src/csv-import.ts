/**
 * Structured CSV → Exasol table loading. The agent's document tools read files
 * for RAG; this is the OTHER path — turning an uploaded delimited file into a
 * real table (infer columns, CREATE, bulk INSERT). Kept dependency-free: a
 * small RFC-4180-ish parser, conservative type inference, and literal-batched
 * inserts through the shared driver.
 */

export type CsvTable = {
  delimiter: string;
  header: string[];
  rows: string[][];
};

const DELIMITERS = [",", ";", "\t", "|"];

/** Pick the delimiter that yields the most consistent column count on line 1. */
function detectDelimiter(firstLine: string): string {
  let best = ",";
  let bestCount = 0;
  for (const d of DELIMITERS) {
    // Count only delimiters outside quotes.
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i++) {
      const c = firstLine[i];
      if (c === '"') inQuotes = !inQuotes;
      else if (c === d && !inQuotes) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/** Parse delimited text with double-quote escaping and quoted newlines. */
export function parseCsv(text: string): CsvTable {
  const clean = text.replace(/^﻿/, ""); // strip BOM
  const firstLineEnd = clean.search(/\r?\n/);
  const firstLine = firstLineEnd === -1 ? clean : clean.slice(0, firstLineEnd);
  const delimiter = detectDelimiter(firstLine);

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      // Skip fully-empty lines.
      if (!(record.length === 1 && record[0] === "")) records.push(record);
      record = [];
    } else {
      field += c;
    }
  }
  if (field.length || record.length) {
    record.push(field);
    if (!(record.length === 1 && record[0] === "")) records.push(record);
  }

  const header = (records.shift() ?? []).map((h) => h.trim());
  return { delimiter, header, rows: records };
}

/**
 * Decide whether the first row is a header or already data. Messy exports often
 * ship without one. Heuristic: a header row is mostly non-empty, non-numeric,
 * distinct text cells. If it looks like values, we synthesize COL_1..N and keep
 * the first row as data.
 */
export function resolveHeader(csv: CsvTable): { header: string[]; rows: string[][] } {
  const first = csv.header;
  const width = Math.max(first.length, ...csv.rows.slice(0, 5).map((r) => r.length), 1);
  const nonEmpty = first.filter((c) => c.trim() !== "");
  const numericish = first.filter((c) => /^-?\d+(\.\d+)?$/.test(c.trim())).length;
  const distinct = new Set(first.map((c) => c.trim().toUpperCase())).size;
  const looksLikeHeader =
    nonEmpty.length >= Math.ceil(first.length * 0.6) &&
    numericish <= first.length * 0.3 &&
    distinct === first.length &&
    first.length > 0;
  if (looksLikeHeader) return { header: first, rows: csv.rows };
  const synth = Array.from({ length: width }, (_, i) => `COL_${i + 1}`);
  return { header: synth, rows: [first, ...csv.rows] };
}

/** Turn a header cell into a safe, UPPERCASE Exasol identifier; dedupe blanks. */
export function normalizeColumns(header: string[]): string[] {
  const used = new Set<string>();
  return header.map((h, i) => {
    let name = h
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!name || /^[0-9]/.test(name)) name = `COL_${name || i + 1}`;
    let out = name;
    let n = 2;
    while (used.has(out)) out = `${name}_${n++}`;
    used.add(out);
    return out;
  });
}

const INT_RE = /^-?\d{1,18}$/;
const DEC_RE = /^-?\d+\.\d+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TS_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/;
const BOOL_RE = /^(true|false)$/i;

/**
 * Shape AND calendar validity. The regexes above only check shape, so they
 * happily accept "2024-99-99" or "2024-02-30" — which would infer a DATE column
 * and then fail at INSERT time, or (worse) be silently NULLed. Round-tripping
 * through Date catches month/day overflow, including non-leap-year Feb 29.
 */
function isCalendarDate(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isCalendarTimestamp(v: string): boolean {
  if (!TS_RE.test(v)) return false;
  const [datePart, timePart] = v.split(/[ T]/);
  if (!isCalendarDate(datePart)) return false;
  const [hh, mm, ss] = timePart.split(":").map(Number);
  return hh <= 23 && mm <= 59 && Math.floor(ss) <= 59;
}

export type ColType =
  | { kind: "decimal"; precision: number; scale: number }
  | { kind: "date" }
  | { kind: "timestamp" }
  | { kind: "boolean" }
  | { kind: "varchar"; size: number };

/** Infer a conservative Exasol type from a column's sampled values. */
export function inferType(values: string[]): ColType {
  const seen = values.map((v) => v.trim()).filter((v) => v !== "");
  if (!seen.length) return { kind: "varchar", size: 100 };

  if (seen.every((v) => BOOL_RE.test(v))) return { kind: "boolean" };
  // Calendar-validated, not just shape-matched: a column containing
  // "2024-99-99" must NOT become a DATE, or cellToLiteral would NULL that value
  // and the data would vanish. Such a column stays VARCHAR and round-trips.
  if (seen.every(isCalendarTimestamp)) return { kind: "timestamp" };
  if (seen.every(isCalendarDate)) return { kind: "date" };

  if (seen.every((v) => INT_RE.test(v))) {
    // Loop, never spread: Math.max(...600k values) overflows the call stack.
    let digits = 1;
    for (const v of seen) digits = Math.max(digits, v.replace("-", "").length);
    return { kind: "decimal", precision: Math.min(36, digits), scale: 0 };
  }
  if (seen.every((v) => INT_RE.test(v) || DEC_RE.test(v))) {
    let intDigits = 1;
    let scale = 0;
    for (const v of seen) {
      const [ip, fp = ""] = v.replace("-", "").split(".");
      intDigits = Math.max(intDigits, ip.length);
      scale = Math.max(scale, fp.length);
    }
    scale = Math.min(scale, 20);
    const precision = Math.min(36, intDigits + scale);
    return { kind: "decimal", precision: Math.max(precision, scale + 1), scale };
  }

  let maxLen = 1;
  for (const v of seen) maxLen = Math.max(maxLen, v.length);
  // Round up with headroom; Exasol VARCHAR max is 2,000,000.
  const size = Math.min(2_000_000, Math.max(20, Math.ceil((maxLen * 1.5) / 10) * 10));
  return { kind: "varchar", size };
}

export function typeToSql(t: ColType): string {
  switch (t.kind) {
    case "decimal":
      return t.scale > 0 ? `DECIMAL(${t.precision},${t.scale})` : `DECIMAL(${t.precision},0)`;
    case "date":
      return "DATE";
    case "timestamp":
      return "TIMESTAMP";
    case "boolean":
      return "BOOLEAN";
    case "varchar":
      return `VARCHAR(${t.size})`;
  }
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function litStr(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Render one CSV cell as an Exasol SQL literal for its inferred column type.
 *
 * VARCHAR values are emitted in FULL, even when longer than the inferred column
 * size. This used to `slice()` them to fit, which silently corrupted data: type
 * inference samples at most `sampleSize` rows (500k by default), so a long value
 * beyond the sample got quietly cut with no error anywhere. Now the oversized
 * literal reaches Exasol, which rejects it with a clear error, and the caller's
 * per-row retry path reports exactly which row was too wide. A visible failure
 * is recoverable; silent truncation is not.
 */
export function cellToLiteral(raw: string, t: ColType): string {
  const v = raw.trim();
  if (v === "") return "NULL";
  switch (t.kind) {
    case "decimal":
      return INT_RE.test(v) || DEC_RE.test(v) ? v : "NULL";
    case "boolean":
      return BOOL_RE.test(v) ? v.toUpperCase() : "NULL";
    case "date":
      return isCalendarDate(v) ? `DATE ${litStr(v)}` : "NULL";
    case "timestamp":
      return isCalendarTimestamp(v) ? `TIMESTAMP ${litStr(v.replace("T", " "))}` : "NULL";
    case "varchar":
      return litStr(v);
  }
}

export type ImportPlan = {
  schema: string;
  table: string;
  columns: { name: string; type: ColType }[];
  /** Data rows AFTER header resolution (may include the original first row). */
  rows: string[][];
  rowCount: number;
  createSchemaSql: string;
  dropSql: string | null;
  createTableSql: string;
};

/** Build the DDL + column plan for a parsed CSV (no INSERTs yet). */
export function buildPlan(
  csv: CsvTable,
  schemaName: string,
  tableName: string,
  opts: { replace?: boolean; sampleSize?: number; assumeHeader?: boolean } = {},
): ImportPlan {
  const schema = schemaName.toUpperCase();
  const table = tableName.toUpperCase();
  // Parquet/JSON carry real field names — trust them; only CSV needs sniffing.
  const { header, rows } = opts.assumeHeader ? { header: csv.header, rows: csv.rows } : resolveHeader(csv);
  const names = normalizeColumns(header);
  // Infer from ALL rows by default (capped for pathological files): sampling
  // the head under-sizes types on sorted data — e.g. customer.csv sorted by
  // custkey inferred DECIMAL(3,0) and every key ≥ 1000 was then "malformed".
  const sample = rows.slice(0, opts.sampleSize ?? 500_000);
  const columns = names.map((name, i) => ({
    name,
    type: inferType(sample.map((r) => r[i] ?? "")),
  }));
  const cols = columns.map((c) => `  ${quoteIdent(c.name)} ${typeToSql(c.type)}`).join(",\n");
  const fq = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  return {
    schema,
    table,
    columns,
    rows,
    rowCount: rows.length,
    createSchemaSql: `CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)}`,
    dropSql: opts.replace ? `DROP TABLE IF EXISTS ${fq}` : null,
    createTableSql: `CREATE TABLE IF NOT EXISTS ${fq} (\n${cols}\n)`,
  };
}

/** One parquet/JSON cell value → the string form the CSV pipeline expects. */
function valueToCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    return v.toISOString().replace("T", " ").replace(/\.\d+Z$/, "").replace(/Z$/, "");
  }
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") {
    // A NESTED bigint (common in Parquet: {id: 1n}) makes a bare
    // JSON.stringify throw "Do not know how to serialize a BigInt", which
    // aborted the whole import. Serialize them as strings instead.
    return JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val));
  }
  return String(v);
}

/**
 * Turn row objects (from Parquet or JSON) into the same string-matrix shape the
 * CSV path uses, so type inference / DDL / inserts are one shared code path.
 * Columns are the union of all keys (row order preserved by first appearance).
 */
export function objectsToTable(objs: Record<string, unknown>[]): CsvTable {
  const header: string[] = [];
  const seen = new Set<string>();
  for (const o of objs) {
    for (const k of Object.keys(o)) {
      if (!seen.has(k)) {
        seen.add(k);
        header.push(k);
      }
    }
  }
  const rows = objs.map((o) => header.map((k) => valueToCell(o[k])));
  return { delimiter: ",", header, rows };
}

/**
 * Build ONE multi-row INSERT for the given rows (used per-batch and per-row).
 *
 * Throws on an empty batch rather than emitting `INSERT … VALUES` with no
 * tuples, which is not valid SQL. Callers batch non-empty slices, so this is a
 * contract guard, not a reachable path.
 */
export function buildInsert(plan: ImportPlan, rows: string[][]): string {
  if (!rows.length) throw new Error("buildInsert: refusing to build an INSERT with no rows");
  const fq = `${quoteIdent(plan.schema)}.${quoteIdent(plan.table)}`;
  const colList = plan.columns.map((c) => quoteIdent(c.name)).join(", ");
  const values = rows
    .map((row) => "(" + plan.columns.map((c, j) => cellToLiteral(row[j] ?? "", c.type)).join(", ") + ")")
    .join(",\n");
  return `INSERT INTO ${fq} (${colList}) VALUES\n${values}`;
}
