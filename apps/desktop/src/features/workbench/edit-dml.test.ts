import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDml, lit, qualify, type DmlInput } from "./edit-dml.ts";

const COLS = [
  { name: "ID", typeName: "DECIMAL(18,0)" },
  { name: "NAME", typeName: "VARCHAR(50)" },
  { name: "ACTIVE", typeName: "BOOLEAN" },
];
const ROWS = [
  [1, "Ada", true],
  [2, "Grace", false],
];
const base = (over: Partial<DmlInput> = {}): DmlInput => ({
  schema: "S",
  table: "T",
  columns: COLS,
  rows: ROWS,
  identity: ["ID"],
  edits: {},
  deleted: new Set<number>(),
  inserts: [],
  ...over,
});

test("a literal is typed: numbers bare, text quoted, booleans upper", () => {
  assert.equal(lit(5, "DECIMAL(9,0)"), "5");
  assert.equal(lit("5", "VARCHAR(10)"), "'5'");
  assert.equal(lit("true", "BOOLEAN"), "TRUE");
  assert.equal(lit("12x", "DECIMAL(9,0)"), "'12x'");
});

test("a quote in a value is escaped, not injected", () => {
  assert.equal(lit("O'Brien", "VARCHAR(20)"), "'O''Brien'");
  assert.equal(lit("'; DROP TABLE T; --", "VARCHAR(50)"), "'''; DROP TABLE T; --'");
});

test("null, undefined and empty all mean NULL", () => {
  for (const v of [null, undefined, ""]) assert.equal(lit(v, "VARCHAR(10)"), "NULL");
});

test("a table is qualified only when it has a schema", () => {
  assert.equal(qualify("S", "T"), '"S"."T"');
  assert.equal(qualify(undefined, "T"), '"T"');
});

test("an edited cell becomes one UPDATE keyed on the primary key", () => {
  const sql = buildDml(base({ edits: { 1: { 1: "Hopper" } } }));
  assert.deepEqual(sql, [`UPDATE "S"."T" SET "NAME" = 'Hopper' WHERE "ID" = 2;`]);
});

test("several cells of one row become one UPDATE", () => {
  const sql = buildDml(base({ edits: { 0: { 1: "A", 2: "false" } } }));
  assert.deepEqual(sql, [`UPDATE "S"."T" SET "NAME" = 'A', "ACTIVE" = FALSE WHERE "ID" = 1;`]);
});

test("a deleted row is not also updated", () => {
  const sql = buildDml(base({ edits: { 0: { 1: "A" } }, deleted: new Set([0]) }));
  assert.deepEqual(sql, [`DELETE FROM "S"."T" WHERE "ID" = 1;`]);
});

test("without a primary key the identity is every column", () => {
  const sql = buildDml(base({ identity: ["ID", "NAME", "ACTIVE"], deleted: new Set([1]) }));
  assert.deepEqual(sql, [`DELETE FROM "S"."T" WHERE "ID" = 2 AND "NAME" = 'Grace' AND "ACTIVE" = FALSE;`]);
});

test("generated SQL uses the catalog's spelling of a column", () => {
  const sql = buildDml(base({ catalogColumns: ["id", "name", "active"], edits: { 0: { 1: "A" } } }));
  assert.deepEqual(sql, [`UPDATE "S"."T" SET "name" = 'A' WHERE "id" = 1;`]);
});

test("a staged row writes only the cells that were filled in", () => {
  const sql = buildDml(base({ inserts: [{ values: { NAME: "Linus" } }] }));
  assert.deepEqual(sql, [`INSERT INTO "S"."T" ("NAME") VALUES ('Linus');`]);
});

test("a cloned NULL is written as NULL, not left to the column default", () => {
  const sql = buildDml(base({ inserts: [{ values: { ID: "9", NAME: null } }] }));
  assert.deepEqual(sql, [`INSERT INTO "S"."T" ("ID", "NAME") VALUES (9, NULL);`]);
});

test("an empty staged row inserts a row of defaults instead of nothing", () => {
  const sql = buildDml(base({ inserts: [{ values: {} }] }));
  assert.deepEqual(sql, [`INSERT INTO "S"."T" DEFAULT VALUES;`]);
});

test("updates come before deletes, deletes before inserts", () => {
  const sql = buildDml(base({ edits: { 0: { 1: "A" } }, deleted: new Set([1]), inserts: [{ values: { ID: "3" } }] }));
  assert.deepEqual(sql.map((s) => s.split(" ")[0]), ["UPDATE", "DELETE", "INSERT"]);
});

test("a change staged against a row that is gone is dropped, not mis-targeted", () => {
  const sql = buildDml(base({ rows: [], edits: { 0: { 1: "A" } }, deleted: new Set([1]) }));
  assert.deepEqual(sql, []);
});

test("an edit entry with no cells produces no statement", () => {
  assert.deepEqual(buildDml(base({ edits: { 0: {} } })), []);
});
