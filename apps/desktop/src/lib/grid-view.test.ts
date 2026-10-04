import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_COL_WIDTH, MIN_COL_WIDTH, nextSort, resizedWidth, rowWindow, sortOrder } from "./grid-view.ts";

const col = (vals: unknown[]) => vals.map((v) => [v]);

test("numbers sort by value, exact decimals included; NULLs last both ways", () => {
  const rows = col(["10", null, "9", "-1.5", "12345678901234567890"]);
  assert.deepEqual(sortOrder(rows, { col: 0, dir: "asc" }, "DECIMAL(36,2)"), [3, 2, 0, 4, 1]);
  assert.deepEqual(sortOrder(rows, { col: 0, dir: "desc" }, "DECIMAL(36,2)"), [4, 0, 2, 3, 1]);
});

test("text sorts naturally and case-insensitively; numbers-as-text in a text column stay text", () => {
  assert.deepEqual(sortOrder(col(["b", "A", "a10", "a9"]), { col: 0, dir: "asc" }, "VARCHAR(5)"), [1, 3, 2, 0]);
  assert.deepEqual(sortOrder(col(["10", "9"]), { col: 0, dir: "asc" }, "VARCHAR(5)"), [1, 0], "natural order still puts 9 first");
});

test("ties and no sort keep the original order", () => {
  assert.deepEqual(sortOrder(col([1, 1, 1]), { col: 0, dir: "desc" }, "DECIMAL"), [0, 1, 2]);
  assert.deepEqual(sortOrder(col([3, 1]), null), [0, 1]);
  assert.deepEqual(sortOrder([], { col: 0, dir: "asc" }), []);
});

test("numbers and booleans from the driver", () => {
  assert.deepEqual(sortOrder(col([2, 10, 1]), { col: 0, dir: "asc" }), [2, 0, 1]);
  assert.deepEqual(sortOrder(col([true, false]), { col: 0, dir: "asc" }), [1, 0]);
});

test("a header click cycles ascending, descending, off", () => {
  assert.deepEqual(nextSort(null, 2), { col: 2, dir: "asc" });
  assert.deepEqual(nextSort({ col: 2, dir: "asc" }, 2), { col: 2, dir: "desc" });
  assert.equal(nextSort({ col: 2, dir: "desc" }, 2), null);
  assert.deepEqual(nextSort({ col: 1, dir: "desc" }, 2), { col: 2, dir: "asc" });
});

test("rowWindow renders what is visible plus overscan", () => {
  assert.deepEqual(rowWindow(0, 100, 20, 1000, 5), { start: 0, end: 10, top: 0, bottom: 990 * 20 });
  assert.deepEqual(rowWindow(2000, 100, 20, 1000, 5), { start: 95, end: 110, top: 1900, bottom: 890 * 20 });
  assert.deepEqual(rowWindow(1e9, 100, 20, 50, 5), { start: 44, end: 50, top: 880, bottom: 0 }, "scrolled past the end");
  assert.deepEqual(rowWindow(0, 100, 20, 0), { start: 0, end: 0, top: 0, bottom: 0 });
  assert.deepEqual(rowWindow(-50, 100, 0, 10), { start: 0, end: 0, top: 0, bottom: 0 });
});

test("resizedWidth stays within bounds", () => {
  assert.equal(resizedWidth(100, 25.4), 125);
  assert.equal(resizedWidth(100, -500), MIN_COL_WIDTH);
  assert.equal(resizedWidth(100, 1e6), MAX_COL_WIDTH);
});
