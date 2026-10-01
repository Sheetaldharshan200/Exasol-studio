import assert from "node:assert/strict";
import { test } from "node:test";
import { sqlBehindGrid } from "./run-meta.ts";

test("the grid refreshes from the statement that ran, not the buffer", () => {
  const buffer = "DELETE FROM t WHERE x = 1;\nSELECT * FROM t;";
  assert.equal(sqlBehindGrid({ sql: buffer, runMeta: { sql: "SELECT * FROM t" } }), "SELECT * FROM t");
  assert.equal(sqlBehindGrid({ sql: "SELECT 1", runMeta: { sql: "   " } }), "SELECT 1", "an empty record falls back");
  assert.equal(sqlBehindGrid({ sql: "SELECT 1" }), "SELECT 1");
  assert.equal(sqlBehindGrid({ sql: "SELECT 1", runMeta: null }), "SELECT 1");
});
