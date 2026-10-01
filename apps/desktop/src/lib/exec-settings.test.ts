import assert from "node:assert/strict";
import { test } from "node:test";
import { clampMaxRows } from "./app-settings.ts";
import { execDefaults, maxRowsOptions, splitsFor } from "./exec-settings.ts";

test("max rows accepts any value from 1 to 100,000", () => {
  assert.equal(clampMaxRows(5000), 5000);
  assert.equal(clampMaxRows(1), 1);
  assert.equal(clampMaxRows(0), 1);
  assert.equal(clampMaxRows(-20), 1);
  assert.equal(clampMaxRows(1_000_000), 100_000);
  assert.equal(clampMaxRows(2500.7), 2500);
  assert.equal(clampMaxRows("750"), 750);
  assert.equal(clampMaxRows(""), 5000, "blank keeps the default");
  assert.equal(clampMaxRows("lots"), 5000);
  assert.equal(clampMaxRows(null), 5000);
  assert.equal(clampMaxRows(Number.NaN), 5000);
});

test("run defaults come from the settings, junk keeps the default", () => {
  assert.deepEqual(execDefaults({}), { maxRows: 5000, splitStatements: true, stopOnError: true, stripComments: false });
  assert.deepEqual(execDefaults({ maxRows: 250, splitStatements: false, stopOnError: false, stripComments: true }), {
    maxRows: 250,
    splitStatements: false,
    stopOnError: false,
    stripComments: true,
  });
  assert.equal(execDefaults({ stopOnError: "no" }).stopOnError, true);
});

test("the toolbar always offers the current limit", () => {
  assert.deepEqual(maxRowsOptions(5000), [100, 1000, 5000, 10000, 50000, 100000]);
  assert.deepEqual(maxRowsOptions(1000), [100, 1000, 10000, 50000, 100000], "no duplicate");
  assert.deepEqual(maxRowsOptions(7), [7, 100, 1000, 10000, 50000, 100000]);
});

test("Run Buffer never splits; the others follow the setting", () => {
  assert.equal(splitsFor("buffer", true), false);
  assert.equal(splitsFor("script", true), true);
  assert.equal(splitsFor("script", false), false);
  assert.equal(splitsFor("auto", false), false);
});
