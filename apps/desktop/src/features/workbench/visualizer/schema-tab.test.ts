import assert from "node:assert/strict";
import { test } from "node:test";
import { COMFORTABLE_PX, nameScreenPx, showSchemaTab, tabFontCss, tabFontLimit, tabLabelChars, tabThreshold, TABLE_NAME_PX, zoomVar } from "./schema-tab.ts";

test("zoomed in, the cards carry their own names and the tab stands down", () => {
  assert.equal(showSchemaTab(1), false);
  assert.equal(showSchemaTab(0.8), false);
  assert.equal(showSchemaTab(0.6), false);
});

test("zoomed out, the tab is what tells you which schema you are looking at", () => {
  assert.equal(showSchemaTab(0.5), true);
  assert.equal(showSchemaTab(0.2), true);
  assert.equal(showSchemaTab(0.05), true);
});

test("the handover is exactly where a table name becomes comfortable", () => {
  const t = tabThreshold();
  assert.equal(nameScreenPx(t), COMFORTABLE_PX);
  assert.equal(showSchemaTab(t), false);
  assert.equal(showSchemaTab(t - 0.001), true);
});

test("a larger table name hands over sooner", () => {
  assert.ok(tabThreshold(TABLE_NAME_PX * 2) < tabThreshold(TABLE_NAME_PX));
});

test("the CSS zoom variable never divides by zero", () => {
  assert.equal(zoomVar(0.5), "0.5");
  assert.equal(zoomVar(0), "0.01");
  assert.equal(zoomVar(-3), "0.01");
});

test("the whole name fits, because half a name names nothing", () => {
  // SEMANTIC_AGENT and SEMANTIC_CATALOG both truncate to "SEMANTI…".
  const name = "SEMANTIC_CATALOG";
  const limit = tabFontLimit(900, name.length, 170);
  assert.ok(limit * (name.length * 0.62 + 1.4) <= 900 + 170 * 0.8 + 0.01);
});

test("a small box borrows the gap beside it before shrinking its type", () => {
  const cramped = tabFontLimit(260, "SEMANTIC_ADMIN".length, 0);
  const roomy = tabFontLimit(260, "SEMANTIC_ADMIN".length, 170);
  assert.ok(roomy > cramped, "the gap should buy a larger name");
});

test("a longer name on the same box gets smaller type, not an ellipsis", () => {
  assert.ok(tabFontLimit(600, 20, 170) < tabFontLimit(600, 6, 170));
});

test("a box with no room still yields a usable font", () => {
  assert.ok(tabFontLimit(0, 30, 0) >= 1);
  assert.ok(tabFontLimit(-50, 0, -10) >= 1);
});

test("the tab asks for the constant screen size and accepts the cap", () => {
  assert.equal(tabFontCss(28), "min(calc(13px / var(--vs-zoom)), 28.00px)");
});

test("the tab is measured by its widest line, not just its name", () => {
  // "MYSQL_VS" is 8 characters; "MySQL · 2 tables" is 16 at 0.7 size = 11.2.
  // Sizing by the name alone let the second line run into the next schema.
  assert.ok(tabLabelChars("MYSQL_VS", "MySQL", 2) > "MYSQL_VS".length);
  assert.equal(tabLabelChars("MYSQL_VS", "MySQL", 2), 16 * 0.7);
});

test("a long name still wins over a short second line", () => {
  assert.equal(tabLabelChars("SEMANTIC_CATALOG", undefined, 45), "SEMANTIC_CATALOG".length);
});

test("one table reads in the singular", () => {
  assert.equal(tabLabelChars("X", undefined, 1), "1 table".length * 0.7);
});

test("the widest line is what the font cap is computed from", () => {
  const chars = tabLabelChars("MYSQL_VS", "PostgreSQL", 2);
  const limit = tabFontLimit(260, chars, 170);
  assert.ok(limit * (chars * 0.62 + 1.4) <= 260 + 170 * 0.8 + 0.01);
});
