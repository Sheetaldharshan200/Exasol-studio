import assert from "node:assert/strict";
import { test } from "node:test";
import { buildUdfSql, DEFAULT_UDF_SPEC, parseScriptLanguages, type UdfSpec } from "./udf-builder.ts";

const spec = (over: Partial<UdfSpec> = {}): UdfSpec => ({ ...DEFAULT_UDF_SPEC, ...over });

test("Python scalar wraps in the --/ … / block with a runnable stub", () => {
  const sql = buildUdfSql(spec());
  assert.ok(sql.startsWith("--/\n"));
  assert.ok(sql.trimEnd().endsWith("\n/"));
  assert.ok(sql.includes("CREATE OR REPLACE PYTHON3 SCALAR SCRIPT MY_UDF (X DOUBLE)"));
  assert.ok(sql.includes("RETURNS DOUBLE AS"));
  assert.ok(sql.includes("def run(ctx):"));
  assert.ok(sql.includes("return ctx.X"));
});

test("SET emits an EMITS clause and an iterating body", () => {
  const sql = buildUdfSql(spec({ kind: "SET", returns: "n DOUBLE", name: "rollup" }));
  assert.ok(sql.includes("PYTHON3 SET SCRIPT ROLLUP"));
  assert.ok(sql.includes("EMITS (n DOUBLE) AS"));
  assert.ok(sql.includes("ctx.emit("));
  assert.ok(sql.includes("ctx.next()"));
});

test("names fold to upper unless quoted; bad chars sanitized", () => {
  assert.ok(buildUdfSql(spec({ name: "my score" })).includes("SCRIPT MY_SCORE "));
  assert.ok(buildUdfSql(spec({ name: '"keepCase"' })).includes('SCRIPT "keepCase" '));
  assert.ok(buildUdfSql(spec({ name: "" })).includes("SCRIPT MY_UDF "));
});

test("empty params → empty parens; blank param rows dropped", () => {
  assert.ok(buildUdfSql(spec({ params: [] })).includes("MY_UDF ()"));
  const sql = buildUdfSql(spec({ params: [{ name: "a", type: "DOUBLE" }, { name: "", type: "VARCHAR(9)" }] }));
  assert.ok(sql.includes("(A DOUBLE)"));
  assert.ok(!sql.includes("VARCHAR(9)"));
});

test("each language produces its own skeleton", () => {
  assert.ok(buildUdfSql(spec({ lang: "LUA" })).includes("function run(ctx)"));
  assert.ok(buildUdfSql(spec({ lang: "JAVA", name: "sc" })).includes("class SC {"));
  assert.ok(buildUdfSql(spec({ lang: "R" })).includes("run <- function(ctx)"));
});

test("orReplace toggles CREATE vs CREATE OR REPLACE", () => {
  assert.ok(buildUdfSql(spec({ orReplace: false })).includes("\nCREATE PYTHON3"));
  assert.ok(!buildUdfSql(spec({ orReplace: false })).includes("OR REPLACE"));
});

test("parseScriptLanguages: DB aliases + always Lua; new languages appear", () => {
  const langs = parseScriptLanguages("PYTHON3=localzmq/... JAVA=builtin_java R=builtin_r");
  const ids = langs.map((l) => l.id).sort();
  assert.deepEqual(ids, ["JAVA", "LUA", "PYTHON3", "R"]);
  // A newly-installed SLC alias flows through with no code change.
  assert.ok(parseScriptLanguages("PYTHON3=x JULIA=y").some((l) => l.id === "JULIA"));
  assert.equal(parseScriptLanguages("PYTHON3=x JULIA=y").find((l) => l.id === "PYTHON3")?.label, "Python");
});

test("parseScriptLanguages: empty/null still yields Lua (always built in)", () => {
  assert.deepEqual(parseScriptLanguages(null).map((l) => l.id), ["LUA"]);
  assert.deepEqual(parseScriptLanguages("").map((l) => l.id), ["LUA"]);
});
