import assert from "node:assert/strict";
import { test } from "node:test";
import { isWritten, pendingCount, pendingSummary, rowToDraft } from "./edit-grid-model.ts";

const COLS = [{ name: "ID" }, { name: "NAME" }, { name: "NOTE" }];
const empty = { edits: {}, deleted: new Set<number>(), inserts: [] };

test("a duplicated row copies every value as text", () => {
  assert.deepEqual(rowToDraft([7, "Ada", "hi"], COLS), { ID: "7", NAME: "Ada", NOTE: "hi" });
});

test("a duplicated NULL is an explicit NULL, not a missing cell", () => {
  // If it were merely empty the INSERT would omit the column and the row
  // would silently take that column's DEFAULT instead of the NULL it copied.
  assert.deepEqual(rowToDraft([1, null, undefined], COLS), { ID: "1", NAME: null, NOTE: null });
  assert.equal(isWritten(rowToDraft([1, null, undefined], COLS).NAME), true);
});

test("a short row still yields every column", () => {
  assert.deepEqual(rowToDraft([1], COLS), { ID: "1", NAME: null, NOTE: null });
});

test("only an empty or absent cell is left out of the statement", () => {
  assert.equal(isWritten(""), false);
  assert.equal(isWritten(undefined), false);
  assert.equal(isWritten(null), true);
  assert.equal(isWritten("0"), true);
  assert.equal(isWritten("hello"), true);
});

test("a cloned key comes across verbatim — the app cannot invent a new one", () => {
  assert.equal(rowToDraft([42, "Ada", null], COLS).ID, "42");
});

test("nothing staged has nothing to say", () => {
  assert.equal(pendingCount(empty), 0);
  assert.equal(pendingSummary(empty), null);
});

test("a row edited in three cells counts once", () => {
  const staged = { edits: { 4: { 0: "a", 1: "b", 2: "c" } }, deleted: new Set<number>(), inserts: [] };
  assert.equal(pendingCount(staged), 1);
  assert.equal(pendingSummary(staged), "1 edited");
});

test("a deleted row is not also counted as edited", () => {
  const staged = { edits: { 4: { 0: "a" } }, deleted: new Set([4]), inserts: [] };
  assert.equal(pendingCount(staged), 1);
  assert.equal(pendingSummary(staged), "1 deleted");
});

test("an edit entry with no cells left in it counts for nothing", () => {
  const staged = { edits: { 4: {} }, deleted: new Set<number>(), inserts: [] };
  assert.equal(pendingCount(staged), 0);
  assert.equal(pendingSummary(staged), null);
});

test("all three kinds read in a fixed order", () => {
  const staged = { edits: { 1: { 0: "x" }, 2: { 0: "y" } }, deleted: new Set([9]), inserts: [{ ID: "1" }] };
  assert.equal(pendingCount(staged), 4);
  assert.equal(pendingSummary(staged), "2 edited · 1 new · 1 deleted");
});
