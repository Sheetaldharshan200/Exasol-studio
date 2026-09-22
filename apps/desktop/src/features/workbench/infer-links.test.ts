import test from "node:test";
import assert from "node:assert/strict";
import { inferLinks, normaliseKey, singular, typeFamily } from "./infer-links.ts";
import type { GraphTable } from "../../lib/ipc.ts";

const T = (name: string, cols: [string, string, boolean?][]): GraphTable => ({
  name,
  columns: cols.map(([n, dt, pk]) => ({ name: n, dataType: dt, pk: Boolean(pk) })),
});
const DEC = "DECIMAL(18,0)";
const key = (l: { source: string; sourceColumn: string; target: string; targetColumn: string }) => `${l.source}.${l.sourceColumn}>${l.target}.${l.targetColumn}`;

test("singular and normalisation follow the rules people actually use in schemas", () => {
  assert.equal(singular("ORDERS"), "ORDER");
  assert.equal(singular("CITIES"), "CITY");
  assert.equal(singular("ADDRESSES"), "ADDRESS");
  assert.equal(singular("BOXES"), "BOX");
  assert.equal(singular("STATUS"), "STATUS");
  assert.equal(singular("CLASS"), "CLASS");
  assert.equal(normaliseKey("FK_CUSTOMER_KEY"), "CUSTOMER");
  assert.equal(normaliseKey("O_CUSTKEY"), "CUSTKEY");
  assert.equal(normaliseKey("customer_id"), "CUSTOMERID");
  assert.equal(typeFamily("VARCHAR(36) UTF8"), "text");
  assert.equal(typeFamily("DECIMAL(18,0)"), "number");
  assert.equal(typeFamily("TIMESTAMP"), "other");
});

test("energy schema: the same key name in a composite-key child is a strong link", () => {
  const tables = [T("ENERGY_METERS", [["METER_ID", DEC, true], ["SITE", "VARCHAR(50)"]]), T("ENERGY_READINGS", [["METER_ID", DEC, true], ["TS", "TIMESTAMP", true], ["KWH", "DOUBLE"]])];
  const links = inferLinks(tables, []);
  assert.deepEqual(links.map(key), ["ENERGY_READINGS.METER_ID>ENERGY_METERS.METER_ID"]);
  assert.equal(links[0].score, 1);
  assert.equal(links[0].reason, "same key name");
});

test("naming convention: CUSTOMER_ID → CUSTOMERS.ID and camelCase customerId → CUSTOMERS.ID", () => {
  const tables = [T("CUSTOMERS", [["ID", DEC, true], ["NAME", "VARCHAR(50)"]]), T("ORDERS", [["ID", DEC, true], ["CUSTOMER_ID", DEC], ["customerId", DEC]])];
  const links = inferLinks(tables, []);
  assert.deepEqual(links.map(key).sort(), ["ORDERS.CUSTOMER_ID>CUSTOMERS.ID", "ORDERS.customerId>CUSTOMERS.ID"]);
  for (const l of links) {
    assert.equal(l.score, 0.9);
    assert.equal(l.reason, "naming convention");
  }
});

test("generic ID everywhere links nothing; a VARCHAR id never matches a DECIMAL key", () => {
  const generic = [T("EVENTS", [["ID", DEC, true], ["USER_ID", "VARCHAR(36)"]]), T("USERS", [["ID", DEC, true]]), T("SESSIONS", [["ID", DEC, true]])];
  assert.deepEqual(inferLinks(generic, []), []);
});

test("TPC-H prefixes: O_CUSTKEY → CUSTOMER.C_CUSTKEY through normalisation, at 0.7", () => {
  const tables = [T("CUSTOMER", [["C_CUSTKEY", DEC, true], ["C_NAME", "VARCHAR(25)"]]), T("ORDERS", [["O_ORDERKEY", DEC, true], ["O_CUSTKEY", DEC]])];
  const links = inferLinks(tables, []);
  assert.deepEqual(links.map(key), ["ORDERS.O_CUSTKEY>CUSTOMER.C_CUSTKEY"]);
  assert.equal(links[0].score, 0.7);
  assert.equal(links[0].reason, "normalised name");
});

test("declared foreign keys are not re-inferred; a child's own sole PK is not a reference", () => {
  const tables = [T("CUSTOMERS", [["CUSTOMER_ID", DEC, true]]), T("ORDERS", [["ORDER_ID", DEC, true], ["CUSTOMER_ID", DEC]]), T("CUSTOMER_ARCHIVE", [["CUSTOMER_ID", DEC, true]])];
  const declared = [{ source: "ORDERS", sourceColumn: "CUSTOMER_ID", target: "CUSTOMERS", targetColumn: "CUSTOMER_ID" }];
  const links = inferLinks(tables, declared, { minScore: 0 });
  assert.ok(!links.some((l) => key(l) === "ORDERS.CUSTOMER_ID>CUSTOMERS.CUSTOMER_ID"), "declared pair skipped");
  assert.ok(!links.some((l) => l.source === "CUSTOMER_ARCHIVE" && l.sourceColumn === "CUSTOMER_ID" && l.target === "CUSTOMERS" && !l.ambiguous), "a sole PK does not reference another PK of the same name outright");
});

test("ambiguity: one column matching two parents halves both and hides them at the default threshold", () => {
  const tables = [T("NATIONS", [["NATION_KEY", DEC, true]]), T("NATION_HISTORY", [["NATION_KEY", DEC, true], ["VALID_FROM", "DATE", true]]), T("SUPPLIERS", [["SUPPLIER_ID", DEC, true], ["NATION_KEY", DEC]])];
  const strict = inferLinks(tables, []);
  // The history table's own composite key still references NATIONS (that is
  // unambiguous); only the SUPPLIERS column is torn between two parents.
  assert.deepEqual(strict.map(key), ["NATION_HISTORY.NATION_KEY>NATIONS.NATION_KEY"], "0.5 and 0.4 both fall under 0.6");
  const loose = inferLinks(tables, [], { minScore: 0.3 });
  const sup = loose.filter((l) => l.source === "SUPPLIERS");
  assert.equal(sup.length, 2);
  assert.ok(sup.every((l) => l.ambiguous));
  assert.deepEqual(sup.map((l) => l.score).sort(), [0.4, 0.5], "the composite-key parent scores lower");
});

test("results are sorted strongest first, deterministic on ties", () => {
  const tables = [T("A", [["A_ID", DEC, true]]), T("B", [["B_ID", DEC, true], ["A_ID", DEC]]), T("C", [["C_ID", DEC, true], ["A_ID", DEC], ["B_ID", DEC]])];
  const links = inferLinks(tables, []);
  assert.deepEqual(links.map(key), ["B.A_ID>A.A_ID", "C.A_ID>A.A_ID", "C.B_ID>B.B_ID"]);
});

test("tables carrying an id (SCHEMA.TABLE) are linked by id, so two schemas can hold the same table name", () => {
  const tables = [
    { ...T("CUSTOMERS", [["ID", DEC, true]]), id: "PG.CUSTOMERS" },
    { ...T("CUSTOMERS", [["ID", DEC, true]]), id: "ARCHIVE.CUSTOMERS" },
    { ...T("sales", [["id", DEC, true], ["customer_id", DEC]]), id: "MY.sales" },
  ];
  const links = inferLinks(tables, [], { minScore: 0.3 });
  const targets = links.filter((l) => l.source === "MY.sales").map((l) => l.target).sort();
  assert.deepEqual(targets, ["ARCHIVE.CUSTOMERS", "PG.CUSTOMERS"], "both parents found by convention, by id");
  assert.ok(links.every((l) => l.ambiguous), "and marked ambiguous, since two parents claim the column");
});
