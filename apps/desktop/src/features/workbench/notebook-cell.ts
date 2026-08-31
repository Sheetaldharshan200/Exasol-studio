// Pure decision logic for notebook cells — extracted so it can be tested
// without mounting the notebook.

/** Kinds rendered by the notebook's Recharts panel (ShadcnChartPanel). */
export const RECHARTS_KINDS = new Set(["bar", "hbar", "line", "area", "pie", "donut", "radar", "radial"]);
/** Kinds rendered by the lazy ECharts cell (buildChartOption). */
export const ECHARTS_KINDS = new Set(["scatter", "heatmap", "funnel", "treemap", "gauge"]);

export type CellConnection = { profileId: string; name: string };

/**
 * Which connection a SQL cell runs on: its own stored choice when that
 * connection is still open, the app's active connection when it has none —
 * and an explicit error (never a silent fallback) when the stored choice is
 * gone or nothing is connected.
 */
export function resolveCellConnection(
  cell: { connProfileId?: string; connName?: string },
  active: CellConnection | null,
  open: { id: string; name: string }[],
): { ok: true; conn: CellConnection } | { ok: false; error: string } {
  if (cell.connProfileId) {
    const hit = open.find((c) => c.id === cell.connProfileId);
    if (hit) return { ok: true, conn: { profileId: hit.id, name: hit.name } };
    return {
      ok: false,
      error: `“${cell.connName || cell.connProfileId}” is no longer connected — reconnect it or pick another database for this cell.`,
    };
  }
  if (active) return { ok: true, conn: active };
  return { ok: false, error: "Connect a database first (＋ above)." };
}

/** Which renderer a cell's chart kind uses. Unknown kinds fall back to the grid. */
export function cellRenderer(chart: string | undefined): "grid" | "kpi" | "recharts" | "echarts" {
  if (!chart || chart === "table") return "grid";
  if (chart === "kpi") return "kpi";
  if (RECHARTS_KINDS.has(chart)) return "recharts";
  if (ECHARTS_KINDS.has(chart)) return "echarts";
  return "grid";
}

/** The KPI tile's number: first numeric value of the first row, with its column name. */
export function kpiValue(columns: { name: string }[], rows: unknown[][]): { label: string; value: string } | null {
  const row = rows[0];
  if (!row) return null;
  for (let i = 0; i < row.length; i++) {
    const v = row[i];
    if (v === null || v === "") continue;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) {
      const value = Math.abs(n) >= 1000 ? n.toLocaleString("en-US") : String(n);
      return { label: columns[i]?.name ?? "", value };
    }
  }
  // No numeric column — show the first non-empty value verbatim.
  const i = row.findIndex((v) => v !== null && v !== "");
  return i >= 0 ? { label: columns[i]?.name ?? "", value: String(row[i]) } : null;
}
