import assert from "node:assert/strict";
import { test } from "node:test";
import { dashboardBus, makeApply } from "./dashboard-bus.ts";
import { emptyDoc, applyOp, type DashboardDoc } from "./model.ts";

test("apply with no dashboard open returns an error, not a throw", () => {
  const r = dashboardBus.apply({ op: "add_widget", widget: { type: "kpi" } });
  assert.match(r.error ?? "", /No dashboard is open/);
});

test("makeApply commits on success and returns the result", () => {
  let doc: DashboardDoc = emptyDoc("d1");
  const apply = makeApply(() => doc, (d) => { doc = d; });
  const r = apply({ op: "add_widget", widget: { type: "chart", query: "SELECT 1" } });
  assert.equal(r.error, undefined);
  assert.equal(doc.widgets.length, 1);
  assert.equal(doc.widgets[0].type, "chart");
});

test("makeApply does NOT commit on a rejected op", () => {
  let doc: DashboardDoc = emptyDoc("d1");
  const before = doc;
  const apply = makeApply(() => doc, (d) => { doc = d; });
  const r = apply({ op: "remove_widget", id: "ghost" });
  assert.match(r.error ?? "", /no widget/);
  assert.equal(doc, before); // unchanged
});

test("register routes apply to the live handle and unregister clears it", () => {
  let doc: DashboardDoc = emptyDoc("live");
  const unregister = dashboardBus.register({
    id: "live",
    apply: makeApply(() => doc, (d) => { doc = d; }),
    getDoc: () => doc,
  });
  assert.equal(dashboardBus.isActive(), true);
  assert.equal(dashboardBus.activeId(), "live");

  const r = dashboardBus.apply({ op: "add_widget", widget: { type: "kpi" } });
  assert.equal(r.error, undefined);
  assert.equal(dashboardBus.getDoc()?.widgets.length, 1);

  unregister();
  assert.equal(dashboardBus.isActive(), false);
  assert.equal(dashboardBus.getDoc(), null);
});

test("the live handle sees the latest committed document (no stale reads)", () => {
  let doc: DashboardDoc = emptyDoc("live2");
  const unregister = dashboardBus.register({
    id: "live2",
    apply: makeApply(() => doc, (d) => { doc = d; }),
    getDoc: () => doc,
  });
  dashboardBus.apply({ op: "add_widget", widget: { id: "a", type: "kpi" } });
  dashboardBus.apply({ op: "add_widget", widget: { id: "b", type: "chart" } });
  // second add must see the first — ids a and b both present, deterministic order
  const ids = (dashboardBus.getDoc() as DashboardDoc).widgets.map((w) => w.id);
  assert.deepEqual(ids, ["a", "b"]);
  // sanity: a manual applyOp on the same doc agrees
  assert.equal(applyOp(doc, { op: "remove_widget", id: "a" }).doc.widgets.length, 1);
  unregister();
});
