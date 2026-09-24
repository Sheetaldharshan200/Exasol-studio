import assert from "node:assert/strict";
import { test } from "node:test";
import { isWrapped, openableSource, sourceQuery, sourceTitle } from "./script-source.ts";

test("a script's source is read from the catalog by schema and name", () => {
  const sql = sourceQuery("script", "ANALYTICS", "MY_UDF");
  assert.match(sql, /FROM SYS\.EXA_ALL_SCRIPTS/);
  assert.match(sql, /SCRIPT_SCHEMA = 'ANALYTICS'/);
  assert.match(sql, /SCRIPT_NAME = 'MY_UDF'/);
});

test("a function reads from its own catalog view", () => {
  const sql = sourceQuery("function", "S", "F");
  assert.match(sql, /FUNCTION_TEXT FROM SYS\.EXA_ALL_FUNCTIONS/);
});

test("a quote in a name is escaped, never injected", () => {
  const sql = sourceQuery("script", "S", "O'BRIEN");
  assert.match(sql, /SCRIPT_NAME = 'O''BRIEN'/);
});

test("a script is wrapped so Run sends it whole", () => {
  // A Java or Python body is full of semicolons; unwrapped, the splitter
  // would send only as far as the first one.
  const out = openableSource("script", "CREATE OR REPLACE JAVA SCALAR SCRIPT F() RETURNS INT AS\nint x = 1;\nreturn x;");
  assert.ok(out.startsWith("--/\n"));
  assert.ok(out.trimEnd().endsWith("\n/"));
});

test("source that already carries the markers is left alone", () => {
  const already = "--/\nCREATE LUA SCALAR SCRIPT F() RETURNS INT AS\nreturn 1\n/";
  assert.equal(openableSource("script", already), `${already}\n`);
  assert.equal(isWrapped(already), true);
  assert.equal(isWrapped("CREATE LUA SCALAR SCRIPT F()"), false);
});

test("a function needs no wrapper", () => {
  const fn = "FUNCTION F (x DOUBLE) RETURN DOUBLE\nBEGIN\n  RETURN x;\nEND F";
  assert.equal(openableSource("function", fn), `${fn}\n`);
});

test("nothing to open yields nothing, not an empty wrapper", () => {
  assert.equal(openableSource("script", ""), "");
  assert.equal(openableSource("script", "   \n "), "");
});

test("the tab is titled where the object lives", () => {
  assert.equal(sourceTitle("ANALYTICS", "MY_UDF"), "ANALYTICS.MY_UDF");
  assert.equal(sourceTitle("", "MY_UDF"), "MY_UDF");
});
