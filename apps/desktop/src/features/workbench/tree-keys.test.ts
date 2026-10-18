import assert from "node:assert/strict";
import { test } from "node:test";
import { treeKey, type FlatRow } from "./tree-keys.ts";

// SCHEMAS (open) > S1 (open) > T1, T2 ; S2 (closed)
const rows: FlatRow[] = [
  { id: "schemas", depth: 0, expandable: true, open: true },
  { id: "S1", depth: 1, expandable: true, open: true },
  { id: "T1", depth: 2, expandable: false, open: false },
  { id: "T2", depth: 2, expandable: true, open: false },
  { id: "S2", depth: 1, expandable: true, open: false },
];

test("up and down move one row and stop at the ends; Home and End jump", () => {
  assert.deepEqual(treeKey(rows, 0, "ArrowDown"), { kind: "select", index: 1 });
  assert.deepEqual(treeKey(rows, 4, "ArrowDown"), { kind: "select", index: 4 });
  assert.deepEqual(treeKey(rows, 0, "ArrowUp"), { kind: "select", index: 0 });
  assert.deepEqual(treeKey(rows, 2, "Home"), { kind: "select", index: 0 });
  assert.deepEqual(treeKey(rows, 2, "End"), { kind: "select", index: 4 });
});

test("right expands a closed folder, then steps into an open one; nothing on a leaf", () => {
  assert.deepEqual(treeKey(rows, 4, "ArrowRight"), { kind: "toggle", index: 4 });
  assert.deepEqual(treeKey(rows, 1, "ArrowRight"), { kind: "select", index: 2 });
  assert.equal(treeKey(rows, 2, "ArrowRight"), null);
  assert.equal(treeKey([{ id: "x", depth: 0, expandable: true, open: true }], 0, "ArrowRight"), null, "open but still loading");
});

test("left collapses an open folder, else goes to the parent", () => {
  assert.deepEqual(treeKey(rows, 1, "ArrowLeft"), { kind: "toggle", index: 1 });
  assert.deepEqual(treeKey(rows, 3, "ArrowLeft"), { kind: "select", index: 1 });
  assert.deepEqual(treeKey(rows, 4, "ArrowLeft"), { kind: "select", index: 0 });
  assert.equal(treeKey(rows.map((r) => ({ ...r, open: false })), 0, "ArrowLeft"), null, "a closed root has no parent");
});

test("Enter opens; the Menu key and Shift+F10 open the menu", () => {
  assert.deepEqual(treeKey(rows, 2, "Enter"), { kind: "open", index: 2 });
  assert.deepEqual(treeKey(rows, 2, "ContextMenu"), { kind: "menu", index: 2 });
  assert.deepEqual(treeKey(rows, 2, "F10", true), { kind: "menu", index: 2 });
  assert.equal(treeKey(rows, 2, "F10"), null);
  assert.equal(treeKey(rows, 2, "a"), null);
});

test("with nothing selected, the first move selects an end; an empty tree does nothing", () => {
  assert.deepEqual(treeKey(rows, -1, "ArrowDown"), { kind: "select", index: 0 });
  assert.deepEqual(treeKey(rows, -1, "ArrowUp"), { kind: "select", index: 4 });
  assert.equal(treeKey(rows, -1, "Enter"), null);
  assert.equal(treeKey([], 0, "ArrowDown"), null);
});
