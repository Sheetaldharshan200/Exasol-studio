import assert from "node:assert/strict";
import { test } from "node:test";
import { drillSql, type DrillState } from "./drill-sql.ts";

const DRILL = ["year", "quarter", "month"];

test("no drill config returns the base query", () => {
  assert.equal(drillSql("SELECT * FROM t", [], "amount", { level: 0, path: [] }), "SELECT * FROM t");
  assert.equal(drillSql("SELECT * FROM t", DRILL, "", { level: 0, path: [] }), "SELECT * FROM t");
});

test("top level aggregates by the first column", () => {
  const sql = drillSql("SELECT year, quarter, month, amount FROM sales", DRILL, "amount", { level: 0, path: [] });
  assert.match(sql, /SELECT "YEAR", SUM\("AMOUNT"\) AS "AMOUNT"/);
  assert.match(sql, /GROUP BY "YEAR"/);
  assert.doesNotMatch(sql, /WHERE/);
});

test("drilling one level groups by the next column, filtered to the path", () => {
  const st: DrillState = { level: 1, path: [{ col: "year", value: "2024" }] };
  const sql = drillSql("SELECT * FROM sales", DRILL, "amount", st);
  assert.match(sql, /SUM\("AMOUNT"\)/);
  assert.match(sql, /WHERE "YEAR" = '2024'/);
  assert.match(sql, /GROUP BY "QUARTER"/);
});

test("the deepest level clamps to the last column", () => {
  const st: DrillState = { level: 9, path: [{ col: "year", value: "2024" }, { col: "quarter", value: "Q1" }] };
  const sql = drillSql("SELECT * FROM sales", DRILL, "amount", st);
  assert.match(sql, /GROUP BY "MONTH"/);
  assert.match(sql, /"YEAR" = '2024' AND "QUARTER" = 'Q1'/);
});

test("escapes quotes in path values", () => {
  const st: DrillState = { level: 1, path: [{ col: "name", value: "O'Brien" }] };
  assert.match(drillSql("q", ["name", "sub"], "amt", st), /'O''Brien'/);
});
