import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultMapping, mapsEverything } from "./load-mapping.ts";

test("table columns take the file column of the same name, in any case or spacing", () => {
  assert.deepEqual(defaultMapping(["order id", "Amount", "note"], ["AMOUNT", "ORDER_ID", "CREATED"]), [1, 0, null]);
  assert.deepEqual(defaultMapping([], ["A"]), [null]);
  assert.deepEqual(defaultMapping(["A", "a"], ["A"]), [0], "the first of duplicate names");
});

test("mapsEverything says whether any column would be NULL", () => {
  assert.equal(mapsEverything([0, 1]), true);
  assert.equal(mapsEverything([0, null]), false);
  assert.equal(mapsEverything([]), true);
});
