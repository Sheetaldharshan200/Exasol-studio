import assert from "node:assert/strict";
import { test } from "node:test";
import { toNotebookCells, toCanvasItems, sameWidgets } from "./views.ts";
import { emptyDoc, applyOps } from "./model.ts";

const doc = () =>
  applyOps(emptyDoc("d1", "Sales"), [
    { op: "add_widget", widget: { type: "markdown", props: { text: "## Intro" } } },
    { op: "add_widget", widget: { type: "chart", query: "SELECT a,b FROM t", layout: { x: 4, y: 0, w: 8, h: 6 } } },
  ]).doc;

test("notebook cells are 1..N in document order, layout ignored", () => {
  const cells = toNotebookCells(doc());
  assert.deepEqual(cells.map((c) => c.index), [1, 2]);
  assert.equal(cells[0].widget.type, "markdown");
  assert.equal(cells[1].widget.type, "chart");
});

test("canvas items carry each widget's layout", () => {
  const items = toCanvasItems(doc());
  assert.deepEqual(items[1].layout, { x: 4, y: 0, w: 8, h: 6 });
});

test("both views reference the same widgets — no content is lost switching views", () => {
  const d = doc();
  const fromNotebook = toNotebookCells(d).map((c) => c.widget);
  const fromCanvas = toCanvasItems(d).map((i) => i.widget);
  // Same widget objects, so query/props/results are identical across views.
  assert.deepEqual(fromNotebook, fromCanvas);
  assert.equal(fromNotebook[1].query, "SELECT a,b FROM t");
});

test("sameWidgets detects a round-trip preserved its widgets", () => {
  const d = doc();
  assert.equal(sameWidgets(d, d), true);
});
