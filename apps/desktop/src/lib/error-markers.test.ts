import assert from "node:assert/strict";
import { test } from "node:test";
import { errorMarker, errorPosition, runStartIn, type RunPlace } from "./error-markers.ts";

const both = (place: RunPlace) => ({ position: true, statement: true, place });
const whole = (buffer: string, index: number, split = true): RunPlace => ({ runText: buffer, runStart: 0, split, index });

test("the position is read from Exasol's error text", () => {
  assert.deepEqual(errorPosition("object NOPE not found [line 1, column 15] (Session: 1)"), { line: 1, column: 15 });
  assert.equal(errorPosition("syntax error"), null);
});

test("the reported word is marked, in the right statement", () => {
  const buffer = "SELECT 1;\nSELECT * FROM NOPE;";
  const m = errorMarker(buffer, "SELECT * FROM NOPE", "[42000] object NOPE not found [line 1, column 15]", both(whole(buffer, 1)))!;
  assert.equal(buffer.slice(m.start, m.end), "NOPE");
});

test("a later line of a multi-line statement", () => {
  const buffer = "-- report\nSELECT a,\n       bogus\nFROM t;";
  const stmt = "-- report\nSELECT a,\n       bogus\nFROM t";
  const m = errorMarker(buffer, stmt, "column BOGUS not found [line 3, column 8]", both(whole(buffer, 0)))!;
  assert.equal(buffer.slice(m.start, m.end), "bogus");
});

test("identical statements: the one that failed is marked, not the nearest", () => {
  const buffer = "DELETE FROM T;\nSELECT 2;\nDELETE FROM T;";
  // The first DELETE failed (index 0); the cursor is at the end, by the second.
  const m = errorMarker(buffer, "DELETE FROM T", "lock conflict", both(whole(buffer, 0)))!;
  assert.equal(m.start, 0);
  const second = errorMarker(buffer, "DELETE FROM T", "lock conflict", both(whole(buffer, 2)))!;
  assert.equal(second.start, buffer.lastIndexOf("DELETE"));
});

test("a run of the selection or one statement is placed where it is in the buffer", () => {
  const buffer = "SELECT 1;\nSELECT * FROM NOPE;\nSELECT 3;";
  const sel = buffer.indexOf("SELECT * FROM NOPE");
  assert.equal(runStartIn(buffer, "SELECT * FROM NOPE", sel, 0), sel);
  assert.equal(runStartIn(buffer, buffer, null, 0), 0);
  assert.equal(runStartIn(buffer, "SELECT * FROM NOPE", null, sel + 3), sel, "statement at the cursor");
  const place: RunPlace = { runText: "SELECT * FROM NOPE", runStart: sel, split: true, index: 0 };
  const m = errorMarker(buffer, "SELECT * FROM NOPE", "x [line 1, column 15]", both(place))!;
  assert.equal(buffer.slice(m.start, m.end), "NOPE");
});

test("without a position the whole statement is marked, if asked", () => {
  const buffer = "DROP TABLE X;";
  const m = errorMarker(buffer, "DROP TABLE X", "insufficient privileges", both(whole(buffer, 0)))!;
  assert.equal(buffer.slice(m.start, m.end), "DROP TABLE X");
  assert.equal(errorMarker(buffer, "DROP TABLE X", "insufficient privileges", { position: true, statement: false, place: whole(buffer, 0) }), null);
});

test("position markers off: the statement is marked instead", () => {
  const buffer = "SELECT * FROM NOPE";
  const m = errorMarker(buffer, buffer, "not found [line 1, column 15]", { position: false, statement: true, place: whole(buffer, 0, false) })!;
  assert.deepEqual([m.start, m.end], [0, buffer.length]);
});

test("nothing to mark: both off, statement not in the buffer, or a position past the statement", () => {
  assert.equal(errorMarker("SELECT 1", "SELECT 1", "e", { position: false, statement: false, place: whole("SELECT 1", 0) }), null);
  assert.equal(errorMarker("SELECT 1", "SELECT 2", "e [line 1, column 1]", both(whole("SELECT 1", 0))), null, "edited since the run");
  const m = errorMarker("SELECT 1", "SELECT 1", "e [line 9, column 1]", both(whole("SELECT 1", 0)))!;
  assert.deepEqual([m.start, m.end], [0, 8], "falls back to the statement");
  assert.equal(errorMarker("x", "   ", "e", both(whole("x", 0))), null);
});

test("comments stripped before the run: the failed statement is still found", () => {
  const buffer = "-- first\nDELETE FROM T;\n-- second\nDELETE FROM T;";
  // The server saw "DELETE FROM T" twice; the second one failed.
  const place: RunPlace = { runText: buffer, runStart: 0, split: true, index: 1, stripped: true };
  const m = errorMarker(buffer, "DELETE FROM T", "lock conflict [line 1, column 13]", { position: true, statement: false, place })!;
  assert.equal(buffer.slice(m.start, m.end), "-- second\nDELETE FROM T", "the whole statement, not a column in changed text");
  assert.ok(m.start > buffer.indexOf("DELETE"));
});
