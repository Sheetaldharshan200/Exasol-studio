import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDataFileNote, fileExt, fmtBytes, INLINE_LIMIT_BYTES, routeAttachment } from "./attachment-routing.ts";

test("data extensions go to disk regardless of size", () => {
  assert.equal(routeAttachment("orders.csv", 10), "disk");
  assert.equal(routeAttachment("Data.XLSX", 10), "disk");
  assert.equal(routeAttachment("dump.parquet", 10), "disk");
  assert.equal(routeAttachment("events.ndjson", 10), "disk");
});

test("small code/text stays inline; oversized text goes to disk", () => {
  assert.equal(routeAttachment("query.sql", 2_000), "inline");
  assert.equal(routeAttachment("notes.md", INLINE_LIMIT_BYTES), "inline");
  assert.equal(routeAttachment("huge.log", INLINE_LIMIT_BYTES + 1), "disk");
});

test("extension parsing handles dotless and trailing-dot names", () => {
  assert.equal(fileExt("README"), "");
  assert.equal(fileExt("weird."), "");
  assert.equal(fileExt("a.b.CSV"), "csv");
  assert.equal(routeAttachment("README", 100), "inline");
});

test("note carries path, size and a capped preview", () => {
  const note = buildDataFileNote("/tmp/x/orders.csv", "orders.csv", 2048, ["id,amount", "1,9.99", "2,5.00", "3,1.00"]);
  assert.ok(note.includes("/tmp/x/orders.csv"));
  assert.ok(note.includes("2 KB"));
  assert.ok(note.includes("id,amount"));
  assert.ok(!note.includes("3,1.00")); // only first 3 lines
  const long = buildDataFileNote("/p", "n.csv", 1, ["x".repeat(500)]);
  assert.ok(long.includes("…"));
  assert.ok(!long.includes("x".repeat(300)));
});

test("fmtBytes picks sane units", () => {
  assert.equal(fmtBytes(512), "512 B");
  assert.equal(fmtBytes(2048), "2 KB");
  assert.equal(fmtBytes(3 * 1024 * 1024 + 200_000), "3.2 MB");
});
