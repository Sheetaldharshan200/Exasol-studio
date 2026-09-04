// Pure cross-filter SQL wrapping — kept apart from the React store so it is
// unit-tested without importing react.

export type CrossFilter = { value: string; source: string };
export type CrossFilters = Record<string, CrossFilter>; // column (upper-case) → filter

/** Wrap a query so it also honors the active cross-filters, EXCLUDING the ones
 *  the given widget itself set (a chart doesn't filter itself). Returns the base
 *  query when nothing applies. */
export function applyCrossFilters(sql: string, cf: CrossFilters, widgetId: string): string {
  const conds = Object.entries(cf)
    .filter(([, f]) => f.source !== widgetId)
    .map(([col, f]) => `"${col}" = '${String(f.value).replace(/'/g, "''")}'`);
  if (!conds.length) return sql;
  return `SELECT * FROM (${sql}) "__cf" WHERE ${conds.join(" AND ")}`;
}
