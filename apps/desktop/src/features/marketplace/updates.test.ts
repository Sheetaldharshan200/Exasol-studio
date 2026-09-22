import assert from "node:assert/strict";
import { test } from "node:test";
import { isNewerVersion } from "./updates.ts";

test("isNewerVersion: strictly-newer only, tolerant of v-prefix, rejects non-numeric", () => {
  assert.equal(isNewerVersion("1.2.0", "1.1.9"), true);
  assert.equal(isNewerVersion("v2.0.0", "1.9.9"), true);
  assert.equal(isNewerVersion("1.2.0", "1.2.0"), false); // equal
  assert.equal(isNewerVersion("1.1.0", "1.2.0"), false); // older
  assert.equal(isNewerVersion("main", "1.0.0"), false); // non-numeric
  assert.equal(isNewerVersion(null, "1.0.0"), false);
  assert.equal(isNewerVersion("1.0.0", undefined), false);
});
