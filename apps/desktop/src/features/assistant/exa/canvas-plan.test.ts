import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCanvasPlan, planSummary } from "./canvas-plan.ts";

test("a plan with a query on a table and a chart on the query parses; names are unique", () => {
  const plan = parseCanvasPlan(
    JSON.stringify({
      title: "Revenue by region",
      boxes: [
        { kind: "query", name: "By region", sql: "SELECT region, SUM(amount) AS revenue FROM derived_table GROUP BY region", source: "RETAIL.SALES" },
        { kind: "chart", name: "Revenue chart", source: "By region", chart: "bar", xField: "REGION", yFields: ["REVENUE"] },
      ],
    }),
  );
  assert.ok(plan);
  assert.equal(plan.title, "Revenue by region");
  assert.equal(plan.boxes.length, 2);
  assert.equal(planSummary(plan), "1 query · 1 chart");
  const dup = parseCanvasPlan(JSON.stringify({ boxes: [{ kind: "query", name: "A", sql: "x" }, { kind: "query", name: "A", sql: "y" }] }));
  assert.equal(dup, null, "two boxes with one name cannot be sourced by name");
});

test("several sources, unknown kinds, unknown charts and empty plans", () => {
  const join = parseCanvasPlan(JSON.stringify({ boxes: [{ kind: "query", name: "J", sql: "SELECT * FROM source_1 JOIN source_2 ON TRUE", source: ["A.B", "A.C"] }] }));
  assert.deepEqual(join?.boxes[0], { kind: "query", name: "J", sql: "SELECT * FROM source_1 JOIN source_2 ON TRUE", source: ["A.B", "A.C"] });
  assert.equal(parseCanvasPlan(JSON.stringify({ boxes: [{ kind: "note", name: "N" }] })), null);
  assert.equal(parseCanvasPlan(JSON.stringify({ boxes: [{ kind: "chart", name: "C", source: "Q", chart: "hologram" }] })), null);
  assert.equal(parseCanvasPlan(JSON.stringify({ boxes: [] })), null);
  assert.equal(parseCanvasPlan("nope"), null);
  assert.equal(parseCanvasPlan(JSON.stringify({ boxes: [{ kind: "query", name: "Q", sql: "x", source: ["ok", 3] }] })), null, "a non-string source is refused, not dropped");
});
