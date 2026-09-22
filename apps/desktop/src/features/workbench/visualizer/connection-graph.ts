import type { GraphLink, GraphTable, SchemaGraph } from "@/lib/ipc";

/**
 * One canvas per connection: every schema is a dashed box, every table lives
 * in its box, and links may cross boxes. Table identity is `SCHEMA.TABLE`,
 * column keys `SCHEMA.TABLE.COLUMN` — the last dot always separates the column.
 */
export type ConnTable = GraphTable & { id: string; schema: string };
export type ConnGraph = { tables: ConnTable[]; links: GraphLink[] };

export const tableId = (schema: string, table: string) => `${schema}.${table}`;
export const colKey = (table: string, col: string) => `${table}.${col}`;

/** `SCHEMA.TABLE.COLUMN` → its table id and column (the column never has a dot). */
export function splitColKey(key: string): { table: string; column: string } {
  const i = key.lastIndexOf(".");
  return i < 0 ? { table: key, column: "" } : { table: key.slice(0, i), column: key.slice(i + 1) };
}
/** `SCHEMA.TABLE` → schema and table (the schema never has a dot). */
export function splitTableId(id: string): { schema: string; table: string } {
  const i = id.indexOf(".");
  return i < 0 ? { schema: "", table: id } : { schema: id.slice(0, i), table: id.slice(i + 1) };
}

/** Merge per-schema graphs into one; a schema's links point at ids inside it. */
export function mergeSchemaGraphs(parts: { schema: string; graph: SchemaGraph }[]): ConnGraph {
  const tables: ConnTable[] = [];
  const links: GraphLink[] = [];
  for (const { schema, graph } of parts) {
    for (const t of graph.tables) tables.push({ ...t, id: tableId(schema, t.name), schema });
    for (const l of graph.links) {
      // A declared FK may point into another schema; the graph says which.
      const { targetSchema, ...rest } = l;
      links.push({ ...rest, source: tableId(schema, l.source), target: tableId(targetSchema || schema, l.target) });
    }
  }
  return { tables, links };
}

export type Box = { x: number; y: number; width: number; height: number };
export type SchemaLayout = {
  /** The dashed group box, absolute. */
  groups: { schema: string; box: Box }[];
  /** Table positions RELATIVE to their group (React Flow parent coordinates). */
  tables: Record<string, { x: number; y: number }>;
  /** Absolute table positions, for framing and search. */
  absolute: Record<string, { x: number; y: number }>;
};

export const GROUP_HEADER = 44;
export const GROUP_PAD = 28;

/**
 * Lay every schema out as a grid of tables inside its own box, then place the
 * boxes left to right, wrapping into rows of `perRow`. Pure; sizes come from
 * `nodeWidth`/`nodeHeight` so the diagram's constants stay in one place.
 */
export function layoutSchemas(
  schemas: { schema: string; tables: ConnTable[] }[],
  nodeWidth: number,
  nodeHeight: (t: GraphTable) => number,
  options: { perRow?: number; gapX?: number; gapY?: number; groupGap?: number } = {},
): SchemaLayout {
  const gapX = options.gapX ?? 72;
  const gapY = options.gapY ?? 56;
  const groupGap = options.groupGap ?? 120;
  const perRow = options.perRow ?? 3;
  const groups: SchemaLayout["groups"] = [];
  const tables: SchemaLayout["tables"] = {};
  const absolute: SchemaLayout["absolute"] = {};
  const sized = schemas.map(({ schema, tables: list }) => {
    const cols = Math.max(1, Math.ceil(Math.sqrt(list.length)));
    const rowMax: number[] = [];
    list.forEach((t, i) => {
      const r = Math.floor(i / cols);
      rowMax[r] = Math.max(rowMax[r] ?? 0, nodeHeight(t));
    });
    const rowTop: number[] = [];
    let acc = 0;
    for (let r = 0; r < rowMax.length; r++) {
      rowTop[r] = acc;
      acc += rowMax[r] + gapY;
    }
    const usedCols = Math.min(cols, Math.max(1, list.length));
    const width = GROUP_PAD * 2 + usedCols * nodeWidth + (usedCols - 1) * gapX;
    const height = GROUP_HEADER + GROUP_PAD * 2 + Math.max(0, acc - gapY);
    const rel = list.map((t, i) => ({
      id: t.id,
      x: GROUP_PAD + (i % cols) * (nodeWidth + gapX),
      y: GROUP_HEADER + GROUP_PAD + rowTop[Math.floor(i / cols)],
    }));
    // An empty schema is a slim labelled box, not a hole in the canvas.
    const minHeight = list.length ? GROUP_HEADER + GROUP_PAD * 2 + 60 : GROUP_HEADER + 12;
    return { schema, width: Math.max(width, 260), height: Math.max(list.length ? height : 0, minHeight), rel };
  });
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  sized.forEach((g, i) => {
    if (i > 0 && i % perRow === 0) {
      x = 0;
      y += rowHeight + groupGap;
      rowHeight = 0;
    }
    groups.push({ schema: g.schema, box: { x, y, width: g.width, height: g.height } });
    for (const t of g.rel) {
      tables[t.id] = { x: t.x, y: t.y };
      absolute[t.id] = { x: x + t.x, y: y + t.y };
    }
    x += g.width + groupGap;
    rowHeight = Math.max(rowHeight, g.height);
  });
  return { groups, tables, absolute };
}

/**
 * The schemas a react-querybuilder group refers to, from field names shaped
 * `"SCHEMA"."TABLE"."COLUMN"` (the builder's field ids). Used to drop a WHERE
 * that names a schema the user just hid.
 */
export function whereSchemas(group: { rules: unknown[] }): string[] {
  const out = new Set<string>();
  const walk = (rules: unknown[]) => {
    for (const r of rules) {
      const rule = r as { field?: unknown; rules?: unknown[] };
      if (Array.isArray(rule.rules)) walk(rule.rules);
      else if (typeof rule.field === "string") {
        const m = /^"([^"]+)"\."/.exec(rule.field);
        if (m) out.add(m[1]);
      }
    }
  };
  walk(group.rules);
  return [...out];
}

/** Above this many links the canvas draws only what the user can read. */
export const MAX_EDGES = 400;

/**
 * A render budget for links, so a schema with a million relationships stays
 * a diagram and not a hang: under `max`, everything; over it, every declared
 * key plus every link touching the selected table — inferred links between
 * unselected tables wait until the user picks one. Returns what to draw and
 * how many were held back.
 */
export function budgetLinks<L extends { source: string; target: string; inferred?: boolean }>(
  links: L[],
  selectedTable: string | null,
  max = MAX_EDGES,
): { shown: L[]; hidden: number } {
  if (links.length <= max) return { shown: links, hidden: 0 };
  const shown = links.filter((l) => !l.inferred || l.source === selectedTable || l.target === selectedTable);
  return { shown: shown.length <= max ? shown : shown.slice(0, max), hidden: links.length - Math.min(shown.length, max) };
}
