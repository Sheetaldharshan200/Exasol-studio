import test from "node:test";
import assert from "node:assert/strict";
import { buildSql, linkKey, previewSql } from "./build-sql.ts";

const link = { source: "RETAIL.ORDERS", sourceColumn: "CUSTOMER_ID", target: "RETAIL.CUSTOMERS", targetColumn: "ID" };
const base = { links: [link], whereSql: "", orderKey: null, orderDir: "ASC" as const, limit: null };

test("nothing picked → a hint, not SQL", () => {
  assert.match(buildSql({ ...base, picked: [] }), /^-- Tick columns/);
});

test("one table: every identifier quoted, schema-qualified, lower-case names preserved", () => {
  const sql = buildSql({ ...base, picked: ["RETAIL.trips.tpep_pickup_datetime", "RETAIL.trips.fare"], limit: 100 });
  assert.equal(sql, 'SELECT\n  "RETAIL"."trips"."tpep_pickup_datetime",\n  "RETAIL"."trips"."fare"\nFROM "RETAIL"."trips"\nLIMIT 100;');
});

test("two linked tables join on the link; an unlinked one from another schema cross-joins with its own schema", () => {
  const sql = buildSql({ ...base, picked: ["RETAIL.ORDERS.ID", "RETAIL.CUSTOMERS.NAME", "GEO.REGIONS.NAME"] });
  assert.match(sql, /\nJOIN "RETAIL"."CUSTOMERS" ON "RETAIL"."ORDERS"."CUSTOMER_ID" = "RETAIL"."CUSTOMERS"."ID"\n/);
  assert.match(sql, /\nCROSS JOIN "GEO"."REGIONS"/);
});

test("a LEFT join type applies to that link only", () => {
  const sql = buildSql({ ...base, picked: ["RETAIL.ORDERS.ID", "RETAIL.CUSTOMERS.NAME"], joinTypes: { [linkKey(link)]: "LEFT" } });
  assert.match(sql, /\nLEFT JOIN "RETAIL"."CUSTOMERS" ON/);
});

test("WHERE is skipped for the builder's empty group, ORDER BY and LIMIT are appended in order", () => {
  const sql = buildSql({ ...base, picked: ["RETAIL.ORDERS.ID"], whereSql: "(1 = 1)", orderKey: "RETAIL.ORDERS.ID", orderDir: "DESC", limit: 5 });
  assert.equal(sql, 'SELECT\n  "RETAIL"."ORDERS"."ID"\nFROM "RETAIL"."ORDERS"\nORDER BY "RETAIL"."ORDERS"."ID" DESC\nLIMIT 5;');
  const withWhere = buildSql({ ...base, picked: ["RETAIL.ORDERS.ID"], whereSql: '("RETAIL"."ORDERS"."AMOUNT" > 10)' });
  assert.match(withWhere, /\nWHERE \("RETAIL"."ORDERS"."AMOUNT" > 10\)/);
});

test("aggregates add an alias and an automatic GROUP BY over the plain picks", () => {
  const sql = buildSql({
    ...base,
    picked: ["RETAIL.CUSTOMERS.CITY", "RETAIL.ORDERS.AMOUNT", "RETAIL.ORDERS.ID"],
    aggregates: { "RETAIL.ORDERS.AMOUNT": "SUM", "RETAIL.ORDERS.ID": "COUNT" },
    orderKey: "RETAIL.ORDERS.AMOUNT",
    orderDir: "DESC",
  });
  assert.match(sql, /SELECT\n  "RETAIL"."CUSTOMERS"."CITY",\n  SUM\("RETAIL"."ORDERS"."AMOUNT"\) AS "SUM_AMOUNT",\n  COUNT\("RETAIL"."ORDERS"."ID"\) AS "COUNT_ID"\n/);
  assert.match(sql, /\nGROUP BY "RETAIL"."CUSTOMERS"."CITY"\n/);
  assert.match(sql, /\nORDER BY SUM\("RETAIL"."ORDERS"."AMOUNT"\) DESC;$/);
});

test("all picks aggregated → no GROUP BY at all", () => {
  const sql = buildSql({ ...base, picked: ["RETAIL.ORDERS.AMOUNT"], aggregates: { "RETAIL.ORDERS.AMOUNT": "AVG" } });
  assert.doesNotMatch(sql, /GROUP BY/);
  assert.match(sql, /AVG\("RETAIL"."ORDERS"."AMOUNT"\) AS "AVG_AMOUNT"/);
});

test("a cross-schema link joins a virtual schema's table to a local one, each with its own schema", () => {
  const cross = { source: "MYSQL_VS.sales", sourceColumn: "customer_id", target: "RETAIL.CUSTOMERS", targetColumn: "ID" };
  const sql = buildSql({ ...base, links: [cross], picked: ["RETAIL.CUSTOMERS.NAME", "MYSQL_VS.sales.qty"] });
  assert.match(sql, /FROM "RETAIL"."CUSTOMERS"\nJOIN "MYSQL_VS"."sales" ON "MYSQL_VS"."sales"."customer_id" = "RETAIL"."CUSTOMERS"."ID"/);
});

test("previewSql forces LIMIT 100 whether or not the statement already had a limit or a semicolon", () => {
  assert.equal(previewSql('SELECT 1\nFROM "S"."T"\nLIMIT 1000;'), 'SELECT 1\nFROM "S"."T"\nLIMIT 100;');
  assert.equal(previewSql('SELECT 1\nFROM "S"."T"'), 'SELECT 1\nFROM "S"."T"\nLIMIT 100;');
  assert.equal(previewSql('SELECT 1\nFROM "S"."T" limit 5 ;'), 'SELECT 1\nFROM "S"."T"\nLIMIT 100;');
  assert.equal(previewSql("SELECT 'LIMIT 9' AS X FROM DUAL;"), "SELECT 'LIMIT 9' AS X FROM DUAL\nLIMIT 100;", "a LIMIT inside a literal is not the trailing clause");
});
