import assert from "node:assert/strict";
import { test } from "node:test";
import { errorMarker, errorPosition } from "./error-markers.ts";

const both = { position: true, statement: true };

test("the position is read from Exasol's error text", () => {
  assert.deepEqual(errorPosition("object NOPE not found [line 1, column 15] (Session: 1)"), { line: 1, column: 15 });
  assert.equal(errorPosition("syntax error"), null);
});

test("the reported word is marked, in the right statement", () => {
  const buffer = "SELECT 1;\nSELECT * FROM NOPE;";
  const m = errorMarker(buffer, "SELECT * FROM NOPE", "[42000] object NOPE not found [line 1, column 15]", both)!;
  assert.equal(buffer.slice(m.start, m.end), "NOPE");
});

test("a later line of a multi-line statement", () => {
  const buffer = "-- report\nSELECT a,\n       bogus\nFROM t;";
  const stmt = "SELECT a,\n       bogus\nFROM t";
  const m = errorMarker(buffer, stmt, "column BOGUS not found [line 2, column 8]", both)!;
  assert.equal(buffer.slice(m.start, m.end), "bogus");
});

test("without a position the whole statement is marked, if asked", () => {
  const buffer = "DROP TABLE X;";
  const m = errorMarker(buffer, "DROP TABLE X", "insufficient privileges", both)!;
  assert.equal(buffer.slice(m.start, m.end), "DROP TABLE X");
  assert.equal(errorMarker(buffer, "DROP TABLE X", "insufficient privileges", { position: true, statement: false }), null);
});

test("position markers off: the statement is marked instead", () => {
  const buffer = "SELECT * FROM NOPE";
  const m = errorMarker(buffer, buffer, "not found [line 1, column 15]", { position: false, statement: true })!;
  assert.deepEqual([m.start, m.end], [0, buffer.length]);
});

test("the occurrence nearest the cursor wins", () => {
  const buffer = "SELECT * FROM NOPE;\nSELECT 2;\nSELECT * FROM NOPE;";
  const m = errorMarker(buffer, "SELECT * FROM NOPE", "x [line 1, column 15]", { ...both, near: buffer.length })!;
  assert.ok(m.start > 20);
});

test("nothing to mark: both off, statement not in the buffer, or a position past the statement", () => {
  assert.equal(errorMarker("SELECT 1", "SELECT 1", "e", { position: false, statement: false }), null);
  assert.equal(errorMarker("SELECT 1", "SELECT 2", "e [line 1, column 1]", both), null, "edited since the run");
  const m = errorMarker("SELECT 1", "SELECT 1", "e [line 9, column 1]", both)!;
  assert.deepEqual([m.start, m.end], [0, 8], "falls back to the statement");
  assert.equal(errorMarker("x", "   ", "e", both), null);
});
