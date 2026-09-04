import assert from "node:assert/strict";
import { test } from "node:test";
import { bindParams, toSqlLiteral } from "./params.ts";
import type { Param } from "./model.ts";

const P = (over: Partial<Param> & { name: string }): Param => ({ type: "text", value: null, default: null, ...over });

test("no params leaves the query untouched", () => {
  const r = bindParams("SELECT * FROM t", []);
  assert.equal(r.sql, "SELECT * FROM t");
  assert.deepEqual(r.used, []);
  assert.deepEqual(r.missing, []);
});

test("substitutes a text param as a quoted, escaped literal", () => {
  const r = bindParams("SELECT * FROM t WHERE r = :region", [P({ name: "region", value: "EU'x" })]);
  assert.equal(r.sql, "SELECT * FROM t WHERE r = 'EU''x'");
  assert.deepEqual(r.used, ["region"]);
});

test("substitutes a numeric param bare", () => {
  const r = bindParams("SELECT * FROM t WHERE n > :min", [P({ name: "min", type: "number", value: 42 })]);
  assert.equal(r.sql, "SELECT * FROM t WHERE n > 42");
});

test("null/empty value binds NULL", () => {
  assert.equal(bindParams("x = :p", [P({ name: "p", value: null })]).sql, "x = NULL");
  assert.equal(bindParams("x = :p", [P({ name: "p", value: "" })]).sql, "x = NULL");
});

test("falls back to default when value is absent", () => {
  const r = bindParams("x = :p", [P({ name: "p", value: null, default: "d" })]);
  assert.equal(r.sql, "x = 'd'");
});

test("missing param is reported and left in place", () => {
  const r = bindParams("x = :ghost", []);
  assert.equal(r.sql, "x = :ghost");
  assert.deepEqual(r.missing, ["ghost"]);
  assert.deepEqual(r.used, []);
});

test("param matching is case-insensitive (Exasol identifier folding)", () => {
  const r = bindParams("WHERE a = :Region AND b = :REGION", [P({ name: "region", value: "EU" })]);
  assert.equal(r.sql, "WHERE a = 'EU' AND b = 'EU'");
  assert.deepEqual(r.used, ["region"]); // deduped to the canonical name
});

test("only whole placeholders match, not word-glued colons", () => {
  // `a:b` (no space) and `::` should not be treated as a placeholder.
  const r = bindParams("SELECT time::x, a:region FROM t WHERE c = :region", [P({ name: "region", value: "EU" })]);
  assert.equal(r.sql, "SELECT time::x, a:region FROM t WHERE c = 'EU'");
});

test("finite guard: NaN/Infinity numbers bind NULL", () => {
  assert.equal(toSqlLiteral(Infinity, "number"), "NULL");
  assert.equal(toSqlLiteral(NaN, "number"), "NULL");
  assert.equal(toSqlLiteral(3.5, "number"), "3.5");
});
