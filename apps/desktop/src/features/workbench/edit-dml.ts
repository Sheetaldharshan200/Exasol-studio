// The SQL an edited results grid would run. Pure: given the result, the
// table's identity and what the user staged, it returns the statements. The
// grid does the DOM; this decides the writes, so the writes can be tested.

import { isWritten, type Draft } from "./edit-grid-model.ts";

export type DmlColumn = { name: string; typeName: string };

export type DmlInput = {
  schema?: string;
  table: string;
  columns: readonly DmlColumn[];
  rows: readonly (readonly unknown[])[];
  /** Columns that identify a row: the primary key, or every column when the
   *  table has none (common in Exasol). */
  identity: readonly string[];
  /** The table's real column identifiers, in the case the catalog stores.
   *  Result metadata can report a different case than the table uses. */
  catalogColumns?: readonly string[];
  /** rowIndex -> colIndex -> new value. */
  edits: Record<number, Record<number, string>>;
  deleted: ReadonlySet<number>;
  inserts: readonly { values: Draft }[];
};

function isNumericType(typeName: string): boolean {
  return /DECIMAL|INT|DOUBLE|NUMBER|FLOAT|BIGINT|SMALLINT/i.test(typeName);
}

/** A SQL literal for a value, given its column type. Empty and null are NULL. */
export function lit(v: unknown, typeName: string): string {
  if (v === null || v === undefined || v === "") return "NULL";
  const s = String(v);
  if (isNumericType(typeName) && /^-?\d+(\.\d+)?$/.test(s)) return s;
  if (/BOOL/i.test(typeName) && /^(true|false)$/i.test(s)) return s.toUpperCase();
  return `'${s.replace(/'/g, "''")}'`;
}

export function qualify(schema: string | undefined, table: string): string {
  return schema ? `"${schema}"."${table}"` : `"${table}"`;
}

/** UPDATEs, then DELETEs, then INSERTs — in that order, so a staged row that
 *  replaces a deleted one lands after the delete. */
export function buildDml(input: DmlInput): string[] {
  const { columns, rows, identity, edits, deleted, inserts } = input;
  const t = qualify(input.schema, input.table);
  const colId = (name: string): string =>
    (input.catalogColumns ?? []).find((c) => c.toLowerCase() === name.toLowerCase()) ?? name;
  const idIdx = identity.map((n) => columns.findIndex((c) => c.name === n));
  const where = (row: readonly unknown[]): string =>
    identity
      .map((name, i) => `"${colId(name)}" = ${lit(row[idIdx[i]], columns[idIdx[i]]?.typeName ?? "")}`)
      .join(" AND ");

  const out: string[] = [];
  for (const [rStr, cols] of Object.entries(edits)) {
    const r = Number(rStr);
    if (deleted.has(r) || !rows[r]) continue;
    const sets = Object.entries(cols)
      .map(([cStr, val]) => {
        const c = Number(cStr);
        return `"${colId(columns[c].name)}" = ${lit(val, columns[c].typeName)}`;
      })
      .join(", ");
    if (sets) out.push(`UPDATE ${t} SET ${sets} WHERE ${where(rows[r])};`);
  }
  for (const r of deleted) {
    if (rows[r]) out.push(`DELETE FROM ${t} WHERE ${where(rows[r])};`);
  }
  for (const { values } of inserts) {
    const cols = columns.filter((c) => isWritten(values[c.name]));
    // A staged row with nothing filled in is a row of defaults — an explicit
    // statement, not a silent no-op that leaves Save looking broken.
    if (!cols.length) {
      out.push(`INSERT INTO ${t} DEFAULT VALUES;`);
      continue;
    }
    const names = cols.map((c) => `"${colId(c.name)}"`).join(", ");
    const vals = cols.map((c) => lit(values[c.name], c.typeName)).join(", ");
    out.push(`INSERT INTO ${t} (${names}) VALUES (${vals});`);
  }
  return out;
}
