import { test } from "node:test";
import assert from "node:assert/strict";
import { hexToHsv, hsvToHex } from "./color.ts";

test("hexToHsv handles primaries, extremes, and shorthand", () => {
  assert.deepEqual(hexToHsv("#ff0000"), { h: 0, s: 1, v: 1 });
  assert.deepEqual(hexToHsv("#00ff00"), { h: 120, s: 1, v: 1 });
  assert.deepEqual(hexToHsv("#0000ff"), { h: 240, s: 1, v: 1 });
  assert.deepEqual(hexToHsv("#000000"), { h: 0, s: 0, v: 0 });
  assert.deepEqual(hexToHsv("#ffffff"), { h: 0, s: 0, v: 1 });
  assert.deepEqual(hexToHsv("#f00"), { h: 0, s: 1, v: 1 }); // shorthand
  assert.deepEqual(hexToHsv("ff0000"), { h: 0, s: 1, v: 1 }); // no hash
});

test("hexToHsv rejects invalid input", () => {
  assert.equal(hexToHsv(""), null);
  assert.equal(hexToHsv("#12345"), null);
  assert.equal(hexToHsv("#gggggg"), null);
  assert.equal(hexToHsv("red"), null);
});

test("hsvToHex renders primaries and clamps out-of-range inputs", () => {
  assert.equal(hsvToHex(0, 1, 1), "#ff0000");
  assert.equal(hsvToHex(120, 1, 1), "#00ff00");
  assert.equal(hsvToHex(240, 1, 1), "#0000ff");
  assert.equal(hsvToHex(0, 0, 1), "#ffffff");
  assert.equal(hsvToHex(0, 0, 0), "#000000");
  assert.equal(hsvToHex(360, 1, 1), "#ff0000"); // wraps
  assert.equal(hsvToHex(-120, 1, 1), "#0000ff"); // negative wraps
  assert.equal(hsvToHex(0, 2, 2), "#ff0000"); // clamped
});

test("hex → hsv → hex round-trips exactly", () => {
  for (const hex of ["#82dd4b", "#e9a94f", "#5fd0c0", "#6db3f2", "#0b1730", "#9d9da6", "#c700c7"]) {
    const hsv = hexToHsv(hex);
    assert.ok(hsv, hex);
    assert.equal(hsvToHex(hsv!.h, hsv!.s, hsv!.v), hex);
  }
});
