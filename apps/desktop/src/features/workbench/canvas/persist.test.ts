import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeBox, decodeDoc, encodeDoc, storageKey } from "./persist.ts";
import { EMPTY_DOC, SIZES, type CanvasDoc } from "./model.ts";

const conn = { profileId: "p1", connectionName: "Local" };
const rect = { x: 10, y: 20, ...SIZES.table };

test("a saved document round-trips; unknown and broken boxes are dropped", () => {
  const doc: CanvasDoc = {
    version: 1,
    boxes: [
      { id: "a", kind: "table", ...conn, schema: "S", table: "T", rect },
      { id: "q", kind: "query", ...conn, name: "Q", sql: "SELECT * FROM derived_table", sources: ["a"], rect },
      { id: "c", kind: "chart", ...conn, name: "C", source: "q", chart: "bar", viz: { xField: "X", yFields: ["Y"], stacked: true }, rect },
    ],
  };
  assert.deepEqual(decodeDoc(encodeDoc(doc)), doc);
  assert.equal(decodeBox({ id: "z", kind: "widget", ...conn, rect }), null, "a kind Studio cannot draw");
  assert.equal(decodeBox({ id: "z", kind: "table", ...conn, schema: "S", table: "T", rect: { x: 0, y: 0, w: 0, h: 10 } }), null, "a zero-width rect");
  assert.deepEqual(decodeBox({ id: "z", kind: "chart", ...conn, name: "C", source: "q", chart: "bar", rect })?.kind === "chart" && decodeBox({ id: "z", kind: "chart", ...conn, name: "C", source: "q", chart: "bar", rect }), { id: "z", kind: "chart", ...conn, name: "C", source: "q", chart: "bar", viz: {}, rect }, "a chart with no saved viz still draws, from suggestions");
});

test("a step whose source is gone goes too, and so does what was built on it", () => {
  const raw = JSON.stringify({
    version: 1,
    boxes: [
      { id: "q", kind: "query", ...conn, name: "Q", sql: "x", sources: ["gone"], rect },
      { id: "c", kind: "chart", ...conn, name: "C", source: "q", chart: "bar", viz: {}, rect },
      { id: "t", kind: "table", ...conn, schema: "S", table: "T", rect },
    ],
  });
  assert.deepEqual(decodeDoc(raw).boxes.map((b) => b.id), ["t"]);
});

test("garbage, empty and old shapes decode to an empty canvas", () => {
  assert.deepEqual(decodeDoc(null), EMPTY_DOC);
  assert.deepEqual(decodeDoc("not json"), EMPTY_DOC);
  assert.deepEqual(decodeDoc(JSON.stringify({ version: 0, nodes: [] })), EMPTY_DOC);
  assert.equal(storageKey("abc"), "exa.canvas.abc");
});
