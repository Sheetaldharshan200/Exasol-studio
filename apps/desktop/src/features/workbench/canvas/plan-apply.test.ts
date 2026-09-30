import assert from "node:assert/strict";
import { test } from "node:test";
import { describeCanvas, resolvePlan } from "./plan-apply.ts";
import { SIZES, type CanvasDoc } from "./model.ts";

const conn = { profileId: "p", connectionName: "Local" };
const rect = { x: 0, y: 0, ...SIZES.table };
const doc: CanvasDoc = {
  version: 1,
  boxes: [
    { id: "t1", kind: "table", ...conn, schema: "RETAIL", table: "SALES", rect, rowCount: 1200 },
    { id: "q1", kind: "query", ...conn, name: "Monthly", sql: "SELECT month, SUM(amount) AS total FROM derived_table GROUP BY month", sources: ["t1"], rect },
  ],
};
let n = 0;
const allocate = (kind: "query" | "chart") => `${kind}-${++n}`;

test("plan names resolve to canvas titles and to earlier plan boxes, in order", () => {
  n = 0;
  const { steps, errors } = resolvePlan(
    {
      boxes: [
        { kind: "query", name: "Top regions", sql: "SELECT region, SUM(amount) AS revenue FROM derived_table GROUP BY region", source: "RETAIL.SALES" },
        { kind: "chart", name: "Regions", source: "Top regions", chart: "bar", xField: "REGION", yFields: ["REVENUE"] },
        { kind: "chart", name: "Trend", source: "Monthly", chart: "line" },
      ],
    },
    doc,
    allocate,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(steps.map((s) => [s.id, s.kind, "sources" in s ? s.sources : s.source]), [
    ["query-1", "query", ["t1"]],
    ["chart-2", "chart", "query-1"],
    ["chart-3", "chart", "q1"],
  ]);
});

test("an unknown source names the box that asked for it and skips what depends on it", () => {
  n = 0;
  const { steps, errors } = resolvePlan(
    { boxes: [{ kind: "query", name: "Q", sql: "x", source: "NOPE.TABLE" }, { kind: "chart", name: "C", source: "Q", chart: "bar" }] },
    doc,
    allocate,
  );
  assert.equal(steps.length, 0);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /"Q" reads "NOPE.TABLE"/);
});

test("lower-case titles still resolve; the agent sees titles, SQL and chart mappings", () => {
  n = 0;
  const { steps } = resolvePlan({ boxes: [{ kind: "chart", name: "C", source: "retail.sales", chart: "pie" }] }, doc, allocate);
  assert.equal(steps.length, 1);
  const text = describeCanvas(doc, "Local");
  assert.match(text, /table "RETAIL.SALES" \(1200 rows\)/);
  assert.match(text, /query "Monthly" on "RETAIL.SALES":\n  SELECT month, SUM\(amount\)/);
  assert.equal(describeCanvas({ version: 1, boxes: [] }, "Local"), 'Canvas on connection "Local": empty. Boxes you add read tables by their schema.table title.');
});
