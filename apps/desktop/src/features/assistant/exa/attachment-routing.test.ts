import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDataFileNote, buildFolderNote, extractDataFileNotes, fileExt, fmtBytes, INLINE_LIMIT_BYTES, routeAttachment } from "./attachment-routing.ts";

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

test("extractDataFileNotes round-trips what buildDataFileNote emits", () => {
  const a = buildDataFileNote("/tmp/att/customer.csv", "customer.csv", 489_472, ["id,name"]);
  const b = buildDataFileNote("/tmp/att/line item.csv", "line item.csv", 14_890_000);
  const notes = extractDataFileNotes(`prefix\n${a}\n${b}\nload this data`);
  assert.equal(notes.length, 2);
  assert.deepEqual(notes[0], { name: "customer.csv", size: "478 KB", path: "/tmp/att/customer.csv" });
  assert.equal(notes[1].name, "line item.csv");
  assert.equal(notes[1].path, "/tmp/att/line item.csv");
});

test("a folder-relative name adds the subfolder→schema hint; a bare name does not", () => {
  const folder = buildDataFileNote("/tmp/att/datasets_sales_2024.csv", "datasets/sales/2024.csv", 100, ["a,b"]);
  assert.ok(folder.includes("part of an attached folder"));
  assert.ok(folder.includes("immediate parent folder as its Exasol schema"));
  const flat = buildDataFileNote("/tmp/att/orders.csv", "orders.csv", 100, ["a,b"]);
  assert.ok(!flat.includes("part of an attached folder"));
});

test("extractDataFileNotes recovers a folder-relative name (slashes in the name)", () => {
  const note = buildDataFileNote("/tmp/att/datasets_sales_2024.csv", "datasets/sales/2024.csv", 100);
  const [got] = extractDataFileNotes(note);
  assert.equal(got.name, "datasets/sales/2024.csv");
  assert.equal(got.path, "/tmp/att/datasets_sales_2024.csv");
});

test("buildFolderNote lists every file and its pins extract", () => {
  const note = buildFolderNote("datasets", [
    { name: "datasets/sales/2023.csv", size: 2048, path: "/att/datasets_sales_2023.csv" },
    { name: "datasets/sales/2024.csv", size: 1024, path: "/att/datasets_sales_2024.csv" },
    { name: "datasets/customers/list.csv", size: 512, path: "/att/datasets_customers_list.csv" },
  ]);
  assert.ok(note.includes('Attached folder "datasets" with 3 file(s)'));
  assert.ok(note.includes("immediate parent subfolder as the Exasol schema"));
  const pins = extractDataFileNotes(note);
  assert.equal(pins.length, 3);
  assert.equal(pins[0].name, "datasets/sales/2023.csv");
  assert.equal(pins[2].path, "/att/datasets_customers_list.csv");
});

test("extractDataFileNotes ignores unrelated text", () => {
  assert.deepEqual(extractDataFileNotes("load this data"), []);
  assert.deepEqual(extractDataFileNotes(""), []);
});

test("fmtBytes picks sane units", () => {
  assert.equal(fmtBytes(512), "512 B");
  assert.equal(fmtBytes(2048), "2 KB");
  assert.equal(fmtBytes(3 * 1024 * 1024 + 200_000), "3.2 MB");
});
