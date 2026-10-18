import assert from "node:assert/strict";
import { test } from "node:test";
import { expandedChildren, visibleFolders } from "./tree-folders.ts";

test("system schemas show unless the setting turns them off", () => {
  assert.deepEqual(visibleFolders(), ["schemas", "virtual", "system", "dba"], "shown by default");
  assert.deepEqual(visibleFolders({ showSystemSchemas: true }), ["schemas", "virtual", "system", "dba"]);
  assert.deepEqual(visibleFolders({ showSystemSchemas: false }), ["schemas", "virtual", "dba"], "user schemas stay");
});

test("a refresh reloads only the fresh children that were expanded", () => {
  const fresh = [{ id: "s:A" }, { id: "s:NEW" }];
  assert.deepEqual(expandedChildren(fresh, new Set(["s:A", "s:DROPPED"])), [{ id: "s:A" }], "dropped ones are gone, new ones stay collapsed");
  assert.deepEqual(expandedChildren([], new Set(["s:A"])), []);
  assert.deepEqual(expandedChildren(fresh, new Set()), []);
});
