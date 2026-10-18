import assert from "node:assert/strict";
import { test } from "node:test";
import { nullLabel } from "./null-label.ts";

test("NULL shows as the setting says", () => {
  assert.equal(nullLabel(undefined), "null");
  assert.equal(nullLabel(42), "null");
  assert.equal(nullLabel("<NULL>"), "<NULL>");
  assert.equal(nullLabel(""), "", "an empty setting shows nothing");
  assert.equal(nullLabel("x".repeat(40)).length, 20);
});
