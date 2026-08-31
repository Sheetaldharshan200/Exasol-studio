import assert from "node:assert/strict";
import { test } from "node:test";
import { cellRenderer, kpiValue, resolveCellConnection } from "./notebook-cell.ts";

const open = [
  { id: "p1", name: "Personal" },
  { id: "p2", name: "Prod" },
];

test("cell with no choice follows the active connection", () => {
  const r = resolveCellConnection({}, { profileId: "p1", name: "Personal" }, open);
  assert.deepEqual(r, { ok: true, conn: { profileId: "p1", name: "Personal" } });
});

test("cell override wins over the active connection", () => {
  const r = resolveCellConnection({ connProfileId: "p2", connName: "Prod" }, { profileId: "p1", name: "Personal" }, open);
  assert.deepEqual(r, { ok: true, conn: { profileId: "p2", name: "Prod" } });
});

test("a gone override errors instead of silently falling back", () => {
  const r = resolveCellConnection({ connProfileId: "dead", connName: "Old DB" }, { profileId: "p1", name: "Personal" }, open);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /Old DB.*no longer connected/);
});

test("no connection at all asks the user to connect", () => {
  const r = resolveCellConnection({}, null, []);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /Connect a database/);
});

test("renderer routing covers every kind family", () => {
  assert.equal(cellRenderer(undefined), "grid");
  assert.equal(cellRenderer("table"), "grid");
  assert.equal(cellRenderer("kpi"), "kpi");
  assert.equal(cellRenderer("bar"), "recharts");
  assert.equal(cellRenderer("radial"), "recharts");
  assert.equal(cellRenderer("heatmap"), "echarts");
  assert.equal(cellRenderer("gauge"), "echarts");
  assert.equal(cellRenderer("wat"), "grid");
});

test("kpi picks the first numeric value and formats thousands", () => {
  assert.deepEqual(kpiValue([{ name: "LABEL" }, { name: "REVENUE" }], [["Jan", "1234567"]]), { label: "REVENUE", value: "1,234,567" });
  assert.deepEqual(kpiValue([{ name: "PCT" }], [["3.14"]]), { label: "PCT", value: "3.14" });
});

test("kpi with no rows or no usable value returns null", () => {
  assert.equal(kpiValue([{ name: "A" }], []), null);
  assert.equal(kpiValue([{ name: "A" }], [[null]]), null);
});

test("kpi without numeric columns shows the first text value", () => {
  assert.deepEqual(kpiValue([{ name: "STATUS" }], [["healthy"]]), { label: "STATUS", value: "healthy" });
});
