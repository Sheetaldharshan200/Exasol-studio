import assert from "node:assert/strict";
import { test } from "node:test";
import { serialize, parse, newFile, cacheResult, pruneCache, DEFAULT_REFRESH, DASHBOARD_FILE_VERSION } from "./store.ts";
import { emptyDoc, applyOp } from "./model.ts";

const sample = () => {
  let doc = emptyDoc("d1", "Sales");
  doc = applyOp(doc, { op: "add_widget", widget: { type: "kpi", query: "SELECT 1" } }).doc;
  return newFile(doc);
};

test("serialize→parse round-trips a file", () => {
  const f = sample();
  const back = parse(serialize(f));
  assert.equal(back.version, DASHBOARD_FILE_VERSION);
  assert.equal(back.doc.widgets[0].id, "w1");
  assert.deepEqual(back.refresh, DEFAULT_REFRESH);
});

test("parse tolerates a missing cache and refresh block", () => {
  const raw = JSON.stringify({ doc: emptyDoc("d2") });
  const f = parse(raw);
  assert.deepEqual(f.cache, {});
  assert.equal(f.refresh.enabled, false);
  assert.equal(f.refresh.intervalSec, 60);
});

test("parse preserves unknown future top-level fields", () => {
  const raw = JSON.stringify({ version: 99, doc: emptyDoc("d3"), somethingNew: { a: 1 } });
  const f = parse(raw) as unknown as Record<string, unknown>;
  assert.deepEqual(f.somethingNew, { a: 1 });
  assert.equal((f as { version: number }).version, 99);
});

test("parse rejects a file with no valid document", () => {
  assert.throws(() => parse("{}"), /no valid document/);
  assert.throws(() => parse("not json"), /not valid JSON/);
});

test("parse clamps a non-positive interval to the default", () => {
  const raw = JSON.stringify({ doc: emptyDoc("d4"), refresh: { enabled: true, intervalSec: 0 } });
  const f = parse(raw);
  assert.equal(f.refresh.enabled, true);
  assert.equal(f.refresh.intervalSec, 60);
});

test("cacheResult stores a result immutably", () => {
  const f = sample();
  const g = cacheResult(f, "w1", { value: 42, lastRefreshed: "2026-09-02T00:00:00Z" });
  assert.equal(g.cache.w1.value, 42);
  assert.equal(f.cache.w1, undefined); // original untouched
});

test("pruneCache drops results for removed widgets", () => {
  let f = sample();
  f = cacheResult(f, "w1", { value: 1 });
  f = cacheResult(f, "ghost", { value: 2 });
  const pruned = pruneCache(f);
  assert.ok(pruned.cache.w1);
  assert.equal(pruned.cache.ghost, undefined);
});
