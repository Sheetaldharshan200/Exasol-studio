// The slice of the catalog a model is shown.
//
// A real database has far more columns than belong in a prompt asked on every
// keystroke pause, so this takes a bounded, stable sample: whole tables in
// catalog order, stopping at a line budget. Whole tables rather than the first
// N columns, because half a table's columns is worse context than none —
// a model shown `ORDERS.ID` but not `ORDERS.TOTAL` invents the second.

export type ContextCatalog = {
  schemas: Map<string, Map<string, { name: string; type: string }[]>>;
};

/** How many `schema.table.column type` lines a prompt may carry. */
const MAX_LINES = 300;

export function schemaContextLines(catalog: ContextCatalog, maxLines = MAX_LINES): string {
  const out: string[] = [];
  for (const [schema, tables] of catalog.schemas) {
    for (const [table, cols] of tables) {
      // Adding this table would blow the budget: stop on a whole table
      // boundary rather than truncating one.
      if (out.length > 0 && out.length + cols.length > maxLines) return out.join("\n");
      for (const c of cols) out.push(`${schema}.${table}.${c.name} ${c.type}`);
      if (out.length >= maxLines) return out.slice(0, maxLines).join("\n");
    }
  }
  return out.join("\n");
}
