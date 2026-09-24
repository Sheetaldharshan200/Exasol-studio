import { test } from "node:test";
import assert from "node:assert/strict";
import { lintSql, maskNonCode, type LintCatalog } from "./sql-lint.ts";

const cat = (spec: Record<string, string[]>): LintCatalog => ({
  schemas: new Map(Object.entries(spec).map(([s, ts]) => [s, new Map(ts.map((t) => [t, []]))])),
});

test("mask blanks strings but keeps offsets", () => {
  const sql = "SELECT 'FROM X.Y' FROM A.B";
  const masked = maskNonCode(sql);
  assert.equal(masked.length, sql.length);
  assert.equal(masked.slice(0, 7), "SELECT ");
  assert.ok(!masked.slice(7, 18).includes("FROM"));
  assert.ok(masked.includes("FROM A.B"));
});

test("mask blanks line and block comments but never a newline", () => {
  const masked = maskNonCode("-- FROM X.Y\n/* FROM P.Q */\nSELECT 1");
  assert.ok(!masked.includes("FROM"));
  assert.equal(masked.split("\n").length, 3);
});

test("mask blanks a UDF body but leaves its header readable", () => {
  const sql = "--/\nCREATE OR REPLACE PYTHON3 SCALAR SCRIPT S.F (x DOUBLE)\nRETURNS DOUBLE AS\nfrom nowhere.at.all import x\n/\n";
  const masked = maskNonCode(sql);
  assert.ok(masked.includes("PYTHON3"));
  assert.ok(!masked.includes("nowhere"));
});

test("an escaped quote does not end the string", () => {
  const masked = maskNonCode("SELECT 'it''s FROM X.Y' FROM A.B");
  assert.equal((masked.match(/FROM/g) ?? []).length, 1);
});

test("dialect shapes Exasol rejects are errors", () => {
  const out = lintSql("SELECT * FROM S.T FETCH FIRST 10 ROWS ONLY");
  assert.equal(out.length, 1);
  assert.equal(out[0].severity, "error");
  assert.match(out[0].message, /LIMIT/);
  assert.equal("SELECT * FROM S.T FETCH FIRST 10 ROWS ONLY".slice(out[0].start, out[0].end), "FETCH FIRST");
});

test("SELECT TOP, ISNULL, GETDATE and NOW are each caught", () => {
  for (const sql of ["SELECT TOP 5 a FROM S.T", "SELECT ISNULL(a,0) FROM S.T", "SELECT GETDATE()", "SELECT NOW()"]) {
    assert.equal(lintSql(sql).filter((l) => l.severity === "error").length, 1, sql);
  }
});

test("a dialect shape inside a string or comment is not flagged", () => {
  assert.deepEqual(lintSql("SELECT 'FETCH FIRST' FROM S.T"), []);
  assert.deepEqual(lintSql("-- FETCH FIRST 10 ROWS\nSELECT 1"), []);
});

test("an unknown schema is a warning, a known one is silent", () => {
  const ctx = { catalog: cat({ SALES: ["ORDERS"] }) };
  assert.deepEqual(lintSql("SELECT * FROM SALES.ORDERS", ctx), []);
  const out = lintSql("SELECT * FROM MARKETING.LEADS", ctx);
  assert.equal(out.length, 1);
  assert.equal(out[0].severity, "warning");
  assert.match(out[0].message, /no schema MARKETING/);
});

test("an unknown table inside a known schema is reported at the table", () => {
  const sql = "SELECT * FROM SALES.NOPE";
  const out = lintSql(sql, { catalog: cat({ SALES: ["ORDERS"] }) });
  assert.equal(out.length, 1);
  assert.equal(sql.slice(out[0].start, out[0].end), "NOPE");
  assert.match(out[0].message, /SALES has no table or view NOPE/);
});

test("nothing is checked without a loaded catalog — a blank catalog never cries wolf", () => {
  assert.deepEqual(lintSql("SELECT * FROM WHATEVER.NOPE"), []);
  assert.deepEqual(lintSql("SELECT * FROM WHATEVER.NOPE", { catalog: { schemas: new Map() } }), []);
});

test("a CTE is never underlined, because unqualified names are not checked", () => {
  const ctx = { catalog: cat({ SALES: ["ORDERS"] }) };
  assert.deepEqual(lintSql("WITH recent AS (SELECT 1) SELECT * FROM recent", ctx), []);
});

test("a quoted identifier is left alone — its case is the user's, not ours", () => {
  const ctx = { catalog: cat({ SALES: ["ORDERS"] }) };
  assert.deepEqual(lintSql('SELECT * FROM "mixedCase"."tbl"', ctx), []);
});

test("case and whitespace around the dot do not matter", () => {
  const ctx = { catalog: cat({ SALES: ["ORDERS"] }) };
  assert.deepEqual(lintSql("select * from sales . orders", ctx), []);
});

test("a script language the server does not offer is a warning that lists the real ones", () => {
  const sql = "--/\nCREATE OR REPLACE PYTHON2 SCALAR SCRIPT F (x DOUBLE)\nRETURNS DOUBLE AS\npass\n/\n";
  const out = lintSql(sql, { languages: ["LUA", "PYTHON3", "JAVA"] });
  assert.equal(out.length, 1);
  assert.equal(sql.slice(out[0].start, out[0].end), "PYTHON2");
  assert.match(out[0].message, /does not offer PYTHON2.*JAVA, LUA, PYTHON3/);
});

test("a language the server does offer is silent, and so is an unknown language list", () => {
  const sql = "--/\nCREATE OR REPLACE PYTHON3 SCALAR SCRIPT F (x DOUBLE)\nRETURNS DOUBLE AS\npass\n/\n";
  assert.deepEqual(lintSql(sql, { languages: ["LUA", "PYTHON3"] }), []);
  assert.deepEqual(lintSql(sql), []);
});

test("CREATE SCRIPT with no language named is Lua, which every server has", () => {
  const sql = "--/\nCREATE OR REPLACE SCRIPT F ()\nAS\nprint(1)\n/\n";
  assert.deepEqual(lintSql(sql, { languages: ["LUA", "PYTHON3"] }), []);
});

test("findings come back in buffer order", () => {
  const out = lintSql("SELECT NOW() FROM S.T WHERE x IN (SELECT ISNULL(y,0) FROM S.T)");
  assert.ok(out.length >= 2);
  assert.ok(out.every((l, i) => i === 0 || out[i - 1].start <= l.start));
});

test("an empty buffer is quiet", () => {
  assert.deepEqual(lintSql("", { catalog: cat({ S: ["T"] }), languages: ["LUA"] }), []);
});

// ── Regressions found in review ────────────────────────────────────────────

test("an INDENTED --/ still opens a block, so its body is not linted as SQL", () => {
  // The statement splitter opens a block on a trimmed line; disagreeing here
  // underlined Lua code inside an indented UDF.
  const sql = "  --/\nCREATE LUA SCALAR SCRIPT S.X() RETURNS DECIMAL AS\nfunction run(ctx)\n  local q = [[SELECT TOP 1]]\nend\n/\n";
  assert.deepEqual(lintSql(sql), []);
});

test("a user script named like a missing builtin is not a dialect error", () => {
  assert.deepEqual(lintSql("SELECT S.NOW()"), []);
  assert.deepEqual(lintSql("SELECT S.ISNULL(a, 0) FROM S.T"), []);
  // Unqualified, it really is the builtin Exasol lacks.
  assert.equal(lintSql("SELECT NOW()").length, 1);
});

test("a comment in the header does not supply the language", () => {
  const sql = "--/\nCREATE /* a note */ PYTHON3 SCALAR SCRIPT S.X() RETURNS DECIMAL AS\n\n/\n";
  assert.deepEqual(lintSql(sql, { languages: ["PYTHON3"] }), []);
});

test("the language is underlined where it is written, not where it is mentioned", () => {
  const sql = "--/\n-- FOO is documented here\nCREATE FOO SCALAR SCRIPT S.X() RETURNS DECIMAL AS\n\n/\n";
  const out = lintSql(sql, { languages: ["LUA"] });
  assert.equal(out.length, 1);
  assert.equal(sql.slice(out[0].start, out[0].end), "FOO");
  // The comment's FOO comes first in the buffer; the header's is the one meant.
  assert.ok(out[0].start > sql.indexOf("CREATE"));
});
