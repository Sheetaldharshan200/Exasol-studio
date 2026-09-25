import { test } from "node:test";
import assert from "node:assert/strict";
import { completionWindow, shouldSuggest, cleanCompletion, completionKey, completionPrompt } from "./inline-completion.ts";

test("the window splits the buffer at the cursor and clips both sides", () => {
  const w = completionWindow("0123456789", 5, 3, 2);
  assert.deepEqual(w, { prefix: "234", suffix: "56" });
});

test("a cursor at either end still gives a usable window", () => {
  assert.deepEqual(completionWindow("abc", 0), { prefix: "", suffix: "abc" });
  assert.deepEqual(completionWindow("abc", 3), { prefix: "abc", suffix: "" });
  assert.deepEqual(completionWindow("abc", 99), { prefix: "abc", suffix: "" });
  assert.deepEqual(completionWindow("abc", -5), { prefix: "", suffix: "abc" });
});

test("nothing is asked for on an almost-empty buffer", () => {
  assert.equal(shouldSuggest("", ""), false);
  assert.equal(shouldSuggest("SE", ""), false);
  assert.equal(shouldSuggest("SELECT ", ""), true);
});

test("nothing is asked for inside a string literal", () => {
  assert.equal(shouldSuggest("SELECT 'abc", ""), false);
  assert.equal(shouldSuggest("SELECT 'abc' ", ""), true);
  // '' is an escaped quote, so the string is still open.
  assert.equal(shouldSuggest("SELECT 'it''s", ""), false);
});

test("nothing is asked for when text follows the cursor on the same line", () => {
  assert.equal(shouldSuggest("SELECT ", " FROM T"), false);
  assert.equal(shouldSuggest("SELECT ", "\nFROM T"), true);
  assert.equal(shouldSuggest("SELECT ", "   \nFROM T"), true);
});

test("a fenced answer is unwrapped", () => {
  assert.equal(cleanCompletion("```sql\n* FROM SALES.ORDERS\n```", "SELECT ", ""), "* FROM SALES.ORDERS");
  assert.equal(cleanCompletion("```\nx\n```", "SELECT ", ""), "x");
});

test("an unclosed fence still yields the code", () => {
  assert.equal(cleanCompletion("```sql\n* FROM T", "SELECT ", ""), "* FROM T");
});

test("a re-typed copy of the current line is dropped", () => {
  assert.equal(cleanCompletion("SELECT * FROM SALES.ORDERS", "SELECT ", ""), "* FROM SALES.ORDERS");
  // Case is the model's business, not a reason to show a duplicate.
  assert.equal(cleanCompletion("select * FROM T", "SELECT ", ""), "* FROM T");
});

test("the suggestion stops before repeating what follows the cursor", () => {
  const out = cleanCompletion("  total DOUBLE\n) AS\nsomething", "CREATE TABLE T (\n", "\n) AS\n");
  assert.equal(out, "  total DOUBLE");
});

test("a short line after the cursor is not used as a stop marker", () => {
  // ")" alone would truncate almost any suggestion, so only real text counts.
  assert.equal(cleanCompletion("a,\nb)", "f(\n", "\n)"), "a,\nb)");
});

test("an empty or punctuation-only answer yields nothing", () => {
  assert.equal(cleanCompletion("", "SELECT ", ""), "");
  assert.equal(cleanCompletion("   \n  ", "SELECT ", ""), "");
  assert.equal(cleanCompletion("```sql\n```", "SELECT ", ""), "");
  assert.equal(cleanCompletion(";;", "SELECT ", ""), "");
  assert.equal(cleanCompletion("SELECT", "SELECT", ""), "");
});

test("a very long answer is capped", () => {
  const long = Array.from({ length: 40 }, (_, i) => `line${i}`).join("\n");
  assert.equal(cleanCompletion(long, "x\n", "").split("\n").length, 12);
});

test("trailing blank lines are trimmed and a leading blank line at line start is dropped", () => {
  assert.equal(cleanCompletion("\n\nFROM T\n\n\n", "SELECT *\n", ""), "FROM T");
});

test("the key ignores trailing spaces but not real typing", () => {
  assert.equal(completionKey("SELECT  ", ""), completionKey("SELECT", ""));
  assert.notEqual(completionKey("SELECT a", ""), completionKey("SELECT b", ""));
});

test("the key moves with the suffix, so a cached answer is not replayed after different text", () => {
  assert.notEqual(completionKey("SELECT ", ""), completionKey("SELECT ", "\nFROM T"));
});

test("a suggestion that is entirely what already follows the cursor is dropped", () => {
  assert.equal(cleanCompletion("FROM T", "SELECT ", "\nFROM T"), "");
});

test("the cut matches a whole line, so a quoted copy of it is not truncated", () => {
  const raw = "WHERE note = 'ORDER BY id'\nORDER BY id";
  assert.equal(cleanCompletion(raw, "SELECT * FROM T\n", "\nORDER BY id"), "WHERE note = 'ORDER BY id'");
});

test("the prompt carries the schema and the UDF language when there are any", () => {
  const w = { prefix: "def run(", suffix: "" };
  const withCtx = completionPrompt(w, { language: "Python", schema: "S.T.C DOUBLE" });
  assert.match(withCtx, /S\.T\.C DOUBLE/);
  assert.match(withCtx, /Python UDF body/);
  assert.match(withCtx, /<before>\ndef run\(\n<\/before>/);
  const bare = completionPrompt(w, {});
  assert.doesNotMatch(bare, /Schema/);
  assert.doesNotMatch(bare, /UDF body/);
});
