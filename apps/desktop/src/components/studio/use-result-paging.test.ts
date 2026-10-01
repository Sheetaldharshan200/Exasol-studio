import assert from "node:assert/strict";
import { test } from "node:test";
import { cachePage, farthestPage, pageBase, planFor, type TabPages } from "./use-result-paging.ts";

const res = (n: number) => ({ id: n }) as unknown as Parameters<typeof cachePage>[2];
const entry = (pages: number[]): TabPages => ({
  sql: "SELECT 1",
  plan: { kind: "columns", base: "SELECT 1", columnCount: 1 },
  run: null,
  pages: new Map(pages.map((p) => [p, res(p)])),
});

test("only a single SELECT or WITH can be paged", () => {
  assert.equal(pageBase("SELECT * FROM T"), "SELECT * FROM T");
  assert.equal(pageBase("  with x as (select 1) select * from x ;"), "with x as (select 1) select * from x");
  assert.equal(pageBase("INSERT INTO T VALUES (1)"), null);
  assert.equal(pageBase("SELECT 1; SELECT 2;"), null);
  assert.equal(pageBase(""), null);
  assert.equal(pageBase("-- monthly report\nSELECT * FROM T"), "-- monthly report\nSELECT * FROM T", "a leading comment is not the statement");
  assert.equal(pageBase("/* x */ DELETE FROM T"), null);
});

test("a run is paged by a plan made from its statement and its columns", () => {
  const run = (cols: string[]) => ({ results: [{ columns: cols.map((name) => ({ name, typeName: "DECIMAL(18,0)" })) }] }) as unknown as Parameters<typeof planFor>[1];
  assert.equal(planFor("SELECT a, b FROM t", run(["A", "B"]))?.kind, "columns");
  assert.equal(planFor("SELECT a FROM t ORDER BY a DESC", run(["A"]))?.kind, "ordered");
  assert.equal(planFor("SELECT a FROM t LIMIT 5", run(["A"])), null, "its own LIMIT is the rows asked for");
  assert.equal(planFor("SELECT 1; SELECT 2", run(["X"])), null, "only one statement pages");
  assert.equal(planFor("SELECT a FROM t", null), null, "no columns yet, no plan");
});

test("the page dropped from the cache is the one farthest from where you are", () => {
  assert.equal(farthestPage([0, 1, 2, 9], 9), 0);
  assert.equal(farthestPage([0, 1, 2, 9], 0), 9);
  assert.equal(farthestPage([5], 5), 5);
});

test("ties drop the earlier page, so the cache stays deterministic", () => {
  assert.equal(farthestPage([2, 8], 5), 2);
});

test("a cached page is kept and readable", () => {
  const e = entry([]);
  cachePage(e, 3, res(3));
  assert.ok(e.pages.has(3));
  assert.equal(e.pages.size, 1);
});

test("the cache never grows past its cap, however the page was loaded", () => {
  const e = entry([]);
  // Walking forward through a big result: every page turn caches one page.
  for (let p = 0; p < 40; p++) cachePage(e, p, res(p));
  assert.equal(e.pages.size, 8);
  assert.ok(e.pages.has(39), "the page you are on is kept");
});

test("eviction keeps the pages around where you are", () => {
  const e = entry([0, 1, 2, 3, 4, 5, 6, 7]);
  cachePage(e, 8, res(8));
  assert.equal(e.pages.size, 8);
  assert.equal(e.pages.has(0), false, "the farthest page goes");
  assert.equal(e.pages.has(8), true);
});

test("re-caching a page already held does not evict anything", () => {
  const e = entry([0, 1, 2]);
  cachePage(e, 1, res(1));
  assert.deepEqual([...e.pages.keys()].sort((a, b) => a - b), [0, 1, 2]);
});
