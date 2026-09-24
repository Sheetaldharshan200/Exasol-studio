import assert from "node:assert/strict";
import { test } from "node:test";
import { findProblems } from "./sql-diagnostics.ts";

const messages = (sql: string) => findProblems(sql).map((p) => p.message);

test("valid SQL is never underlined", () => {
  for (const sql of [
    "SELECT 1;",
    "SELECT 'a string' FROM T;",
    "SELECT \"Quoted Name\" FROM T;",
    "SELECT 1; SELECT 2;",
    "/* a comment */ SELECT 1;",
    "-- a line comment\nSELECT 1;",
    "SELECT f(g(1), 2) FROM T;",
    "SELECT 'it''s escaped' FROM T;",
  ]) {
    assert.deepEqual(findProblems(sql), [], sql);
  }
});

test("a string left open is reported where it opened", () => {
  const sql = "SELECT 'unclosed FROM T";
  const [p] = findProblems(sql);
  assert.match(p.message, /string is never closed/);
  assert.equal(sql.slice(p.start, p.end), "'");
});

test("a quoted name left open is reported", () => {
  assert.match(messages('SELECT "unclosed FROM T')[0], /quoted name is never closed/);
});

test("a block comment that runs off the end is reported", () => {
  assert.match(messages("SELECT 1; /* never ends")[0], /comment is never closed/);
});

test("a script block with no terminator is reported", () => {
  const sql = "--/\nCREATE LUA SCALAR SCRIPT F() RETURNS INT AS\nreturn 1\n";
  assert.match(messages(sql)[0], /script block is never closed/);
});

test("a closed script block is fine, semicolons and all", () => {
  const sql = "--/\nCREATE JAVA SCALAR SCRIPT F() RETURNS INT AS\nint x = 1;\nreturn x;\n/\n";
  assert.deepEqual(findProblems(sql), []);
});

test("a bracket left open is reported", () => {
  assert.match(messages("SELECT f(1, 2 FROM T")[0], /bracket is never closed/);
});

test("brackets inside a script body are the other language's business", () => {
  const sql = "--/\nCREATE PYTHON3 SCALAR SCRIPT F() RETURNS INT AS\ndef run(ctx):\n    return (1\n/\n";
  assert.deepEqual(findProblems(sql), []);
});

test("a bracket in a string or a comment is text, not a bracket", () => {
  assert.deepEqual(findProblems("SELECT '(' FROM T;"), []);
  assert.deepEqual(findProblems("-- (\nSELECT 1;"), []);
  assert.deepEqual(findProblems("/* ( */ SELECT 1;"), []);
});

test("a quote inside a comment does not open a string", () => {
  assert.deepEqual(findProblems("-- it's fine\nSELECT 1;"), []);
  assert.deepEqual(findProblems("/* it's fine */ SELECT 1;"), []);
});

test("each statement's brackets stand on their own", () => {
  // An unclosed bracket in one statement must not be blamed on the next.
  assert.equal(findProblems("SELECT f(1; SELECT 2;").length, 1);
});

test("problems come back in the order they appear", () => {
  const out = findProblems("SELECT f(1, 'oops");
  assert.ok(out.length >= 2);
  assert.ok(out[0].start < out[1].start);
});

test("an indented script block is a block, so its body is not bracket-checked", () => {
  // The statement splitter opens a block on a trimmed line; disagreeing here
  // reported the Lua body's brackets as never closed.
  const sql = "  --/\n  CREATE LUA SCALAR SCRIPT S.X() RETURNS DECIMAL AS\n  function run(ctx)\n    return f((1)\n  end\n  /\n";
  assert.deepEqual(findProblems(sql), []);
});
