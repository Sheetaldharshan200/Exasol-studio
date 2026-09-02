import assert from "node:assert/strict";
import { test } from "node:test";
import { isStudioAction, STUDIO_ACTIONS } from "./studio-action-names.ts";

test("the action allow-list is closed — only known names pass", () => {
  assert.ok(isStudioAction("open"));
  assert.ok(isStudioAction("install_component"));
  assert.ok(isStudioAction("uninstall_component"));
  assert.ok(!isStudioAction("rm_rf"));
  assert.ok(!isStudioAction("drop_database"));
  assert.ok(!isStudioAction(""));
});

test("the action set covers the requested verbs", () => {
  for (const v of ["open", "close_tab", "search", "install_component", "uninstall_component", "list_components", "component_status"]) {
    assert.ok(STUDIO_ACTIONS.includes(v as (typeof STUDIO_ACTIONS)[number]), `missing ${v}`);
  }
});
