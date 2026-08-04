import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildContextBlock, matchProviders, parseAtToken, serializeChip, type ContextChip } from "./context-chips.ts";

describe("parseAtToken", () => {
  test("bare @ offers everything", () => {
    assert.deepEqual(parseAtToken("show me @"), { query: "" });
    assert.deepEqual(parseAtToken("@"), { query: "" });
  });
  test("partial provider word", () => {
    assert.deepEqual(parseAtToken("use @tab"), { query: "tab" });
  });
  test("known provider with a query", () => {
    assert.deepEqual(parseAtToken("@table:TESTLAB.CUST"), { kind: "table", query: "TESTLAB.CUST" });
    assert.deepEqual(parseAtToken("join on @schema:"), { kind: "schema", query: "" });
  });
  test("does NOT trigger mid-word or on emails", () => {
    assert.equal(parseAtToken("email me@example.com"), null);
    assert.equal(parseAtToken("plain text"), null);
    assert.equal(parseAtToken("@table:X then more "), null); // token not at caret
  });
});

describe("matchProviders", () => {
  test("prefix filter", () => {
    assert.deepEqual(matchProviders("s"), ["schema", "selection"]);
    assert.deepEqual(matchProviders("t"), ["table"]);
    assert.deepEqual(matchProviders(""), ["schema", "table", "selection", "result", "file"]);
    assert.deepEqual(matchProviders("zzz"), []);
  });
});

describe("serializeChip / buildContextBlock", () => {
  const chip: ContextChip = { kind: "table", label: "TESTLAB.CUSTOMERS", content: "  ID DECIMAL, NAME VARCHAR  " };
  test("labeled fenced block, content trimmed", () => {
    const s = serializeChip(chip);
    assert.match(s, /# TABLE TESTLAB\.CUSTOMERS/);
    assert.match(s, /<context type="table" ref="TESTLAB\.CUSTOMERS">/);
    assert.match(s, /ID DECIMAL, NAME VARCHAR/);
    assert.match(s, /<\/context>$/);
    assert.ok(!s.includes("  ID")); // trimmed
  });
  test("empty chips → empty block; multiple → joined with trailing gap", () => {
    assert.equal(buildContextBlock([]), "");
    const block = buildContextBlock([chip, { kind: "selection", label: "editor", content: "SELECT 1" }]);
    assert.ok(block.includes("# TABLE") && block.includes("# SELECTION"));
    assert.ok(block.endsWith("\n\n")); // separates context from the user message
  });
});
