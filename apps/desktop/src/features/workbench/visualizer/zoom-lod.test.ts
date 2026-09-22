import assert from "node:assert/strict";
import { test } from "node:test";
import { farZoomThreshold, isFarZoom, LEGIBLE_ROW_PX, rowScreenPx, zoomVar } from "./zoom-lod.ts";

const ROW_H = 26;

test("cards stay detailed while a row is still legible", () => {
  assert.equal(isFarZoom(1, ROW_H), false);
  assert.equal(isFarZoom(0.5, ROW_H), false);
  assert.equal(isFarZoom(0.3, ROW_H), false);
  // Zoomed well out, the cards are still what the user wants to see.
  assert.equal(isFarZoom(0.2, ROW_H), false);
});

test("the map takes over only once a row is a hairline", () => {
  assert.equal(isFarZoom(0.1, ROW_H), true);
  assert.equal(isFarZoom(0.05, ROW_H), true);
});

test("the threshold is exactly where a row reaches the legible height", () => {
  const t = farZoomThreshold(ROW_H);
  assert.equal(rowScreenPx(t, ROW_H), LEGIBLE_ROW_PX);
  assert.equal(isFarZoom(t, ROW_H), false);
  assert.equal(isFarZoom(t - 0.001, ROW_H), true);
});

test("a taller row stays readable further out", () => {
  assert.ok(farZoomThreshold(52) < farZoomThreshold(26));
});

test("the CSS zoom variable never divides by zero", () => {
  assert.equal(zoomVar(0.5), "0.5");
  assert.equal(zoomVar(0), "0.01");
  assert.equal(zoomVar(-1), "0.01");
});
