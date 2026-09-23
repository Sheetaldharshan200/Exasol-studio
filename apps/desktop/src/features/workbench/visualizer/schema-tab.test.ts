import assert from "node:assert/strict";
import { test } from "node:test";
import { COMFORTABLE_PX, nameScreenPx, showSchemaTab, tabThreshold, TABLE_NAME_PX, zoomVar } from "./schema-tab.ts";

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
