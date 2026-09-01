import assert from "node:assert/strict";
import { test } from "node:test";
import { EXPORT_ALL, filterExportCells } from "./notebook-export-include.ts";
type ExportCell = Parameters<typeof filterExportCells>[0][number];

const cells: ExportCell[] = [
  { type: "markdown", src: "# note" },
  { type: "mermaid", src: "graph TD; A-->B" },
  { type: "sql", src: "SELECT 1", result: { kind: "resultSet", columns: [{ name: "A", typeName: "N" }], rows: [[1]], rowCount: 1, truncated: false, elapsedMs: 1, error: null } as never },
];

test("all-selected keeps everything", () => {
  assert.equal(filterExportCells(cells, EXPORT_ALL).length, 3);
});

test("deselecting notes and diagrams drops those cells", () => {
  const out = filterExportCells(cells, { ...EXPORT_ALL, notes: false, diagrams: false });
  assert.deepEqual(out.map((c) => c.type), ["sql"]);
});

test("results-only strips the SQL text but keeps the table", () => {
  const out = filterExportCells(cells, { queries: false, results: true, notes: false, diagrams: false });
  assert.equal(out.length, 1);
  assert.equal(out[0].src, "");
  assert.ok(out[0].result);
});

test("queries-only strips results; neither drops the cell", () => {
  const q = filterExportCells(cells, { queries: true, results: false, notes: false, diagrams: false });
  assert.equal(q[0].result, null);
  const none = filterExportCells(cells, { queries: false, results: false, notes: false, diagrams: false });
  assert.equal(none.length, 0);
});
