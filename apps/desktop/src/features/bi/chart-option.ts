import type { DashPanel } from "@/lib/agent-client";
import type { StatementResult } from "@/lib/ipc";

// Pure ECharts option builder for query results — extracted from the retired
// Dashboards view so the Notebook's chart cells (and tests) can use it.

export const CHART_PALETTE = ["#5fc33b", "#4fa823", "#8ed16f", "#2f7d14", "#b5e3a1", "#1f5c0d", "#d3efc7"];

/** Chart kinds that have no cartesian axes. */
export const AXISLESS = new Set(["pie", "donut", "funnel", "radar", "treemap", "gauge"]);

export type EchartsViz = Extract<DashPanel["viz"], { type: "echarts" }>;

/**
 * Build the ECharts option for a query result. `primary` replaces the chart;
 * `override` (the human/agent viz.option) deep-merges on top via a second
 * setOption. Returns null for an empty result.
 */
export function buildChartOption(
  viz: EchartsViz,
  result: StatementResult,
  theme?: { fg: string; border: string },
): { primary: Record<string, unknown>; override?: Record<string, unknown> } | null {
  const cols = result.columns.map((c) => c.name);
  if (!result.rows.length) return null;
  const styles = typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const fg = theme?.fg ?? (styles?.getPropertyValue("--muted-foreground").trim() || "#888");
  const border = theme?.border ?? (styles?.getPropertyValue("--border").trim() || "#333");
  // FULL ECharts mode: a custom option with its own `series` takes over
  // completely — we inject the query result as dataset.source so any
  // series type (heatmap, funnel, gauge, radar, sankey, candlestick…)
  // can reference it. Everything ECharts can do, a panel can do.
  const custom = viz.option as { series?: unknown } | undefined;
  if (custom?.series) {
    return {
      primary: {
        color: CHART_PALETTE,
        tooltip: {},
        textStyle: { color: fg },
        dataset: { source: [cols, ...result.rows] },
        ...custom,
      },
    };
  }
  // Values come back as strings from the query layer — coerce, don't
  // typeof-check, or every series comes out empty (blank chart).
  const num = (v: unknown): number | null => {
    if (v === null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const isNumCol = (i: number) => {
    let seen = 0;
    for (const r of result.rows) {
      if (r[i] === null || r[i] === "") continue;
      if (num(r[i]) === null) return false;
      seen++;
    }
    return seen > 0;
  };
  // X axis = the explicit field, else the first NON-numeric column, else col 0.
  const xIdx = viz.xField
    ? Math.max(cols.indexOf(viz.xField.toUpperCase()), 0)
    : Math.max(cols.findIndex((_, i) => !isNumCol(i)), 0);
  const yIdxs = viz.yFields?.length
    ? viz.yFields.map((f) => cols.indexOf(f.toUpperCase())).filter((i) => i >= 0)
    : cols.map((_, i) => i).filter((i) => i !== xIdx && isNumCol(i));
  // Nothing detected numeric? Plot every non-x column so it's never blank.
  // A single-column result plots that column against row numbers.
  const fallbackY = cols.map((_, i) => i).filter((i) => i !== xIdx);
  const yCols = yIdxs.length ? yIdxs : fallbackY.length ? fallbackY : [xIdx];
  const singleColumn = yCols.length === 1 && yCols[0] === xIdx;

  const categories = result.rows.map((r, ri) => (singleColumn ? String(ri + 1) : String(r[xIdx] ?? "")));
  const nameValue = () => result.rows.map((r) => ({ name: String(r[xIdx] ?? ""), value: num(r[yCols[0] ?? 1]) ?? 0 }));
  let extraOption: Record<string, unknown> = {};
  const series =
    viz.chart === "pie" || viz.chart === "donut"
      ? [
          {
            type: "pie" as const,
            radius: viz.chart === "donut" ? ["48%", "72%"] : ["0%", "70%"],
            itemStyle: { borderRadius: 4 },
            label: { color: fg, fontSize: 10 },
            data: nameValue(),
          },
        ]
      : viz.chart === "funnel"
        ? [{ type: "funnel" as const, gap: 2, label: { color: fg, fontSize: 10 }, data: nameValue().sort((a, b) => b.value - a.value) }]
        : viz.chart === "treemap"
          ? [{ type: "treemap" as const, roam: false, breadcrumb: { show: false }, label: { color: "#fff", fontSize: 10 }, data: nameValue() }]
          : viz.chart === "gauge"
            ? (() => {
                const v = num(result.rows[0]?.[yCols[0] ?? 0]) ?? 0;
                const max = Math.max(Math.ceil((v * 1.25) / 10) * 10, 10);
                return [{ type: "gauge" as const, max, progress: { show: true }, detail: { color: fg, fontSize: 16 }, axisLabel: { color: fg, fontSize: 8 }, data: [{ value: v, name: cols[yCols[0] ?? 0] }] }];
              })()
            : viz.chart === "radar"
              ? (() => {
                  const maxV = Math.max(...result.rows.flatMap((r) => yCols.map((yi) => num(r[yi]) ?? 0)), 1);
                  extraOption = { radar: { indicator: categories.map((c) => ({ name: c, max: maxV * 1.15 })), axisName: { color: fg, fontSize: 9 } } };
                  return [{ type: "radar" as const, data: yCols.map((yi) => ({ name: cols[yi], value: result.rows.map((r) => num(r[yi]) ?? 0) })) }];
                })()
              : viz.chart === "heatmap"
                ? (() => {
                    // Expect 3 columns: x, y, value (Superset heatmap shape).
                    const yCat = cols.findIndex((_, i) => i !== xIdx && !isNumCol(i));
                    const yi = yCat >= 0 ? yCat : Math.min(1, cols.length - 1);
                    const vi = yCols.find((i) => i !== xIdx && i !== yi) ?? cols.length - 1;
                    const xs = [...new Set(result.rows.map((r) => String(r[xIdx] ?? "")))];
                    const ys = [...new Set(result.rows.map((r) => String(r[yi] ?? "")))];
                    const vals = result.rows.map((r) => num(r[vi]) ?? 0);
                    extraOption = {
                      xAxis: { type: "category", data: xs, axisLabel: { color: fg, fontSize: 9 } },
                      yAxis: { type: "category", data: ys, axisLabel: { color: fg, fontSize: 9 } },
                      visualMap: { min: Math.min(...vals, 0), max: Math.max(...vals, 1), calculable: true, orient: "horizontal", left: "center", bottom: 0, textStyle: { color: fg }, inRange: { color: ["#123", "#5fc33b"] } },
                    };
                    return [{ type: "heatmap" as const, label: { show: xs.length * ys.length <= 60, color: fg, fontSize: 9 }, data: result.rows.map((r) => [String(r[xIdx] ?? ""), String(r[yi] ?? ""), num(r[vi]) ?? 0]) }];
                  })()
                : yCols.map((yi) => ({
                    name: cols[yi],
                    type: (viz.chart === "area" ? "line" : viz.chart === "hbar" ? "bar" : viz.chart) as "line" | "bar" | "scatter",
                    // Hover/click a series (or its legend) to spotlight it and fade the rest.
                    emphasis: { focus: "series" as const },
                    ...(viz.chart === "area" ? { areaStyle: { opacity: 0.22 } } : {}),
                    ...(viz.stacked ? { stack: "total" } : {}),
                    smooth: viz.chart !== "bar",
                    showSymbol: viz.chart === "scatter",
                    symbolSize: viz.chart === "scatter" ? 9 : 4,
                    itemStyle: { borderRadius: viz.chart === "bar" ? [3, 3, 0, 0] : 0 },
                    barMaxWidth: 40,
                    data: result.rows.map((r) => num(r[yi]) ?? 0),
                  }));

  const primary: Record<string, unknown> = {
    color: CHART_PALETTE,
    grid: { left: 44, right: 12, top: 24, bottom: 26 },
    tooltip: { trigger: AXISLESS.has(viz.chart) || viz.chart === "heatmap" ? "item" : "axis" },
    legend:
      series.length > 1 && !AXISLESS.has(viz.chart) && viz.chart !== "heatmap"
        ? { top: 2, textStyle: { color: fg, fontSize: 10 }, icon: "circle" }
        : undefined,
    ...(!AXISLESS.has(viz.chart) && viz.chart !== "heatmap"
      ? {
          [viz.chart === "hbar" ? "yAxis" : "xAxis"]: {
            type: "category",
            data: categories,
            axisLabel: { color: fg, fontSize: 10, hideOverlap: true, rotate: categories.length > 8 ? 30 : 0 },
            axisLine: { lineStyle: { color: border } },
            axisTick: { show: false },
          },
          [viz.chart === "hbar" ? "xAxis" : "yAxis"]: {
            type: "value",
            axisLabel: { color: fg, fontSize: 10 },
            splitLine: { lineStyle: { color: border, opacity: 0.4, type: "dashed" } },
          },
        }
      : {}),
    ...extraOption,
    series,
  };
  // Full-control overrides: whatever the human (or agent) put in viz.option
  // merges over the generated chart.
  return { primary, override: viz.option as Record<string, unknown> | undefined };
}
