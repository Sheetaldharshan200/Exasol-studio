import test from "node:test";
import assert from "node:assert/strict";
import { buildSql, linkKey, previewSql } from "./build-sql.ts";

const link = { source: "ORDERS", sourceColumn: "CUSTOMER_ID", target: "CUSTOMERS", targetColumn: "ID" };
const base = { schema: "RETAIL", links: [link], whereSql: "", orderKey: null, orderDir: "ASC" as const, limit: null };

test("nothing picked → a hint, not SQL", () => {
  assert.match(buildSql({ ...base, picked: [] }), /^-- Tick columns/);
});

test("one table: every identifier quoted, lower-case names preserved", () => {
  const sql = buildSql({ ...base, picked: ["trips.tpep_pickup_datetime", "trips.fare"], limit: 100 });
  assert.equal(sql, 'SELECT\n  "trips"."tpep_pickup_datetime",\n  "trips"."fare"\nFROM "RETAIL"."trips"\nLIMIT 100;');
});

test("two linked tables join on the link; an unlinked one cross-joins", () => {
  const sql = buildSql({ ...base, picked: ["ORDERS.ID", "CUSTOMERS.NAME", "REGIONS.NAME"] });
  assert.match(sql, /\nJOIN "RETAIL"."CUSTOMERS" ON "ORDERS"."CUSTOMER_ID" = "CUSTOMERS"."ID"\n/);
  assert.match(sql, /\nCROSS JOIN "RETAIL"."REGIONS"/);
});

test("a LEFT join type applies to that link only", () => {
  const sql = buildSql({ ...base, picked: ["ORDERS.ID", "CUSTOMERS.NAME"], joinTypes: { [linkKey(link)]: "LEFT" } });
  assert.match(sql, /\nLEFT JOIN "RETAIL"."CUSTOMERS" ON/);
});

test("WHERE is skipped for the builder's empty group, ORDER BY and LIMIT are appended in order", () => {
  const sql = buildSql({ ...base, picked: ["ORDERS.ID"], whereSql: "(1 = 1)", orderKey: "ORDERS.ID", orderDir: "DESC", limit: 5 });
  assert.equal(sql, 'SELECT\n  "ORDERS"."ID"\nFROM "RETAIL"."ORDERS"\nORDER BY "ORDERS"."ID" DESC\nLIMIT 5;');
  const withWhere = buildSql({ ...base, picked: ["ORDERS.ID"], whereSql: '("ORDERS"."AMOUNT" > 10)' });
  assert.match(withWhere, /\nWHERE \("ORDERS"."AMOUNT" > 10\)/);
});

test("aggregates add an alias and an automatic GROUP BY over the plain picks", () => {
  const sql = buildSql({ ...base, picked: ["CUSTOMERS.CITY", "ORDERS.AMOUNT", "ORDERS.ID"], aggregates: { "ORDERS.AMOUNT": "SUM", "ORDERS.ID": "COUNT" }, orderKey: "ORDERS.AMOUNT", orderDir: "DESC" });
  assert.match(sql, /SELECT\n  "CUSTOMERS"."CITY",\n  SUM\("ORDERS"."AMOUNT"\) AS "SUM_AMOUNT",\n  COUNT\("ORDERS"."ID"\) AS "COUNT_ID"\n/);
  assert.match(sql, /\nGROUP BY "CUSTOMERS"."CITY"\n/);
  assert.match(sql, /\nORDER BY SUM\("ORDERS"."AMOUNT"\) DESC;$/);
});

test("all picks aggregated → no GROUP BY at all", () => {
  const sql = buildSql({ ...base, picked: ["ORDERS.AMOUNT"], aggregates: { "ORDERS.AMOUNT": "AVG" } });
  assert.doesNotMatch(sql, /GROUP BY/);
  assert.match(sql, /AVG\("ORDERS"."AMOUNT"\) AS "AVG_AMOUNT"/);
});

test("previewSql forces LIMIT 100 whether or not the statement already had a limit or a semicolon", () => {
  assert.equal(previewSql('SELECT 1\nFROM "S"."T"\nLIMIT 1000;'), 'SELECT 1\nFROM "S"."T"\nLIMIT 100;');
  assert.equal(previewSql('SELECT 1\nFROM "S"."T"'), 'SELECT 1\nFROM "S"."T"\nLIMIT 100;');
  assert.equal(previewSql('SELECT 1\nFROM "S"."T" limit 5 ;'), 'SELECT 1\nFROM "S"."T"\nLIMIT 100;');
  assert.equal(previewSql("SELECT 'LIMIT 9' AS X FROM DUAL;"), "SELECT 'LIMIT 9' AS X FROM DUAL\nLIMIT 100;", "a LIMIT inside a literal is not the trailing clause");
});
