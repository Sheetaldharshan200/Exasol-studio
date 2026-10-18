import assert from "node:assert/strict";
import { test } from "node:test";
import { isSqlFile, pushRecent } from "./recent-files.ts";

test("the newest file goes first, once, and the list stays capped", () => {
  assert.deepEqual(pushRecent(["/a.sql", "/b.sql"], "/b.sql"), ["/b.sql", "/a.sql"]);
  assert.deepEqual(pushRecent([], "/a.sql"), ["/a.sql"]);
  assert.deepEqual(pushRecent(["/1", "/2", "/3"], "/4", 3), ["/4", "/1", "/2"]);
  assert.deepEqual(pushRecent(["/a.sql"], "  "), ["/a.sql"], "an empty path is ignored");
});

test("only .sql and .txt files open from a drop", () => {
  assert.equal(isSqlFile("/q/Report.SQL"), true);
  assert.equal(isSqlFile("C:\\q\\notes.txt"), true);
  assert.equal(isSqlFile("/q/data.csv"), false);
  assert.equal(isSqlFile("/q/sql"), false);
});
