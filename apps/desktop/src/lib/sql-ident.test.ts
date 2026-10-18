import assert from "node:assert/strict";
import { test } from "node:test";
import { qualify, quoteIdent } from "./sql-ident.ts";

test("names are quoted with embedded quotes doubled", () => {
  assert.equal(quoteIdent("T"), '"T"');
  assert.equal(quoteIdent('a"b'), '"a""b"');
  assert.equal(quoteIdent('x"; DROP TABLE t; --'), '"x""; DROP TABLE t; --"');
  assert.equal(quoteIdent(""), '""');
});

test("qualify adds the schema when there is one", () => {
  assert.equal(qualify("S", "T"), '"S"."T"');
  assert.equal(qualify(undefined, "T"), '"T"');
  assert.equal(qualify(null, "T"), '"T"');
  assert.equal(qualify("", "T"), '"T"');
  assert.equal(qualify('My "S"', "Mixed Case"), '"My ""S"""."Mixed Case"');
});
