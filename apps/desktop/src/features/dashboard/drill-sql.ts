// Pure drill-down query rewriting. A drillable chart is configured with a column
// hierarchy (e.g. YEAR → QUARTER → MONTH) and a measure to aggregate. At drill
// level i, the base query is re-aggregated by the level-i column, filtered to the
// path chosen so far (clicking YEAR=2024 then grouping by QUARTER, etc.). Kept
// pure so it is unit-tested without a database.

export type DrillStep = { col: string; value: string };
export type DrillState = { level: number; path: DrillStep[] };

const esc = (v: string) => v.replace(/'/g, "''");
const q = (id: string) => `"${id.toUpperCase()}"`;

/** Re-aggregate `base` at the current drill level, filtered to the drilled path.
 *  Returns `base` unchanged when drilling isn't configured. */
export function drillSql(base: string, drill: string[], measure: string, st: DrillState): string {
  if (!drill.length || !measure) return base;
  const level = Math.min(Math.max(0, st.level), drill.length - 1);
  const col = q(drill[level]);
  const m = q(measure);
  const where = st.path.map((p) => `${q(p.col)} = '${esc(p.value)}'`).join(" AND ");
  return `SELECT ${col}, SUM(${m}) AS ${m} FROM (${base}) "__drill"${where ? ` WHERE ${where}` : ""} GROUP BY ${col} ORDER BY 1`;
}
