import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_CONN_SETTINGS, confirmsDanger, connSettingPaths, withConnDefaults } from "./conn-settings.ts";

test("stored values win over the defaults, at any depth", () => {
  const s = withConnDefaults({ driver: { queryTimeoutSeconds: 30 }, sqlEditor: { initialSchema: "recent" } });
  assert.equal(s.driver.queryTimeoutSeconds, 30);
  assert.equal(s.driver.connectionPoolSize, 4, "siblings keep their default");
  assert.equal(s.sqlEditor.initialSchema, "recent");
  assert.equal(s.sqlEditor.lossHandling, "reexecute");
});

test("unknown keys are dropped, at the top and nested", () => {
  const s = withConnDefaults({ queryBuilder: { autoJoin: false }, hooks: { connectSql: "SELECT 1", legacy: true } }) as unknown as Record<string, Record<string, unknown>>;
  assert.equal(s.queryBuilder, undefined);
  assert.equal(s.hooks.legacy, undefined);
  assert.equal(s.hooks.connectSql, "SELECT 1");
});

test("malformed values fall back instead of breaking the shape", () => {
  const s = withConnDefaults({ driver: "fast", color: null, physical: [1, 2] });
  assert.deepEqual(s.driver, DEFAULT_CONN_SETTINGS.driver);
  assert.deepEqual(s.color, DEFAULT_CONN_SETTINGS.color);
  assert.deepEqual(s.physical, DEFAULT_CONN_SETTINGS.physical);
  assert.deepEqual(withConnDefaults(undefined), DEFAULT_CONN_SETTINGS);
  assert.deepEqual(withConnDefaults([]), DEFAULT_CONN_SETTINGS);
});

test("an accent stays null or a color; undefined does not erase a default", () => {
  assert.equal(withConnDefaults({ color: { accent: "#10b981" } }).color.accent, "#10b981");
  assert.equal(withConnDefaults({ color: { sqlTabs: undefined } }).color.sqlTabs, true);
});

test("neither the defaults nor the stored object is changed", () => {
  const before = JSON.stringify(DEFAULT_CONN_SETTINGS);
  const raw = { driver: { connectionPoolSize: 8 }, extra: 1 };
  const s = withConnDefaults(raw);
  s.driver.connectionPoolSize = 99;
  assert.equal(JSON.stringify(DEFAULT_CONN_SETTINGS), before);
  assert.deepEqual(raw, { driver: { connectionPoolSize: 8 }, extra: 1 });
});

test("the paths list every setting once", () => {
  const paths = connSettingPaths();
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.includes("color.accent"));
  assert.ok(paths.includes("sqlEditor.initialSchema"));
});

test("Prod always confirms; elsewhere the setting decides", () => {
  assert.equal(confirmsDanger({ env: "prod", readOnly: false, confirmDangerous: false }), true);
  assert.equal(confirmsDanger({ env: "dev", readOnly: false, confirmDangerous: false }), false);
  assert.equal(confirmsDanger({ env: "none", readOnly: false, confirmDangerous: true }), true);
  assert.equal(withConnDefaults({ safety: { env: "prod" } }).safety.readOnly, false);
});
