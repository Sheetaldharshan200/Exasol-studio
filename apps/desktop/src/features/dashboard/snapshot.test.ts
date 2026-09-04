import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSnapshot } from "./snapshot.ts";
import { emptyDoc, applyOps } from "./model.ts";
import type { CachedResult } from "./store.ts";

const doc = () =>
  applyOps(emptyDoc("d1", "Sales Overview"), [
    { op: "add_widget", widget: { id: "m", type: "markdown", props: { text: "## Q3\nRevenue is up." } } },
    { op: "add_widget", widget: { id: "k", type: "kpi", query: "SELECT SUM(amt)" } },
    { op: "add_widget", widget: { id: "t", type: "table", query: "SELECT * FROM t", props: { title: "Top rows" } } },
    { op: "add_widget", widget: { id: "f", type: "filter", props: { param: "region" } } },
  ]).doc;

const cache: Record<string, CachedResult> = {
  k: { value: 12345, columns: ["total"] },
  t: { columns: ["name", "amt"], rows: [["A", 10], ["B", 20]] },
};

test("html snapshot is self-contained and offline (no external refs, has data)", () => {
  const { html } = buildSnapshot(doc(), cache);
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Sales Overview/);
  assert.match(html, /12345/); // KPI value
  assert.match(html, /Top rows/); // table caption
  assert.match(html, /<td>A<\/td>/); // table data
  assert.doesNotMatch(html, /https?:\/\//); // no external resource references
});

test("markdown snapshot carries the narrative, KPI, and a table", () => {
  const { md } = buildSnapshot(doc(), cache);
  assert.match(md, /# Sales Overview/);
  assert.match(md, /Revenue is up\./);
  assert.match(md, /\*\*12345\*\*/);
  assert.match(md, /\| name \| amt \|/);
  assert.match(md, /\| A \| 10 \|/);
});

test("markdown renders as HTML (# heading → <h1>), not raw text", () => {
  const d = applyOps(emptyDoc("d1", "T"), [{ op: "add_widget", widget: { type: "markdown", props: { text: "# TPCH\n**bold** and `code`\n- item" } } }]).doc;
  const { html } = buildSnapshot(d, {});
  assert.match(html, /<h1>TPCH<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<li>item<\/li>/);
  assert.doesNotMatch(html, /# TPCH/); // not shown raw
});

test("filters render as a static control in the snapshot", () => {
  const { html } = buildSnapshot(doc(), cache);
  assert.match(html, /filterbox/); // the filter is shown, not omitted
  assert.match(html, /region/); // with its parameter name
});

test("widgets are positioned on the grid like the app (not stacked)", () => {
  const { html } = buildSnapshot(doc(), cache);
  assert.match(html, /class="grid"/);
  assert.match(html, /grid-column:\d+\/span \d+/); // each cell carries its grid position
});

test("interactive artifact: theme toggle + inlined runtime + interactive charts", () => {
  const d = applyOps(emptyDoc("d1", "T"), [{ op: "add_widget", widget: { id: "c", type: "chart", query: "q" } }]).doc;
  const { html } = buildSnapshot(d, {}, undefined, {
    chartImages: { c: "data:image/png;base64,AAAA" },
    chartOptions: { c: { series: [] } },
    runtimeJs: "/*ECHARTS_RUNTIME*/",
  });
  assert.match(html, /class="themebtn"/); // light/dark toggle
  assert.match(html, /__toggleTheme/);
  assert.match(html, /\/\*ECHARTS_RUNTIME\*\//); // runtime inlined (self-contained, offline)
  assert.match(html, /data-chart="c"/); // interactive chart mount
  assert.match(html, /window\.__CHARTS/); // embedded chart options
  assert.match(html, /chartfallback/); // captured image as fallback
});

test("the page always has a theme toggle, even without interactive charts", () => {
  const { html } = buildSnapshot(doc(), cache);
  assert.match(html, /class="themebtn"/);
  assert.match(html, /data-theme/); // theme tokens present
  assert.doesNotMatch(html, /window\.__CHARTS/); // no interactive-chart payload
  assert.doesNotMatch(html, /https?:\/\//); // self-contained
});

test("a widget with no cached data renders a clean empty note, not a crash", () => {
  const { html, md } = buildSnapshot(doc(), {}); // no cache at all
  assert.match(html, /No cached data\./);
  assert.match(md, /_No cached data\._/);
});

test("html escaping prevents injection from data and titles", () => {
  let d = emptyDoc("x", "<script>alert(1)</script>");
  d = applyOps(d, [{ op: "add_widget", widget: { id: "t", type: "table", query: "q" } }]).doc;
  const { html } = buildSnapshot(d, { t: { columns: ["<b>col</b>"], rows: [["<i>v</i>"]] } });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;b&gt;col/);
});

test("generatedAt footer appears when provided", () => {
  const { html, md } = buildSnapshot(doc(), cache, "2026-09-03 10:00");
  assert.match(html, /Generated 2026-09-03 10:00/);
  assert.match(md, /_Generated 2026-09-03 10:00_/);
});
