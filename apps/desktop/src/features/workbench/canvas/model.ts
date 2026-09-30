// The canvas document and every decision about it that needs no DOM.
//
// Borrowed from Panorama and adapted: every box is a real result set — a
// stored table, a SQL step on other boxes, or a chart on one — and every
// arrow says where a box came from. Arrows are derived from the boxes'
// `source` fields, so they can never disagree with them.

import type { ColumnMeta } from "@/lib/ipc";
import type { CellViz } from "@/features/workbench/notebook-cell";

export type Rect = { x: number; y: number; w: number; h: number };

type Common = { id: string; profileId: string; connectionName: string; rect: Rect };
export type TableBox = Common & { kind: "table"; schema: string; table: string; rowCount?: number };
export type QueryBox = Common & {
  kind: "query";
  name: string;
  sql: string;
  /** Boxes this step reads: one → `derived_table`; several → `source_1`, `source_2`, … */
  sources: string[];
  /** Set when the step was opened as the rows behind a chart selection. */
  rowsBehind?: boolean;
};
export type ChartBox = Common & { kind: "chart"; name: string; source: string; chart: string; viz: CellViz };
export type Box = TableBox | QueryBox | ChartBox;

export type CanvasDoc = { version: 1; boxes: Box[] };

export const EMPTY_DOC: CanvasDoc = { version: 1, boxes: [] };

/** Default sizes, in canvas units. */
export const SIZES: Record<Box["kind"], { w: number; h: number }> = {
  table: { w: 560, h: 380 },
  query: { w: 600, h: 440 },
  chart: { w: 560, h: 380 },
};
/** Space kept between boxes. */
export const GAP = 48;

export type ArrowKind = "sql" | "chart" | "rows";
export type Arrow = { id: string; from: string; to: string; kind: ArrowKind };

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** An Exasol identifier, quoted and escaped, exactly as the catalog names it. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function qualified(schema: string, table: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`;
}

/** A SQL literal for a filter value. */
export function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return `'${String(v).replace(/'/g, "''")}'`;
}

export function boxTitle(box: Box): string {
  return box.kind === "table" ? `${box.schema}.${box.table}` : box.name;
}

/** The placeholder a step uses for its i-th source. */
export function sourcePlaceholder(index: number, total: number): string {
  return total === 1 ? "derived_table" : `source_${index + 1}`;
}

export function seedSql(sourceCount: number): string {
  return sourceCount <= 1 ? "SELECT * FROM derived_table" : "SELECT *\nFROM source_1\nJOIN source_2 ON /* column */ TRUE";
}

export function overlaps(a: Rect, b: Rect, margin = 0): boolean {
  return a.x < b.x + b.w + margin && a.x + a.w + margin > b.x && a.y < b.y + b.h + margin && a.y + a.h + margin > b.y;
}

function free(boxes: readonly Box[], rect: Rect): boolean {
  return boxes.every((b) => !overlaps(rect, b.rect, GAP / 2));
}

/**
 * Where a new box goes. With an anchor (the box it was made from): flush
 * right of it, then below it, then further right — a derivation reads
 * left-to-right. Without one (opened from the explorer): the first free slot
 * in reading order across the viewport, then the next row. Never overlapping.
 */
export function placeBox(boxes: readonly Box[], size: { w: number; h: number }, opts: { anchor?: Rect; viewport?: Rect } = {}): { x: number; y: number } {
  const { anchor, viewport } = opts;
  if (anchor) {
    const tries: { x: number; y: number }[] = [];
    for (let k = 1; k <= 6; k++) {
      tries.push({ x: anchor.x + k * (anchor.w + GAP), y: anchor.y });
      tries.push({ x: anchor.x, y: anchor.y + k * (anchor.h + GAP) });
    }
    for (const t of tries) if (free(boxes, { ...t, ...size })) return t;
  }
  const origin = viewport ? { x: viewport.x + GAP, y: viewport.y + GAP } : { x: GAP, y: GAP };
  const rowWidth = Math.max(viewport?.w ?? 0, size.w * 3 + GAP * 4);
  for (let row = 0; row < 200; row++) {
    const y = origin.y + row * (size.h + GAP);
    for (let x = origin.x; x + size.w <= origin.x + rowWidth; x += size.w + GAP) {
      if (free(boxes, { x, y, ...size })) return { x, y };
    }
  }
  const bottom = boxes.reduce((m, b) => Math.max(m, b.rect.y + b.rect.h), origin.y);
  return { x: origin.x, y: bottom + GAP };
}

/** The arrows the boxes imply. */
export function arrowsOf(doc: CanvasDoc): Arrow[] {
  const ids = new Set(doc.boxes.map((b) => b.id));
  const out: Arrow[] = [];
  for (const b of doc.boxes) {
    if (b.kind === "query") {
      for (const s of b.sources) if (ids.has(s)) out.push({ id: `${s}->${b.id}`, from: s, to: b.id, kind: b.rowsBehind ? "rows" : "sql" });
    } else if (b.kind === "chart" && ids.has(b.source)) {
      out.push({ id: `${b.source}->${b.id}`, from: b.source, to: b.id, kind: "chart" });
    }
  }
  return out;
}

/** Ids of the boxes built on `id`, transitively, nearest first. */
export function dependantsOf(doc: CanvasDoc, id: string): string[] {
  const arrows = arrowsOf(doc);
  const out: string[] = [];
  const queue = [id];
  const seen = new Set<string>([id]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const a of arrows) {
      if (a.from === cur && !seen.has(a.to)) {
        seen.add(a.to);
        out.push(a.to);
        queue.push(a.to);
      }
    }
  }
  return out;
}

/** The box and everything it was built from — the trail a selection lights up. */
export function upstreamOf(doc: CanvasDoc, id: string): Set<string> {
  const boxes = byId(doc);
  const out = new Set<string>();
  const walk = (cur: string) => {
    if (out.has(cur)) return;
    const b = boxes.get(cur);
    if (!b) return;
    out.add(cur);
    if (b.kind === "query") b.sources.forEach(walk);
    else if (b.kind === "chart") walk(b.source);
  };
  walk(id);
  return out;
}

export function byId(doc: CanvasDoc): Map<string, Box> {
  return new Map(doc.boxes.map((b) => [b.id, b]));
}

/** The box a chart or step reads its rows from; charts read through to it. */
export function dataSourceOf(box: Box, boxes: Map<string, Box>): TableBox | QueryBox | null {
  if (box.kind !== "chart") return box;
  const src = boxes.get(box.source);
  return src ? dataSourceOf(src, boxes) : null;
}

function cteName(id: string): string {
  return `cte_${id.replace(/[^A-Za-z0-9_]/g, "_")}`;
}

function replaceWord(sql: string, word: string, by: string): string {
  return sql.replace(new RegExp(`\\b${word}\\b`, "gi"), by);
}

/**
 * One statement for a box: a table is its own name; a step's placeholders
 * become the name of what they read — a table directly, another step as a
 * CTE, flattened so every upstream step appears once, in dependency order.
 */
export function compileSql(box: Box, boxes: Map<string, Box>): string {
  const { ctes, body } = compileParts(box, boxes);
  return ctes ? `${ctes}\n${body}` : body;
}

/**
 * The same statement, one page of rows at a time. The page wraps the final
 * body so a step's own LIMIT or ORDER BY is left alone; the CTEs stay at the
 * top, which is the one place Exasol takes them.
 */
export function compilePagedSql(box: Box, boxes: Map<string, Box>, limit: number, offset: number): string {
  const { ctes, body, plain } = compileParts(box, boxes);
  const page = offset > 0 ? `LIMIT ${limit} OFFSET ${offset}` : `LIMIT ${limit}`;
  if (plain) return `${body}\n${page}`;
  const wrapped = `SELECT * FROM (\n${body}\n) AS step_rows\n${page}`;
  return ctes ? `${ctes}\n${wrapped}` : wrapped;
}

/** `ctes` is the WITH clause (empty when none); `plain` marks a bare table read. */
export function compileParts(box: Box, boxes: Map<string, Box>): { ctes: string; body: string; plain: boolean } {
  if (box.kind === "chart") {
    const src = boxes.get(box.source);
    if (!src) throw new Error(`The chart's source is gone.`);
    return compileParts(src, boxes);
  }
  if (box.kind === "table") return { ctes: "", body: `SELECT * FROM ${qualified(box.schema, box.table)}`, plain: true };
  const ctes: { name: string; sql: string }[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const bodyOf = (q: QueryBox): string => {
    let sql = q.sql.trim().replace(/;\s*$/, "");
    q.sources.forEach((sid, i) => {
      const src = boxes.get(sid);
      if (!src) throw new Error(`Source ${i + 1} of "${q.name}" is gone.`);
      const placeholder = sourcePlaceholder(i, q.sources.length);
      if (src.kind === "table") {
        sql = replaceWord(sql, placeholder, qualified(src.schema, src.table));
      } else {
        const step = src.kind === "query" ? src : dataSourceOf(src, boxes);
        if (!step || step.kind !== "query") throw new Error(`Source ${i + 1} of "${q.name}" has no rows.`);
        visit(step);
        sql = replaceWord(sql, placeholder, cteName(step.id));
      }
    });
    return sql;
  };
  const visit = (q: QueryBox) => {
    if (done.has(q.id)) return;
    if (visiting.has(q.id)) throw new Error(`"${q.name}" is built on itself.`);
    visiting.add(q.id);
    const body = bodyOf(q);
    visiting.delete(q.id);
    done.add(q.id);
    ctes.push({ name: cteName(q.id), sql: body });
  };
  const body = bodyOf(box);
  return { ctes: ctes.length ? `WITH ${ctes.map((c) => `${c.name} AS (\n${c.sql}\n)`).join(",\n")}` : "", body, plain: false };
}

export type LineageStep =
  | { kind: "table"; label: string }
  | { kind: "query"; label: string; sql: string; rowsBehind: boolean }
  | { kind: "chart"; label: string; chart: string; by?: string; measures: string[] };

/** How a box came to be, from its roots down to the box itself. */
export function lineage(boxId: string, boxes: Map<string, Box>): LineageStep[] {
  const out: LineageStep[] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const b = boxes.get(id);
    if (!b) return;
    if (b.kind === "table") out.push({ kind: "table", label: boxTitle(b) });
    else if (b.kind === "query") {
      b.sources.forEach(walk);
      out.push({ kind: "query", label: b.name, sql: b.sql, rowsBehind: !!b.rowsBehind });
    } else {
      walk(b.source);
      out.push({ kind: "chart", label: b.name, chart: b.chart, by: b.viz.xField, measures: b.viz.yFields ?? [] });
    }
  };
  walk(boxId);
  return out;
}

/** The step that shows the rows behind a chart selection. */
export function rowsBehindSql(field: string, values: readonly unknown[]): string {
  const nonNull = values.filter((v) => v !== null && v !== undefined);
  const parts: string[] = [];
  if (nonNull.length) parts.push(`${quoteIdent(field)} IN (${nonNull.map(sqlLiteral).join(", ")})`);
  if (nonNull.length !== values.length) parts.push(`${quoteIdent(field)} IS NULL`);
  return `SELECT * FROM derived_table\nWHERE ${parts.join(" OR ") || "FALSE"}`;
}

const NUMERIC = /^(DECIMAL|DOUBLE|INTEGER|BIGINT|SMALLINT|TINYINT|NUMERIC|FLOAT|REAL|NUMBER)/i;

export function isNumericType(typeName: string): boolean {
  return NUMERIC.test(typeName.trim());
}

/** A first chart for a result: the first text-like column by, up to three measures. */
export function suggestViz(columns: readonly ColumnMeta[]): { chart: string; viz: CellViz } {
  const numeric = columns.filter((c) => isNumericType(c.typeName)).map((c) => c.name);
  const xField = columns.find((c) => !isNumericType(c.typeName))?.name ?? columns[0]?.name;
  const yFields = numeric.filter((n) => n !== xField).slice(0, 3);
  return { chart: "bar", viz: { xField, yFields: yFields.length ? yFields : columns.slice(1, 2).map((c) => c.name) } };
}
