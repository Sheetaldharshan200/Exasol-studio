import { test } from "node:test";
import assert from "node:assert/strict";
import { languageLabel, hintFor, headerLanguage, udfBlocks, bodyHints, blockAt } from "./udf-placeholder.ts";

test("languageLabel derives a name rather than looking one up", () => {
  assert.equal(languageLabel("LUA"), "Lua");
  assert.equal(languageLabel("PYTHON3"), "Python");
  assert.equal(languageLabel("JAVA"), "Java");
  assert.equal(languageLabel("R"), "R");
  assert.equal(languageLabel("JULIA"), "Julia"); // a language nothing here knows
  assert.equal(languageLabel(" python3 "), "Python");
});

test("languageLabel survives a word that is only digits", () => {
  assert.equal(languageLabel("3"), "3");
  assert.equal(languageLabel(""), "");
});

test("hintFor reads as a sentence", () => {
  assert.equal(hintFor("PYTHON3"), "your Python code goes here");
  assert.equal(hintFor("LUA"), "your Lua code goes here");
});

test("headerLanguage skips the grammar words", () => {
  assert.equal(headerLanguage("CREATE OR REPLACE PYTHON3 SCALAR SCRIPT F (x DOUBLE) RETURNS DOUBLE AS"), "PYTHON3");
  assert.equal(headerLanguage("CREATE JAVA SET SCRIPT F (a DOUBLE) EMITS (b DOUBLE) AS"), "JAVA");
  assert.equal(headerLanguage("CREATE OR REPLACE JAVA ADAPTER SCRIPT A AS"), "JAVA");
});

test("headerLanguage defaults to Lua when none is named", () => {
  // Exasol's own default: CREATE SCRIPT with no language is Lua.
  assert.equal(headerLanguage("CREATE OR REPLACE SCRIPT F () AS"), "LUA");
  assert.equal(headerLanguage("SELECT 1"), "LUA");
});

const block = (lang: string, body: string) =>
  `--/\nCREATE OR REPLACE ${lang} SCALAR SCRIPT F (x DOUBLE)\nRETURNS DOUBLE AS\n${body}\n/\n`;

test("an empty body gets a hint naming its language", () => {
  assert.deepEqual(bodyHints(block("PYTHON3", "")), [{ line: 4, text: "your Python code goes here" }]);
  assert.deepEqual(bodyHints(block("LUA", "   ")), [{ line: 4, text: "your Lua code goes here" }]);
});

test("a body with code gets no hint", () => {
  assert.deepEqual(bodyHints(block("PYTHON3", "def run(ctx):\n    return 1")), []);
});

test("a block still being typed — no closing slash yet — still gets its hint", () => {
  const text = "--/\nCREATE OR REPLACE R SCALAR SCRIPT F (x DOUBLE)\nRETURNS DOUBLE AS\n";
  assert.deepEqual(bodyHints(text), [{ line: 4, text: "your R code goes here" }]);
});

test("a header with no AS yet has no body line and no hint", () => {
  assert.deepEqual(bodyHints("--/\nCREATE OR REPLACE PYTHON3 SCALAR SCRIPT F (x DOUBLE)\n"), []);
});

test("two blocks are reported separately and not nested", () => {
  const text = block("LUA", "") + block("JAVA", "");
  assert.deepEqual(bodyHints(text), [
    { line: 4, text: "your Lua code goes here" },
    { line: 9, text: "your Java code goes here" },
  ]);
});

test("plain SQL has no blocks", () => {
  assert.deepEqual(udfBlocks("SELECT 1;\nSELECT 2;"), []);
  assert.deepEqual(bodyHints(""), []);
});

test("blockAt finds the block the cursor is inside, and nothing outside one", () => {
  const text = `SELECT 1;\n${block("PYTHON3", "")}SELECT 2;`;
  assert.equal(blockAt(text, 0), null);
  assert.equal(blockAt(text, 40)?.language, "PYTHON3");
  assert.equal(blockAt(text, text.length - 1), null);
});

// ── Regressions found in review ────────────────────────────────────────────

test("a comment in the header is not mistaken for the language", () => {
  assert.equal(headerLanguage("CREATE /* a note */ PYTHON3 SCALAR SCRIPT F () AS"), "PYTHON3");
  assert.equal(headerLanguage("CREATE -- a note\nJAVA SCALAR SCRIPT F () AS"), "JAVA");
  const sql = "--/\nCREATE /* a note */ PYTHON3 SCALAR SCRIPT S.X()\nRETURNS DECIMAL AS\n\n/\n";
  assert.deepEqual(bodyHints(sql), [{ line: 4, text: "your Python code goes here" }]);
});

test("AS directly above the closing slash leaves no body line to hint", () => {
  assert.deepEqual(bodyHints("--/\nCREATE LUA SCALAR SCRIPT S.X() RETURNS DECIMAL AS\n/\n"), []);
  // One blank line between them IS a body, and does get the hint.
  assert.deepEqual(bodyHints("--/\nCREATE LUA SCALAR SCRIPT S.X() RETURNS DECIMAL AS\n\n/\n"), [
    { line: 3, text: "your Lua code goes here" },
  ]);
});
