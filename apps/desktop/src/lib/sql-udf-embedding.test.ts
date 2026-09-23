import assert from "node:assert/strict";
import { test } from "node:test";
import { embeddedLanguageId, UDF_BODY_STATE, UDF_HEADER_STATE, withUdfEmbedding, type MonarchLanguage } from "./sql-udf-embedding.ts";

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

test("the header hands the body to the language named in it", () => {
  const rules = withUdfEmbedding(base()).tokenizer[UDF_HEADER_STATE] as [RegExp, { nextEmbedded?: string }][];
  const embed = rules.find((r) => Array.isArray(r) && r[1]?.nextEmbedded)!;
  assert.equal(embed[1].nextEmbedded, "$1", "the language comes from the capture, never a fixed name");
  assert.match("CREATE OR REPLACE LUA SCALAR SCRIPT F(a DOUBLE) RETURNS DOUBLE AS", embed[0]);
  assert.match("CREATE PYTHON3 SET SCRIPT F(a INT) EMITS (b INT) AS", embed[0]);
});

test("a CREATE without a trailing AS is not a block header", () => {
  const rules = withUdfEmbedding(base()).tokenizer[UDF_HEADER_STATE] as [RegExp, unknown][];
  const embed = rules.find((r) => Array.isArray(r) && (r[1] as { nextEmbedded?: string })?.nextEmbedded)!;
  assert.doesNotMatch("SELECT LUA FROM T", embed[0]);
});

test("a line holding only a slash ends the embedding and the block", () => {
  const body = withUdfEmbedding(base()).tokenizer[UDF_BODY_STATE] as [RegExp, { next: string; nextEmbedded: string }][];
  const close = body[0];
  assert.match("/", close[0]);
  assert.match("   /   ", close[0]);
  assert.equal(close[1].next, "@pop");
  assert.equal(close[1].nextEmbedded, "@pop");
});

test("an unterminated block does not leave the header state stuck", () => {
  const header = withUdfEmbedding(base()).tokenizer[UDF_HEADER_STATE] as unknown[];
  assert.ok(header.some((r) => Array.isArray(r) && (r[1] as { next?: string })?.next === "@pop"));
});
