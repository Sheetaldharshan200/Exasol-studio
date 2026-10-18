import { test } from "node:test";
import assert from "node:assert/strict";
import { SIGNATURES, activeParam, callAtCaret, cteNames, endsInCode, functionHover, identifierEndAt, signatureLabel, tableAtEnd, tableHover } from "./sql-signatures.ts";
import { emptyCatalog } from "./sql-completion.ts";

test("callAtCaret finds the innermost call and the argument", () => {
  assert.deepEqual(callAtCaret("SELECT to_char(d, "), { name: "TO_CHAR", arg: 1 });
  assert.deepEqual(callAtCaret("SELECT COALESCE(a, NVL(b, "), { name: "NVL", arg: 1 });
  assert.deepEqual(callAtCaret("SELECT COALESCE(a, NVL(b, c), "), { name: "COALESCE", arg: 2 });
  assert.deepEqual(callAtCaret("SELECT ROUND ("), { name: "ROUND", arg: 0 });
});

test("callAtCaret ignores commas and parentheses in strings, names and comments", () => {
  assert.deepEqual(callAtCaret("SELECT REPLACE('a,(b', "), { name: "REPLACE", arg: 1 });
  assert.deepEqual(callAtCaret('SELECT SUBSTR("x,(", '), { name: "SUBSTR", arg: 1 });
  assert.deepEqual(callAtCaret("SELECT LPAD(a, -- x, (\n "), { name: "LPAD", arg: 1 });
  assert.deepEqual(callAtCaret("SELECT LPAD(a, /* ,( */ "), { name: "LPAD", arg: 1 });
  assert.deepEqual(callAtCaret("SELECT LPAD('it''s', "), { name: "LPAD", arg: 1 });
});

test("callAtCaret is null outside a call, in a string or comment, or in a bare parenthesis", () => {
  assert.equal(callAtCaret(""), null);
  assert.equal(callAtCaret("SELECT a, b"), null);
  assert.equal(callAtCaret("SELECT UPPER(a)"), null);
  assert.equal(callAtCaret("SELECT UPPER('a, "), null);
  assert.equal(callAtCaret("SELECT UPPER(a -- b, "), null);
  assert.equal(callAtCaret("SELECT COALESCE(a, (b + "), null);
  assert.equal(callAtCaret("SELECT a) , ("), null);
});

test("callAtCaret does not take a schema-qualified UDF for a built-in", () => {
  assert.equal(callAtCaret("SELECT MY_SCHEMA.ROUND("), null);
});

test("activeParam stays on the repeating parameter past the list", () => {
  assert.equal(activeParam(SIGNATURES.COALESCE, 0), 0);
  assert.equal(activeParam(SIGNATURES.COALESCE, 1), 1);
  assert.equal(activeParam(SIGNATURES.COALESCE, 5), 1);
  assert.equal(activeParam(SIGNATURES.TO_CHAR, 2), 2);
  assert.equal(activeParam(SIGNATURES.TO_CHAR, 7), 2);
  assert.equal(activeParam(SIGNATURES.ROW_NUMBER, 0), 0);
  assert.equal(activeParam(SIGNATURES.HASH_MD5, 4), 0);
});

test("every signature names its parameters, and repeats only after a named one", () => {
  for (const [name, sig] of Object.entries(SIGNATURES)) {
    assert.ok(sig.doc.length > 0, name);
    assert.notEqual(sig.params[0], "...", name);
  }
  assert.equal(signatureLabel("NVL", SIGNATURES.NVL), "NVL(expr1, expr2)");
});

test("functionHover is case-insensitive and null for unknown names", () => {
  assert.match(functionHover("add_days")!, /^`ADD_DAYS\(datetime, days\)`/);
  assert.equal(functionHover("MY_UDF"), null);
});

test("tableHover lists columns, and needs a unique table without a schema", () => {
  const cat = emptyCatalog();
  cat.schemas.set("S", new Map([["T", [{ name: "ID", type: "DECIMAL(18,0)" }]], ["E", []]]));
  cat.schemas.set("R", new Map([["T", []]]));
  cat.loaded = new Set(["S"]);
  assert.match(tableHover(cat, "S", "T")!, /\*\*S\.T\*\* — 1 column\n\n- `ID` DECIMAL\(18,0\)/);
  assert.equal(tableHover(cat, null, "T"), null, "ambiguous");
  assert.equal(tableHover(cat, "R", "T"), "**R.T**", "columns not loaded yet");
  assert.equal(tableHover(cat, "S", "E"), "**S.E**\n\nNo columns.");
  assert.equal(tableHover(cat, "S", "NOPE"), null);
});

test("tableHover cuts a long column list", () => {
  const cat = emptyCatalog();
  cat.schemas.set("S", new Map([["W", Array.from({ length: 30 }, (_, i) => ({ name: `C${i}`, type: "INT" }))]]));
  const md = tableHover(cat, null, "W")!;
  assert.match(md, /30 columns/);
  assert.match(md, /… 5 more$/);
  assert.equal(md.split("\n- `").length - 1, 25);
});

test("callAtCaret sees a qualifier across spaces and quotes", () => {
  assert.equal(callAtCaret("SELECT MY_SCHEMA . ROUND("), null);
  assert.equal(callAtCaret('SELECT "My Schema".ROUND('), null);
});

test("DECODE cycles search and result; RANDOM takes both bounds or none", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((a) => activeParam(SIGNATURES.DECODE, a)), [0, 1, 2, 1, 2, 1]);
  assert.equal(signatureLabel("RANDOM", SIGNATURES.RANDOM), "RANDOM([min, max])");
});

test("identifierEndAt spans quoted names whole and skips strings", () => {
  const line = `SELECT * FROM s."Mixed Case" WHERE x = 'a b'`;
  assert.equal(identifierEndAt(line, line.indexOf("Case")), line.indexOf(" WHERE"));
  assert.equal(identifierEndAt(line, 14), 15, "the schema s");
  assert.equal(identifierEndAt(line, line.indexOf("a b")), -1);
  assert.equal(identifierEndAt(line, 6), -1, "a space");
});

test("tableAtEnd names a table only where one is named", () => {
  assert.deepEqual(tableAtEnd("SELECT * FROM s.t"), { schema: "S", table: "T" });
  assert.deepEqual(tableAtEnd('SELECT * FROM s."Mixed Case"'), { schema: "S", table: "Mixed Case" });
  assert.deepEqual(tableAtEnd("SELECT * FROM a JOIN b"), { schema: "", table: "B" });
  assert.deepEqual(tableAtEnd("SELECT * FROM a, s . b"), { schema: "S", table: "B" });
  assert.deepEqual(tableAtEnd("INSERT INTO t"), { schema: "", table: "T" });
  assert.equal(tableAtEnd("SELECT t"), null, "a column");
  assert.equal(tableAtEnd("SELECT * FROM t WHERE t"), null, "a column named like the table");
  assert.equal(tableAtEnd("SELECT a, t"), null);
  assert.equal(tableAtEnd(""), null);
});

test("a qualifier is seen however far before the call", () => {
  assert.equal(callAtCaret(`SELECT s.${" ".repeat(300)}ROUND(`), null);
  assert.deepEqual(callAtCaret(`SELECT ${" ".repeat(300)}ROUND(`), { name: "ROUND", arg: 0 });
});

test("endsInCode is false inside strings, quoted names and comments", () => {
  assert.equal(endsInCode("SELECT ROUND"), true);
  assert.equal(endsInCode("SELECT 'ROUND"), false);
  assert.equal(endsInCode('SELECT "ROUND'), false);
  assert.equal(endsInCode("SELECT 1 -- FROM T"), false);
  assert.equal(endsInCode("SELECT 1 /* T"), false);
  assert.equal(endsInCode("SELECT 1 /* x */ FROM T"), true);
});

test("a WITH query shadows a table of the same name", () => {
  assert.deepEqual([...cteNames('WITH a AS (SELECT 1), "B c" (x) AS (SELECT 2) SELECT * FROM a')], ["A", "B c"]);
  assert.equal(tableAtEnd("WITH t AS (SELECT 1) SELECT * FROM t"), null);
  assert.deepEqual(tableAtEnd("WITH t AS (SELECT 1) SELECT * FROM s.t"), { schema: "S", table: "T" });
  assert.equal(cteNames("SELECT * FROM t, u").size, 0);
});
