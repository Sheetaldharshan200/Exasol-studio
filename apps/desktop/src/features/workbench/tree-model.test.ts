import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleFolders } from "./tree-folders.ts";

test("system schemas show unless the setting turns them off", () => {
  assert.deepEqual(visibleFolders(), ["schemas", "virtual", "system", "dba"], "shown by default");
  assert.deepEqual(visibleFolders({ showSystemSchemas: true }), ["schemas", "virtual", "system", "dba"]);
  assert.deepEqual(visibleFolders({ showSystemSchemas: false }), ["schemas", "virtual", "dba"], "user schemas stay");
});
