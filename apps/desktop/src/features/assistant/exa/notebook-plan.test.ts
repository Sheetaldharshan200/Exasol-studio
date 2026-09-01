import assert from "node:assert/strict";
import { test } from "node:test";
import { cellLabel, parseNotebookPlan } from "./notebook-plan.ts";

test("valid plan parses with chart hints kept only on sql cells", () => {
  const plan = parseNotebookPlan(
    JSON.stringify({
      title: "Sales overview",
      cells: [
        { type: "markdown", src: "# Sales", chart: "bar" },
        { type: "sql", src: "SELECT 1", chart: "bar" },
        { type: "sql", src: "SELECT 2", chart: "nonsense" },
      ],
    }),
  )!;
  assert.equal(plan.title, "Sales overview");
  assert.equal(plan.cells.length, 3);
  assert.equal(plan.cells[0].chart, undefined);
  assert.equal(plan.cells[1].chart, "bar");
  assert.equal(plan.cells[2].chart, undefined);
});

test("garbage, non-JSON, empty and cell-less input return null", () => {
  assert.equal(parseNotebookPlan("not json"), null);
  assert.equal(parseNotebookPlan("[]"), null);
  assert.equal(parseNotebookPlan("{}"), null);
  assert.equal(parseNotebookPlan(JSON.stringify({ title: "x", cells: [] })), null);
  assert.equal(parseNotebookPlan(JSON.stringify({ cells: [{ type: "python", src: "x" }] })), null);
  assert.equal(parseNotebookPlan(JSON.stringify({ cells: [{ type: "sql", src: "   " }] })), null);
});

test("invalid cells are dropped, valid ones survive; caps enforced", () => {
  const cells = [
    { type: "sql", src: "SELECT 1" },
    { type: "bogus", src: "x" },
    { type: "sql" },
    ...Array.from({ length: 60 }, (_, i) => ({ type: "sql", src: `SELECT ${i}` })),
  ];
  const plan = parseNotebookPlan(JSON.stringify({ cells }))!;
  assert.ok(plan.cells.length <= 40);
  assert.equal(plan.title, "AI notebook");
  const long = parseNotebookPlan(JSON.stringify({ cells: [{ type: "sql", src: "x".repeat(30_000) }] }))!;
  assert.equal(long.cells[0].src.length, 20_000);
});

test("cellLabel strips heading/comment markers and truncates", () => {
  assert.equal(cellLabel({ type: "markdown", src: "## Revenue by region" }), "Revenue by region");
  assert.equal(cellLabel({ type: "sql", src: "-- top customers\nSELECT…" }), "top customers");
  assert.equal(cellLabel({ type: "sql", src: "" }), "sql");
  assert.ok(cellLabel({ type: "sql", src: "x".repeat(100) }).endsWith("…"));
});
