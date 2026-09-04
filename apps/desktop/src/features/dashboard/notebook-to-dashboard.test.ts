import assert from "node:assert/strict";
import { test } from "node:test";
import { dashboardDocFromCells, type SourceCell } from "./notebook-to-dashboard.ts";

test("maps cell types to the right widgets", () => {
  const cells: SourceCell[] = [
    { type: "markdown", src: "## Intro" },
    { type: "sql", src: "SELECT a,b FROM t", chart: "bar", viz: { xField: "a", yFields: ["b"] } },
    { type: "sql", src: "SELECT SUM(x)", chart: "kpi" },
    { type: "sql", src: "SELECT * FROM t" }, // no chart → table
    { type: "mermaid", src: "graph TD; A-->B" },
  ];
  const doc = dashboardDocFromCells("d1", "From notebook", cells);
  assert.deepEqual(doc.widgets.map((w) => w.type), ["markdown", "chart", "kpi", "table", "markdown"]);
  assert.equal(doc.widgets[1].query, "SELECT a,b FROM t");
  assert.equal(doc.widgets[1].props?.kind, "bar");
  assert.deepEqual(doc.widgets[1].props?.yFields, ["b"]);
  assert.equal(doc.widgets[2].query, "SELECT SUM(x)");
  assert.match(String(doc.widgets[4].props?.text), /```mermaid/);
});

test("skips empty cells", () => {
  const doc = dashboardDocFromCells("d1", "t", [
    { type: "sql", src: "   " },
    { type: "markdown", src: "" },
    { type: "sql", src: "SELECT 1" },
  ]);
  assert.equal(doc.widgets.length, 1);
});

test("lays widgets out flowing left→right, wrapping to new rows", () => {
  // markdown = full width (forces its own row); charts = half width (2 per row).
  const doc = dashboardDocFromCells("d1", "t", [
    { type: "markdown", src: "# Title" },
    { type: "sql", src: "q1", chart: "bar" },
    { type: "sql", src: "q2", chart: "line" },
    { type: "sql", src: "q3", chart: "pie" },
  ]);
  const [md, c1, c2, c3] = doc.widgets;
  assert.deepEqual(md.layout, { x: 0, y: 0, w: 12, h: 2 }); // full row
  assert.deepEqual(c1.layout, { x: 0, y: 2, w: 6, h: 4 }); // next row, left
  assert.deepEqual(c2.layout, { x: 6, y: 2, w: 6, h: 4 }); // same row, right
  assert.equal(c3.layout.x, 0); // wrapped to a new row
  assert.equal(c3.layout.y, 6);
});

test("an empty notebook yields an empty dashboard", () => {
  const doc = dashboardDocFromCells("d1", "t", []);
  assert.equal(doc.widgets.length, 0);
  assert.equal(doc.title, "t");
});
