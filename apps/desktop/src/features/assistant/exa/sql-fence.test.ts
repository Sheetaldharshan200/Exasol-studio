import assert from "node:assert/strict";
import { test } from "node:test";
import { lastLocateFence, lastSqlFence } from "./sql-fence.ts";
import { buildChipMarkers, extractContextPins } from "./context.ts";

test("lastSqlFence returns the LAST non-empty sql block", () => {
  const text = "First:\n```sql\nSELECT 1\n```\nBetter:\n```sql\nCREATE SCHEMA TPCH_IMPORT;\n```\ndone";
  assert.equal(lastSqlFence(text), "CREATE SCHEMA TPCH_IMPORT;");
});

test("lastSqlFence ignores empty fences, other languages, and no-fence text", () => {
  assert.equal(lastSqlFence("```sql\n\n```"), null);
  assert.equal(lastSqlFence("```json\n{}\n```"), null);
  assert.equal(lastSqlFence("no code here"), null);
  assert.equal(lastSqlFence("```SQL\nSELECT 2\n```"), "SELECT 2"); // case-insensitive tag
});

test("chip markers round-trip through extraction", () => {
  const markers = buildChipMarkers([
    { id: "tab", providerId: "tab", label: "Query 3", body: "..." },
    { id: "q", providerId: "query", label: "multi\nline label", body: "..." },
  ]);
  const pins = extractContextPins(`prefix\n${markers}\nwrite a query`);
  assert.deepEqual(pins, [
    { providerId: "tab", label: "Query 3" },
    { providerId: "query", label: "multi line label" },
  ]);
});

test("extractContextPins ignores unrelated and malformed lines", () => {
  assert.deepEqual(extractContextPins("load this data"), []);
  assert.deepEqual(extractContextPins("[pinned-context] nolabel"), []);
  assert.deepEqual(extractContextPins("[pinned-context] tab |   "), []);
});

test("lastLocateFence parses the final locate JSON; garbage returns null", () => {
  const text = 'Found it.\n```locate\n{"schema": "SAMPLE", "table": "PART", "column": "P_PARTKEY"}\n```';
  assert.deepEqual(lastLocateFence(text), { schema: "SAMPLE", table: "PART", column: "P_PARTKEY" });
  assert.equal(lastLocateFence("no fence"), null);
  assert.equal(lastLocateFence("```locate\nnot json\n```"), null);
  assert.equal(lastLocateFence('```locate\n{"column": "X"}\n```'), null); // table required
  assert.deepEqual(lastLocateFence('```locate\n{"table": "T", "schema": "  "}\n```'), { table: "T", schema: undefined, column: undefined });
});
