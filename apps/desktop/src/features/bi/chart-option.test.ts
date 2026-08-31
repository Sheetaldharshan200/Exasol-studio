import assert from "node:assert/strict";
import { test } from "node:test";
import { AXISLESS, buildChartOption, type EchartsViz } from "./chart-option.ts";
import type { StatementResult } from "@/lib/ipc";

const THEME = { fg: "#888", border: "#333" };
const result = (columns: string[], rows: (string | number | null)[][]): StatementResult =>
  ({ columns: columns.map((name) => ({ name, type: "VARCHAR" })), rows, rowCount: rows.length, durationMs: 1 }) as unknown as StatementResult;

const KINDS = ["bar", "hbar", "line", "area", "pie", "donut", "scatter", "heatmap", "funnel", "radar", "treemap", "gauge"] as const;

test("every canonical kind produces an option with a series", () => {
  const r = result(["MONTH", "REGION", "REVENUE"], [["Jan", "EU", "10"], ["Feb", "US", "20"], ["Mar", "EU", "15"]]);
  for (const chart of KINDS) {
    const built = buildChartOption({ type: "echarts", chart } as EchartsViz, r, THEME);
    assert.ok(built, `${chart}: null option`);
    const series = built.primary.series as unknown[];
    assert.ok(Array.isArray(series) && series.length > 0, `${chart}: empty series`);
  }
});

test("empty result returns null instead of a blank chart", () => {
  assert.equal(buildChartOption({ type: "echarts", chart: "bar" } as EchartsViz, result(["A"], []), THEME), null);
});

test("single numeric column still plots (never blank)", () => {
  const built = buildChartOption({ type: "echarts", chart: "bar" } as EchartsViz, result(["N"], [["1"], ["2"]]), THEME);
  assert.ok(built);
  const series = built.primary.series as { data: number[] }[];
  assert.deepEqual(series[0].data, [1, 2]);
});

test("string numbers are coerced, not dropped", () => {
  const built = buildChartOption({ type: "echarts", chart: "line" } as EchartsViz, result(["X", "Y"], [["a", "1.5"], ["b", "2.5"]]), THEME);
  const series = (built!.primary.series as { data: number[] }[])[0];
  assert.deepEqual(series.data, [1.5, 2.5]);
});

test("custom option.series takes over completely with dataset injected", () => {
  const viz = { type: "echarts", chart: "bar", option: { series: [{ type: "sankey" }] } } as unknown as EchartsViz;
  const built = buildChartOption(viz, result(["A", "B"], [["x", "1"]]), THEME);
  assert.ok(built);
  const dataset = built.primary.dataset as { source: unknown[][] };
  assert.deepEqual(dataset.source[0], ["A", "B"]);
  assert.equal((built.primary.series as { type: string }[])[0].type, "sankey");
  assert.equal(built.override, undefined);
});

test("hbar swaps axes; axisless kinds get none", () => {
  const r = result(["NAME", "V"], [["a", "1"], ["b", "2"]]);
  const hbar = buildChartOption({ type: "echarts", chart: "hbar" } as EchartsViz, r, THEME)!;
  assert.equal((hbar.primary.yAxis as { type: string }).type, "category");
  const pie = buildChartOption({ type: "echarts", chart: "pie" } as EchartsViz, r, THEME)!;
  assert.equal(pie.primary.xAxis, undefined);
  assert.ok(AXISLESS.has("pie"));
});
