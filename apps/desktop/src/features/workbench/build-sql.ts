import type { GraphLink } from "@/lib/ipc";
import { splitColKey, splitTableId } from "./visualizer/connection-graph.ts";

/**
 * The visual query builder's SQL — pure, so every quoting and join decision
 * is testable without the diagram. Identifiers are always quoted: Exasol folds
 * unquoted names to upper case, and a table created from a Parquet header
 * (`tpep_pickup_datetime`) is only reachable quoted. Tables are identified as
 * `SCHEMA.TABLE`, columns as `SCHEMA.TABLE.COLUMN`, so one query can span
 * schemas — including virtual ones.
 */
export type Aggregate = "COUNT" | "SUM" | "AVG" | "MIN" | "MAX";
export type JoinType = "INNER" | "LEFT";

export type BuildSqlInput = {
  /** `SCHEMA.TABLE.COLUMN` keys, in pick order. */
  picked: string[];
  /** Links between `SCHEMA.TABLE` ids. */
  links: GraphLink[];
  whereSql: string;
  orderKey: string | null;
  orderDir: "ASC" | "DESC";
  limit: number | null;
  /** Aggregate per picked key; the rest become the GROUP BY. */
  aggregates?: Record<string, Aggregate>;
  /** Join type per link (`source.sourceColumn>target.targetColumn`); INNER by default. */
  joinTypes?: Record<string, JoinType>;
};

export const linkKey = (l: GraphLink) => `${l.source}.${l.sourceColumn}>${l.target}.${l.targetColumn}`;
const q = (id: string) => `"${id}"`;
/** `SCHEMA.TABLE` → `"SCHEMA"."TABLE"` */
const qualifyTable = (id: string) => {
  const { schema, table } = splitTableId(id);
  return schema ? `${q(schema)}.${q(table)}` : q(table);
};
/** `SCHEMA.TABLE.COLUMN` → `"SCHEMA"."TABLE"."COLUMN"` */
const qualify = (key: string) => {
  const { table, column } = splitColKey(key);
  return `${qualifyTable(table)}.${q(column)}`;
};

export function buildSql(input: BuildSqlInput): string {
  const { picked, links, whereSql, orderKey, orderDir, limit } = input;
  const aggregates = input.aggregates ?? {};
  const joinTypes = input.joinTypes ?? {};
  if (picked.length === 0) return "-- Tick columns on the tables to build a query.";
  const involved: string[] = [];
  for (const k of picked) {
    const t = splitColKey(k).table;
    if (!involved.includes(t)) involved.push(t);
  }
  const base = involved[0];
  const included = new Set([base]);
  const joins: string[] = [];
  let progress = true;
  while (progress && included.size < involved.length) {
    progress = false;
    for (const t of involved) {
      if (included.has(t)) continue;
      const link = links.find((l) => (l.source === t && included.has(l.target)) || (l.target === t && included.has(l.source)));
      if (link) {
        const kind = joinTypes[linkKey(link)] === "LEFT" ? "LEFT JOIN" : "JOIN";
        joins.push(`${kind} ${qualifyTable(t)} ON ${qualifyTable(link.source)}.${q(link.sourceColumn)} = ${qualifyTable(link.target)}.${q(link.targetColumn)}`);
        included.add(t);
        progress = true;
      }
    }
  }
  for (const t of involved) {
    if (!included.has(t)) {
      joins.push(`CROSS JOIN ${qualifyTable(t)}`);
      included.add(t);
    }
  }
  const select = picked.map((k) => {
    const agg = aggregates[k];
    if (!agg) return qualify(k);
    const c = splitColKey(k).column;
    return `${agg}(${qualify(k)}) AS ${q(`${agg}_${c}`)}`;
  });
  const grouped = Object.keys(aggregates).some((k) => picked.includes(k)) ? picked.filter((k) => !aggregates[k]) : [];
  let sql = `SELECT\n  ${select.join(",\n  ")}\nFROM ${qualifyTable(base)}`;
  for (const j of joins) sql += `\n${j}`;
  if (whereSql && whereSql !== "(1 = 1)" && whereSql.trim()) sql += `\nWHERE ${whereSql}`;
  if (grouped.length) sql += `\nGROUP BY ${grouped.map(qualify).join(", ")}`;
  if (orderKey) {
    const agg = aggregates[orderKey];
    sql += `\nORDER BY ${agg ? `${agg}(${qualify(orderKey)})` : qualify(orderKey)} ${orderDir}`;
  }
  if (limit && limit > 0) sql += `\nLIMIT ${limit}`;
  return sql + ";";
}

/** The builder's statement with its LIMIT replaced by 100 — one statement, one `;`. */
export function previewSql(sql: string): string {
  return sql.trim().replace(/;\s*$/, "").replace(/\s*\bLIMIT\s+\d+\s*$/i, "") + "\nLIMIT 100;";
}
