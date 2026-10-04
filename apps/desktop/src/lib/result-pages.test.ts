import assert from "node:assert/strict";
import { test } from "node:test";
import { hasTopLevelLimit, hasTopLevelOrderBy, pagePlan, pageSql, topLevelWords, countSql } from "./result-pages.ts";

test("only top-level clauses count: subqueries, strings, quoted names and comments are skipped", () => {
  assert.equal(hasTopLevelOrderBy("SELECT * FROM t ORDER BY amount DESC"), true);
  assert.equal(hasTopLevelOrderBy("SELECT * FROM (SELECT * FROM t ORDER BY a LIMIT 5) x"), false);
  assert.equal(hasTopLevelOrderBy("SELECT 'order by' AS s, \"ORDER BY\" FROM t -- order by x\n"), false);
  assert.equal(hasTopLevelOrderBy("select a from t /* order by b */"), false);
  assert.equal(hasTopLevelLimit("SELECT * FROM t LIMIT 10"), true);
  assert.equal(hasTopLevelLimit("WITH x AS (SELECT * FROM t LIMIT 3) SELECT * FROM x"), false);
  assert.deepEqual(topLevelWords("select a, (select b from c) from d"), ["SELECT", "A", "FROM", "D"]);
});

test("a statement with its own order pages in that order, with every column breaking ties", () => {
  const plan = pagePlan("SELECT * FROM sales ORDER BY amount DESC", ["ID", "AMOUNT"]);
  assert.deepEqual(plan, { kind: "ordered", base: "SELECT * FROM sales ORDER BY amount DESC", columnCount: 2 });
  assert.equal(pageSql(plan!, 0, 100), "SELECT * FROM sales ORDER BY amount DESC\n, 1, 2\nLIMIT 101 OFFSET 0");
  assert.equal(pageSql(plan!, 2, 100), "SELECT * FROM sales ORDER BY amount DESC\n, 1, 2\nLIMIT 101 OFFSET 200");
  // A trailing comment cannot swallow the tie breaker.
  const commented = pagePlan("SELECT a FROM t ORDER BY a -- newest first", ["A"]);
  assert.equal(pageSql(commented!, 1, 10), "SELECT a FROM t ORDER BY a -- newest first\n, 1\nLIMIT 11 OFFSET 10");
  // Duplicate names are fine here: no wrapper selects from the statement.
  assert.equal(pagePlan("SELECT a.id, b.id FROM a, b ORDER BY 1", ["ID", "ID"])?.kind, "ordered");
});

test("an unordered statement pages by every column", () => {
  const plan = pagePlan("SELECT region, revenue FROM r", ["REGION", "REVENUE"]);
  assert.deepEqual(plan, { kind: "columns", base: "SELECT region, revenue FROM r", columnCount: 2 });
  assert.equal(pageSql(plan!, 1, 500), "SELECT * FROM (\nSELECT region, revenue FROM r\n) ORDER BY 1, 2\nLIMIT 501 OFFSET 500");
});

test("own LIMIT, duplicate column names (any case) and no columns are not paged", () => {
  assert.equal(pagePlan("SELECT * FROM t LIMIT 50", ["A"]), null);
  assert.equal(pagePlan("SELECT a.id, b.id FROM a JOIN b ON TRUE", ["ID", "ID"]), null);
  assert.equal(pagePlan('SELECT 1 AS "x", 2 AS "X"', ["x", "X"]), null);
  assert.equal(pagePlan("SELECT 1", []), null);
  // WITH statements page like SELECT.
  assert.equal(pagePlan("WITH x AS (SELECT 1 AS n) SELECT n FROM x", ["N"])?.kind, "columns");
});

test("countSql wraps a query and nothing else", () => {
  assert.equal(countSql("SELECT * FROM t;"), "SELECT COUNT(*) FROM (\nSELECT * FROM t\n)");
  assert.equal(countSql("with a as (select 1) select * from a -- note"), "SELECT COUNT(*) FROM (\nwith a as (select 1) select * from a -- note\n)");
  assert.equal(countSql("DELETE FROM t"), null);
  assert.equal(countSql("  "), null);
});
