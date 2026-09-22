import test from "node:test";
import assert from "node:assert/strict";
import { suggestNextActions } from "./next-actions.ts";

const ctx = { tables: ["RETAIL.ORDERS", "RETAIL.CUSTOMERS"] };

test("a SELECT in a sql fence → run, open, explain (in that order, max three)", () => {
  const reply = "Here you go:\n```sql\nSELECT city, SUM(amount) FROM RETAIL.ORDERS GROUP BY city;\n```\nThat groups by city.";
  const acts = suggestNextActions(reply, ctx);
  assert.deepEqual(acts.map((a) => a.kind), ["run-sql", "open-sql", "explain-plan"]);
  assert.match((acts[0] as { sql: string }).sql, /^SELECT city/);
});

test("DDL in a fence → only open in editor (never auto-run a CREATE)", () => {
  const acts = suggestNextActions("```sql\nCREATE TABLE T (ID INT);\n```", ctx);
  assert.deepEqual(acts.map((a) => a.kind), ["open-sql"]);
});

test("an error with a code block → Fix it", () => {
  const acts = suggestNextActions("The query failed:\n```\n[42000] syntax error, unexpected IDENTIFIER\n```", ctx);
  assert.deepEqual(acts.map((a) => a.kind), ["fix"]);
});

test("a time-series markdown table → chart + dashboard; table mentions → visualize", () => {
  const reply = "Revenue by month:\n\n| month | revenue |\n|---|---|\n| 2025-01 | 10 |\n| 2025-02 | 12 |\n\nFrom RETAIL.ORDERS joined with RETAIL.CUSTOMERS.";
  const acts = suggestNextActions(reply, ctx);
  assert.deepEqual(acts.map((a) => a.kind), ["chart", "dashboard", "visualize"]);
  assert.deepEqual((acts[2] as { tables: string[] }).tables, ["RETAIL.ORDERS", "RETAIL.CUSTOMERS"]);
});

test("a non-time table does not suggest a chart; plain prose suggests nothing", () => {
  const reply = "| name | city |\n|---|---|\n| Acme | Berlin |\n| Globex | London |";
  assert.deepEqual(suggestNextActions(reply, ctx), []);
  assert.deepEqual(suggestNextActions("Sure — what would you like to know?", ctx), []);
});
