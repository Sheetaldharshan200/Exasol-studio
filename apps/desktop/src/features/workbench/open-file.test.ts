import test from "node:test";
import assert from "node:assert/strict";
import { formatBytes, pageWindow, routeOpen, TEXT_LIMIT_ANY, TEXT_LIMIT_TABULAR } from "./open-file.ts";

test("small CSV opens as text; a big one opens as a grid that may still be edited on purpose", () => {
  assert.deepEqual(routeOpen({ name: "a.csv", size: TEXT_LIMIT_TABULAR }), { kind: "text" });
  assert.deepEqual(routeOpen({ name: "a.csv", size: TEXT_LIMIT_TABULAR + 1 }), { kind: "preview", editable: true });
  assert.deepEqual(routeOpen({ name: "huge.CSV", size: 300 * 1024 * 1024 }), { kind: "preview", editable: true });
});

test("parquet is always a grid, never text", () => {
  assert.deepEqual(routeOpen({ name: "x.parquet", size: 10 }), { kind: "preview", editable: false });
});

test("other text files respect the hard limit, and unknown types are refused with a reason", () => {
  assert.deepEqual(routeOpen({ name: "q.sql", size: TEXT_LIMIT_ANY }), { kind: "text" });
  const r = routeOpen({ name: "dump.log", size: TEXT_LIMIT_ANY + 1 });
  assert.equal(r.kind, "refuse");
  assert.match((r as { reason: string }).reason, /2\.0 MB/);
  assert.equal(routeOpen({ name: "photo.png", size: 10 }).kind, "refuse");
  assert.equal(routeOpen({ name: "noext", size: 10 }).kind, "refuse");
});

test("unknown size is treated as small (the read path still guards)", () => {
  assert.deepEqual(routeOpen({ name: "a.csv", size: null }), { kind: "text" });
});

test("bytes format like a file manager", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(1.5 * 1024 * 1024), "1.5 MB");
});

test("page windows clamp to the known total and float when the total is unknown", () => {
  assert.deepEqual(pageWindow(1, 1000, 2500), { offset: 0, limit: 1000, page: 1, pages: 3 });
  assert.deepEqual(pageWindow(9, 1000, 2500), { offset: 2000, limit: 1000, page: 3, pages: 3 });
  assert.deepEqual(pageWindow(0, 1000, 2500), { offset: 0, limit: 1000, page: 1, pages: 3 });
  assert.deepEqual(pageWindow(7, 1000, null), { offset: 6000, limit: 1000, page: 7, pages: null });
  assert.deepEqual(pageWindow(1, 1000, 0), { offset: 0, limit: 1000, page: 1, pages: 1 });
});
