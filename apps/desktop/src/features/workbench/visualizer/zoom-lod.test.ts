import assert from "node:assert/strict";
import { test } from "node:test";
import { farZoomThreshold, isFarZoom, LEGIBLE_ROW_PX, nameFontCss, nameFontLimit, rowScreenPx, zoomVar } from "./zoom-lod.ts";

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

test("a long name on a narrow box is capped by the box's width", () => {
  // "POSTGRESQL_VS" on a two-table box: at a constant screen size this name
  // used to run over the schemas beside it.
  const limit = nameFontLimit(260, 400, "POSTGRESQL_VS".length);
  assert.ok(limit * "POSTGRESQL_VS".length * 0.62 <= 260 + 0.01, `name would overflow: ${limit}`);
});

test("a short name on a wide box is capped by the box's height instead", () => {
  assert.ok(Math.abs(nameFontLimit(2000, 100, "TPCH".length) - 29) < 0.01);
});

test("the whole label fits the box: both lines, its padding and its top margin", () => {
  // 1.15 (name) + 0.35 (gap) + 0.71 (sub) + 0.7 (padding) + 0.4 (top margin).
  for (const h of [56, 120, 400, 900]) {
    assert.ok(nameFontLimit(5000, h, 4) * 3.31 <= h, `label overflows a ${h}-tall box`);
  }
});

test("a box with no room still yields a usable font, never zero or negative", () => {
  assert.ok(nameFontLimit(0, 0, 10) >= 1);
  assert.ok(nameFontLimit(10, 10, 0) >= 1);
});

test("a bigger box allows a bigger name", () => {
  assert.ok(nameFontLimit(900, 900, 8) > nameFontLimit(300, 300, 8));
});

test("the font asks for the constant screen size but accepts the cap", () => {
  assert.equal(nameFontCss(42, 15), "min(calc(15px / var(--vs-zoom)), 42.00px)");
});
