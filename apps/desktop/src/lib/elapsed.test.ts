import assert from "node:assert/strict";
import { test } from "node:test";
import { formatClock, formatElapsed } from "./elapsed.ts";

test("formatElapsed scales its unit with the duration", () => {
  assert.equal(formatElapsed(0), "0.0s");
  assert.equal(formatElapsed(437), "0.4s");
  assert.equal(formatElapsed(59_949), "59.9s");
  assert.equal(formatElapsed(65_000), "1m 05s");
  assert.equal(formatElapsed(3_720_000), "1h 02m");
});

test("formatElapsed never shows a negative clock skew", () => {
  assert.equal(formatElapsed(-5000), "0.0s");
});

test("formatClock is zero-padded local time", () => {
  const d = new Date(2026, 8, 22, 9, 5, 3);
  assert.equal(formatClock(d.getTime()), "09:05:03");
});
