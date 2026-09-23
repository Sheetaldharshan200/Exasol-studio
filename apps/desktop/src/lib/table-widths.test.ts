import assert from "node:assert/strict";
import { test } from "node:test";
import { pairWidths, scrollbarGutter, totalWidth } from "./table-widths.ts";

test("a column is as wide as whichever needs more room, its name or its values", () => {
  assert.deepEqual(pairWidths([40, 200, 60], [30, 120, 90]), [40, 200, 90]);
});

test("equal widths stay put", () => {
  assert.deepEqual(pairWidths([50, 50], [50, 50]), [50, 50]);
});

test("a mismatched column count is refused rather than misaligned", () => {
  // The body renders one full-width cell when there are no rows to show.
  assert.equal(pairWidths([40, 200, 60], [300]), null);
  assert.equal(pairWidths([40, 200], []), null);
});

test("nothing measured yet means no fixed layout", () => {
  assert.equal(pairWidths([], []), null);
});

test("a zero width means the table was not laid out yet", () => {
  assert.equal(pairWidths([40, 0], [40, 80]), null);
  assert.equal(pairWidths([40, 80], [40, 0]), null);
});

test("the total is what both tables are set to", () => {
  assert.equal(totalWidth([40, 200, 90]), 330);
  assert.equal(totalWidth([]), 0);
});

test("an overlay scrollbar takes no width, so the header gives back nothing", () => {
  assert.equal(scrollbarGutter(800, 800), 0);
});

test("a classic scrollbar's width is what the header must give back", () => {
  assert.equal(scrollbarGutter(800, 785), 15);
});

test("a box measured before layout never yields a negative gutter", () => {
  assert.equal(scrollbarGutter(0, 0), 0);
  assert.equal(scrollbarGutter(100, 120), 0);
});
