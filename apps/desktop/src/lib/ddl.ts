// The DDL tab's text: a table's CREATE TABLE with its distribution and
// partition keys and comments, or a view's own definition. Pure; the panel
// loads the extras with `ddlExtrasSql`.

import type { ColumnInfo, ConstraintInfo } from "./ipc.ts";
import { qualify, quoteIdent } from "./sql-ident.ts";

const literal = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** What the column list does not carry: partition key order and the comment. */
export type TableExtras = { comment?: string | null; partitionBy?: string[] };

export function tableDdl(schema: string | undefined, name: string, cols: ColumnInfo[], cons: ConstraintInfo[], extras: TableExtras = {}): string {
  const lines = cols.map((c) => {
    let l = `  ${quoteIdent(c.name)} ${c.dataType}`;
    // An identity column keeps numbering from its current value.
    if (c.identity !== null && c.identity !== undefined && c.identity !== "") l += ` IDENTITY ${c.identity}`;
    else if (c.default) l += ` DEFAULT ${c.default}`;
    if (c.nullable === false) l += " NOT NULL";
    if (c.comment) l += ` COMMENT IS ${literal(c.comment)}`;
    return l;
  });
  const keyList = (names: string[]) => names.map(quoteIdent).join(", ");
  const pk = cons.find((c) => c.constraintType === "PRIMARY KEY");
  if (pk) lines.push(`  CONSTRAINT ${quoteIdent(pk.name)} PRIMARY KEY (${keyList(pk.columns.map((c) => c.column))})`);
  for (const fk of cons.filter((c) => c.constraintType === "FOREIGN KEY")) {
    const ref = fk.columns[0];
    lines.push(
      `  CONSTRAINT ${quoteIdent(fk.name)} FOREIGN KEY (${keyList(fk.columns.map((c) => c.column))}) REFERENCES ${qualify(ref?.referencedSchema ?? undefined, ref?.referencedTable ?? "?")} (${keyList(fk.columns.map((c) => c.referencedColumn ?? "?"))})`,
    );
  }
  const dist = cols.filter((c) => c.isDistributionKey).map((c) => c.name);
  if (dist.length) lines.push(`  DISTRIBUTE BY ${keyList(dist)}`);
  if (extras.partitionBy?.length) lines.push(`  PARTITION BY ${keyList(extras.partitionBy)}`);
  const comment = extras.comment ? ` COMMENT IS ${literal(extras.comment)}` : "";
  return `CREATE TABLE ${qualify(schema, name)} (\n${lines.join(",\n")}\n)${comment};`;
}

/** A view's DDL: its stored text, which is the whole CREATE statement; a
 *  bare query (some versions keep only that) gets the CREATE in front. */
export function viewDdl(schema: string | undefined, name: string, text: string | null | undefined): string {
  const body = (text ?? "").trim().replace(/;\s*$/, "");
  if (!body) return `-- The definition of ${qualify(schema, name)} is not available.`;
  return /^CREATE\b/i.test(body) ? `${body};` : `CREATE OR REPLACE VIEW ${qualify(schema, name)} AS\n${body};`;
}

/** The query for what the DDL tab needs beyond the column list. */
export function ddlExtrasSql(kind: "table" | "view", schema: string, name: string): string {
  const s = literal(schema);
  const n = literal(name);
  if (kind === "view") return `SELECT VIEW_TEXT FROM SYS.EXA_ALL_VIEWS WHERE VIEW_SCHEMA = ${s} AND VIEW_NAME = ${n}`;
  return (
    `SELECT 'C', TABLE_COMMENT, NULL FROM SYS.EXA_ALL_TABLES WHERE TABLE_SCHEMA = ${s} AND TABLE_NAME = ${n}\n` +
    `UNION ALL SELECT 'P', COLUMN_NAME, COLUMN_PARTITION_KEY_ORDINAL_POSITION FROM SYS.EXA_ALL_COLUMNS ` +
    `WHERE COLUMN_SCHEMA = ${s} AND COLUMN_TABLE = ${n} AND COLUMN_PARTITION_KEY_ORDINAL_POSITION IS NOT NULL`
  );
}

/** The table extras from the rows of `ddlExtrasSql("table", …)`. */
export function tableExtrasFromRows(rows: unknown[][]): TableExtras {
  const comment = rows.find((r) => r[0] === "C")?.[1];
  const partitionBy = rows
    .filter((r) => r[0] === "P")
    .sort((a, b) => Number(a[2]) - Number(b[2]))
    .map((r) => String(r[1]));
  return { comment: typeof comment === "string" && comment ? comment : null, partitionBy };
}
