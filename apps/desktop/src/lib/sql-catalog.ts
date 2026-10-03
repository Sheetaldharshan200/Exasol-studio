// The editor's picture of the connected database, loaded the cheap way: all
// table and view names at once, columns one schema at a time when completion
// first needs them. Refreshed after statements that change structure — not
// after every run, nor on a timer. Pure, so the loading rules are tested.

import type { SqlCatalog } from "./sql-completion.ts";
import { blind } from "./sql-classify.ts";
import { splitStatements } from "./sql-text.ts";

/** Most names loaded at once; past it the catalog is marked incomplete. */
export const NAMES_CAP = 50_000;

/** Every table and view (schema, name), system schemas excluded. */
export const NAMES_SQL =
  "SELECT TABLE_SCHEMA, TABLE_NAME FROM SYS.EXA_ALL_TABLES WHERE TABLE_SCHEMA NOT IN ('SYS','EXA_STATISTICS') " +
  "UNION ALL SELECT VIEW_SCHEMA, VIEW_NAME FROM SYS.EXA_ALL_VIEWS WHERE VIEW_SCHEMA NOT IN ('SYS','EXA_STATISTICS') " +
  `ORDER BY 1, 2 LIMIT ${NAMES_CAP + 1}`;

export const SCRIPTS_SQL = "SELECT SCRIPT_SCHEMA, SCRIPT_NAME, SCRIPT_LANGUAGE FROM SYS.EXA_ALL_SCRIPTS LIMIT 2000";

/** One schema's columns, in table and column order. */
export function columnsSql(schema: string): string {
  return (
    "SELECT COLUMN_TABLE, COLUMN_NAME, COLUMN_TYPE FROM SYS.EXA_ALL_COLUMNS " +
    `WHERE COLUMN_SCHEMA = '${schema.replace(/'/g, "''")}' ORDER BY COLUMN_TABLE, COLUMN_ORDINAL_POSITION`
  );
}

const str = (v: unknown) => String(v ?? "");

/** The catalog from the names query: every table known, no columns yet. */
export function catalogFromNames(rows: unknown[][], scripts: unknown[][]): SqlCatalog {
  const schemas = new Map<string, Map<string, { name: string; type: string }[]>>();
  for (const r of rows.slice(0, NAMES_CAP)) {
    const [schema, table] = [str(r[0]), str(r[1])];
    if (!schema || !table) continue;
    let tables = schemas.get(schema);
    if (!tables) schemas.set(schema, (tables = new Map()));
    tables.set(table, []);
  }
  return {
    schemas,
    scripts: scripts.map((r) => ({ schema: str(r[0]), name: str(r[1]), type: str(r[2]) || "SCRIPT" })),
    complete: rows.length <= NAMES_CAP,
    loaded: new Set(),
  };
}

/** A new catalog with one schema's columns filled in. */
export function withSchemaColumns(cat: SqlCatalog, schema: string, rows: unknown[][]): SqlCatalog {
  const tables = new Map(cat.schemas.get(schema) ?? []);
  const cols = new Map<string, { name: string; type: string }[]>();
  for (const r of rows) {
    const [table, name, type] = [str(r[0]), str(r[1]), str(r[2])];
    if (!table || !name) continue;
    let list = cols.get(table);
    if (!list) cols.set(table, (list = []));
    list.push({ name, type });
  }
  for (const [table, list] of cols) tables.set(table, list);
  const schemas = new Map(cat.schemas);
  schemas.set(schema, tables);
  return { ...cat, schemas, loaded: new Set([...(cat.loaded ?? []), schema]) };
}

/** Which schemas completion must load for these tables: the named schema,
 *  else every schema that has a table of that name (at most `max`). */
export function schemasToLoad(cat: SqlCatalog, refs: Iterable<{ schema: string; table: string }>, max = 3): string[] {
  const want = new Set<string>();
  for (const { schema, table } of refs) {
    if (schema) {
      const s = cat.schemas.has(schema) ? schema : schema.toUpperCase();
      if (cat.schemas.has(s)) want.add(s);
      continue;
    }
    for (const [s, tables] of cat.schemas) if (tables.has(table) || tables.has(table.toUpperCase())) want.add(s);
  }
  return [...want].filter((s) => !cat.loaded?.has(s)).slice(0, max);
}

const STRUCTURE = new Set(["CREATE", "DROP", "ALTER", "RENAME", "COMMENT", "EXECUTE", "IMPORT"]);

/** Whether a script may have changed the catalog (new, dropped, renamed or
 *  altered objects): only then is it reloaded. IMPORT can create a table;
 *  EXECUTE SCRIPT can do anything. */
export function changesCatalog(sql: string): boolean {
  return splitStatements(sql).some((s) => STRUCTURE.has(blind(s.text).split(/\s+/)[0]?.toUpperCase() ?? ""));
}
