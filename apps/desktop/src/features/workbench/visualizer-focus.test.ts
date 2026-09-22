import test from "node:test";
import assert from "node:assert/strict";
import { focusBounds } from "./visualizer-focus.ts";

const box = (id: string, x: number, y: number, height = 100) => ({ id, x, y, width: 200, height });

test("a lonely table gets its own padded rectangle", () => {
  const r = focusBounds([box("A", 100, 50)], [], "A", 10);
  assert.deepEqual(r, { x: 90, y: 40, width: 220, height: 120 });
});

test("a table with neighbours is framed together with them, one hop only", () => {
  const boxes = [box("A", 0, 0), box("B", 600, 0), box("C", 0, 400, 300), box("D", 2000, 2000)];
  const links = [
    { source: "A", target: "B" },
    { source: "C", target: "A" },
    { source: "B", target: "D" }, // two hops from A — not included
  ];
  const r = focusBounds(boxes, links, "A", 0);
  assert.deepEqual(r, { x: 0, y: 0, width: 800, height: 700 });
});

test("self links and duplicate links do not widen or double-count", () => {
  const boxes = [box("A", 0, 0), box("B", 300, 0)];
  const links = [
    { source: "A", target: "A" },
    { source: "A", target: "B" },
    { source: "B", target: "A" },
  ];
  assert.deepEqual(focusBounds(boxes, links, "A", 0), { x: 0, y: 0, width: 500, height: 100 });
});

test("an unknown table yields null; a link to a table not on the canvas is ignored", () => {
  assert.equal(focusBounds([box("A", 0, 0)], [], "ZZZ"), null);
  assert.deepEqual(focusBounds([box("A", 0, 0)], [{ source: "A", target: "GHOST" }], "A", 0), { x: 0, y: 0, width: 200, height: 100 });
});

test("padding defaults to 40 on every side", () => {
  const r = focusBounds([box("A", 0, 0)], [], "A")!;
  assert.equal(r.x, -40);
  assert.equal(r.width, 280);
});
