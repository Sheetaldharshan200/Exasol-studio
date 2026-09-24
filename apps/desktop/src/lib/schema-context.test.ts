import { test } from "node:test";
import assert from "node:assert/strict";
import { schemaContextLines, type ContextCatalog } from "./schema-context.ts";

const cols = (n: number, prefix = "C") => Array.from({ length: n }, (_, i) => ({ name: `${prefix}${i}`, type: "DOUBLE" }));
const cat = (spec: Record<string, Record<string, { name: string; type: string }[]>>): ContextCatalog => ({
  schemas: new Map(Object.entries(spec).map(([s, ts]) => [s, new Map(Object.entries(ts))])),
});

test("every column is written as schema.table.column type", () => {
  const out = schemaContextLines(cat({ SALES: { ORDERS: [{ name: "ID", type: "DECIMAL(18,0)" }] } }));
  assert.equal(out, "SALES.ORDERS.ID DECIMAL(18,0)");
});

test("an empty catalog is an empty string, not a stray newline", () => {
  assert.equal(schemaContextLines(cat({})), "");
  assert.equal(schemaContextLines(cat({ SALES: {} })), "");
});

test("the budget stops at a whole table, never half of one", () => {
  const out = schemaContextLines(cat({ S: { A: cols(6), B: cols(6), C: cols(6) } }), 10);
  // A alone fits; adding B would exceed 10, so B and C are left out entirely.
  assert.deepEqual(out.split("\n").map((l) => l.split(".")[1]), Array(6).fill("A"));
});

test("a single table larger than the whole budget is truncated rather than dropped", () => {
  // Something is better than nothing when one table is all there is.
  const out = schemaContextLines(cat({ S: { BIG: cols(50) } }), 10);
  assert.equal(out.split("\n").length, 10);
});

test("tables come in catalog order, so the same catalog gives the same prompt", () => {
  const c = cat({ S: { A: cols(1, "a"), B: cols(1, "b") }, T: { C: cols(1, "c") } });
  assert.equal(schemaContextLines(c), schemaContextLines(c));
  assert.deepEqual(schemaContextLines(c).split("\n"), ["S.A.a0 DOUBLE", "S.B.b0 DOUBLE", "T.C.c0 DOUBLE"]);
});
