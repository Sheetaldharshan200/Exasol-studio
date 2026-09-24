import assert from "node:assert/strict";
import { test } from "node:test";
import { asRule, headerStateFor, languageRule, embeddedLanguageId, UDF_BODY_STATE, UDF_HEADER_STATE, withUdfEmbedding, type MonarchLanguage } from "./sql-udf-embedding.ts";

const KNOWN = ["lua", "python", "java", "r"];
const base = (): MonarchLanguage => ({ ignoreCase: true, tokenizer: { root: [[/x/, "keyword"]], other: [] } });

test("Exasol's language words map to the grammars Monaco actually has", () => {
  assert.equal(embeddedLanguageId("LUA", KNOWN), "lua");
  assert.equal(embeddedLanguageId("java", KNOWN), "java");
  assert.equal(embeddedLanguageId("R", KNOWN), "r");
});

test("every PYTHON version is Monaco's one python grammar", () => {
  assert.equal(embeddedLanguageId("PYTHON3", KNOWN), "python");
  assert.equal(embeddedLanguageId("PYTHON", KNOWN), "python");
  // A version Exasol has not shipped yet must not need an edit here.
  assert.equal(embeddedLanguageId("PYTHON4", KNOWN), "python");
});

test("a language Monaco cannot tokenize leaves the body as it was", () => {
  assert.equal(embeddedLanguageId("scala", KNOWN), null);
  assert.equal(embeddedLanguageId("", KNOWN), null);
  assert.equal(embeddedLanguageId("   ", KNOWN), null);
});

test("the base grammar is left untouched", () => {
  const original = base();
  const before = JSON.stringify(original.tokenizer.root);
  withUdfEmbedding(original);
  assert.equal(JSON.stringify(original.tokenizer.root), before);
});

test("the marker rule comes before SQL's own comment rules", () => {
  const patched = withUdfEmbedding(base());
  const first = patched.tokenizer.root[0] as [RegExp, { next: string }];
  assert.match("--/", first[0]);
  assert.equal(first[1].next, `@${UDF_HEADER_STATE}`);
  // and the original rules are still there, after it
  assert.equal(patched.tokenizer.root.length, 2);
});

test("each language gets a rule naming its own id, in Monaco's spelling", () => {
  // The capture would substitute "LUA", and Monaco's id is "lua" — that
  // mismatch is why no keyword in a body was ever coloured.
  const [pattern, action] = languageRule("lua");
  assert.equal(action.next, `@${headerStateFor("lua")}`);
  assert.match("CREATE OR REPLACE LUA SCALAR SCRIPT F(a DOUBLE) RETURNS DOUBLE AS", pattern);
  assert.equal(asRule("lua")[1].nextEmbedded, "lua");
});

test("every PYTHON version reaches Monaco's one python grammar", () => {
  const [pattern] = languageRule("python");
  assert.equal(asRule("python")[1].nextEmbedded, "python");
  assert.match("CREATE PYTHON3 SET SCRIPT F(a INT) EMITS (b INT) AS", pattern);
  assert.match("CREATE PYTHON SCALAR SCRIPT F() RETURNS INT AS", pattern);
  // A version Exasol has not shipped yet needs no edit here.
  assert.match("CREATE PYTHON4 SCALAR SCRIPT F() RETURNS INT AS", pattern);
});

test("the language word counts only where a language may stand", () => {
  const [pattern] = languageRule("lua");
  assert.doesNotMatch("SELECT LUA FROM T", pattern);
  // A Lua script NAMED java must not be coloured as Java.
  assert.doesNotMatch('CREATE SCRIPT "JAVA" AS', languageRule("java")[0]);
  assert.doesNotMatch("CREATE LUA SCRIPT JAVA AS", languageRule("java")[0]);
});

test("the body begins at the header's AS, not at the language word", () => {
  // Embedding from the language word handed `SCRIPT s AS` to Python.
  const [pattern] = asRule("python");
  assert.match("CREATE PYTHON3 SCRIPT s AS", pattern);
  assert.match("AS", pattern);
  // AS in the middle of a line does not end the header.
  assert.doesNotMatch("CREATE PYTHON3 SCRIPT s AS -- go", pattern);
});

test("a header spanning several lines still reaches its body", () => {
  // `AS` on its own line below the language used to leave the body unstyled.
  const states = withUdfEmbedding(base(), ["python"]).tokenizer;
  const perLang = states[headerStateFor("python")] as [RegExp, { nextEmbedded?: string }][];
  const enter = perLang.find((r) => Array.isArray(r) && r[1]?.nextEmbedded === "python");
  assert.ok(enter, "the per-language header state can reach the body");
  assert.match("AS", enter![0]);
});

test("CREATE SCRIPT with no language named falls back to Lua, as Exasol does", () => {
  const header = withUdfEmbedding(base(), ["lua", "python"]).tokenizer[UDF_HEADER_STATE] as [RegExp, { next?: string }][];
  const fallback = header.find((r) => Array.isArray(r) && r[1]?.next === `@${headerStateFor("lua")}` && /SCRIPT/.test(String(r[0])));
  assert.ok(fallback, "a plain SCRIPT keyword enters the Lua header state");
});

test("the header state carries one rule per language given, and each gets its own state", () => {
  const patched = withUdfEmbedding(base(), ["lua", "python", "java", "r"]);
  const rules = patched.tokenizer[UDF_HEADER_STATE] as unknown[];
  const found = rules.filter((r) => Array.isArray(r) && String((r[1] as { next?: string })?.next ?? "").startsWith(`@${UDF_HEADER_STATE}_`));
  // Four languages plus the no-language fallback into Lua.
  assert.equal(found.length, 5);
  for (const id of ["lua", "python", "java", "r"]) {
    assert.ok(patched.tokenizer[headerStateFor(id)], `${id} has its own header state`);
  }
});

test("with no languages to embed the grammar still works", () => {
  const rules = withUdfEmbedding(base()).tokenizer[UDF_HEADER_STATE] as unknown[];
  assert.ok(rules.length >= 2, "the closing marker and the SQL fallback remain");
});

test("the closing slash is a delimiter, and reads like the opening one", () => {
  // `--/` is dim because SQL sees `--` as a comment; the closing `/` is just
  // an operator to SQL and came out in the ordinary foreground. Tokenizing it
  // as a comment is what makes the two markers match.
  const header = withUdfEmbedding(base(), ["lua"]).tokenizer[UDF_HEADER_STATE] as [RegExp, { token: string }][];
  const close = header.find((r) => Array.isArray(r) && /\\\//.test(String(r[0])))!;
  assert.match(close[1].token, /^comment/, "the theme colours anything under `comment` as a comment");
  assert.match("/", close[0]);
  assert.match("   /  ", close[0]);
});

test("a line holding only a slash ends the embedding and the block", () => {
  const body = withUdfEmbedding(base()).tokenizer[UDF_BODY_STATE] as [RegExp, { next: string; nextEmbedded: string }][];
  const close = body[0];
  assert.match("/", close[0]);
  assert.match("   /   ", close[0]);
  assert.equal(close[1].next, "@pop");
  assert.equal(close[1].nextEmbedded, "@pop");
});

test("the closing line unwinds every state the block pushed", () => {
  // The body pops into its language's header state, whose own closing rule
  // pops all the way out — leave either off and the rest of the buffer stays
  // stuck inside the block.
  const patched = withUdfEmbedding(base(), ["lua"]);
  const header = patched.tokenizer[UDF_HEADER_STATE] as [RegExp, { next?: string }][];
  const perLang = patched.tokenizer[headerStateFor("lua")] as [RegExp, { next?: string }][];
  assert.ok(header.some((r) => Array.isArray(r) && r[1]?.next === "@popall"));
  assert.ok(perLang.some((r) => Array.isArray(r) && r[1]?.next === "@popall"));
});
