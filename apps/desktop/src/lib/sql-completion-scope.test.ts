import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogName, currentStatement, qualifierBefore, sqlName, tableRefs } from "./sql-completion-scope.ts";

test("a name is quoted exactly when Exasol would not read it back unquoted", () => {
  assert.equal(sqlName("ORDERS"), "ORDERS");
  assert.equal(sqlName("ORDER_ITEMS_2"), "ORDER_ITEMS_2");
  assert.equal(sqlName("MyTable"), '"MyTable"', "mixed case");
  assert.equal(sqlName("order"), '"order"');
  assert.equal(sqlName("ORDER"), '"ORDER"', "a reserved word");
  assert.equal(sqlName("Year Total"), '"Year Total"');
  assert.equal(sqlName('A"B'), '"A""B"');
  assert.equal(sqlName("1ST"), '"1ST"');
});

test("written names map to catalog spelling", () => {
  assert.equal(catalogName("orders"), "ORDERS");
  assert.equal(catalogName('"MyTable"'), "MyTable");
  assert.equal(catalogName('"A""B"'), 'A"B');
});

test("the statement under the caret ignores semicolons in strings and comments", () => {
  assert.equal(currentStatement("SELECT 1; SELECT * FROM t WHERE a = 'x;y' AND "), "SELECT * FROM t WHERE a = 'x;y' AND ");
  assert.equal(currentStatement("SELECT 1 -- a; b\nFROM t "), "SELECT 1 -- a; b\nFROM t ");
  assert.equal(currentStatement("SELECT 1;"), "", "after a real end, a new statement");
  assert.equal(currentStatement("SELECT 1;  "), "");
  assert.equal(currentStatement(""), "");
  assert.equal(currentStatement("SELECT x -- note;\n"), "SELECT x -- note;\n", "a semicolon in a trailing comment does not end it");
});

test("tables named by a statement, with aliases, quoting and comma joins", () => {
  const r = tableRefs('SELECT o. FROM retail.orders o, "Retail"."Line Items" AS li JOIN products p ON p.id = li.pid WHERE');
  assert.deepEqual(r.get("O"), { schema: "RETAIL", table: "ORDERS" });
  assert.deepEqual(r.get("LI"), { schema: "Retail", table: "Line Items" });
  assert.deepEqual(r.get("Line Items"), { schema: "Retail", table: "Line Items" });
  assert.deepEqual(r.get("P"), { schema: "", table: "PRODUCTS" });
  assert.equal(r.has("ON"), false);
  assert.equal(r.has("WHERE"), false);
});

test("a subquery in FROM and keywords after a table are not tables", () => {
  const r = tableRefs("SELECT * FROM (SELECT 1) x, t WHERE a = 1");
  assert.equal(r.size, 0, "the list stops at the subquery");
  const u = tableRefs("UPDATE s.t SET a = 1");
  assert.deepEqual([...u.keys()], ["T"], "SET is not an alias");
  assert.deepEqual([...tableRefs("INSERT INTO s.t VALUES (1)").keys()], ["T"]);
});

test("the qualifier right before the word being typed", () => {
  assert.equal(qualifierBefore("SELECT o."), "O");
  assert.equal(qualifierBefore('SELECT "Line Items".'), "Line Items");
  assert.equal(qualifierBefore("SELECT retail . "), null, "space after the dot: not a qualifier of this word");
  assert.equal(qualifierBefore("SELECT o"), null);
});
