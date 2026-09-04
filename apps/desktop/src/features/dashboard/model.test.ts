import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOp, applyOps, emptyDoc, type DashboardDoc } from "./model.ts";

const base = (): DashboardDoc => emptyDoc("dash-1", "Sales");

test("create returns a fresh doc and ignores prior widgets", () => {
  let doc = base();
  doc = applyOp(doc, { op: "add_widget", widget: { type: "kpi" } }).doc;
  const res = applyOp(doc, { op: "create", title: "New", theme: { accent: "#f00" } });
  assert.equal(res.error, undefined);
  assert.equal(res.doc.title, "New");
  assert.equal(res.doc.widgets.length, 0);
  assert.equal(res.doc.theme.accent, "#f00");
});

test("add_widget appends with a deterministic id and default layout", () => {
  const doc = base();
  const r1 = applyOp(doc, { op: "add_widget", widget: { type: "markdown" } });
  assert.equal(r1.doc.widgets[0].id, "w1");
  assert.deepEqual(r1.doc.widgets[0].layout, { x: 0, y: 0, w: 4, h: 3 });
  const r2 = applyOp(r1.doc, { op: "add_widget", widget: { type: "chart" } });
  assert.equal(r2.doc.widgets[1].id, "w2");
});

test("add_widget honors an explicit id and rejects a duplicate", () => {
  let doc = base();
  doc = applyOp(doc, { op: "add_widget", widget: { id: "hero", type: "markdown" } }).doc;
  const dup = applyOp(doc, { op: "add_widget", widget: { id: "hero", type: "kpi" } });
  assert.match(dup.error ?? "", /already exists/);
  assert.equal(dup.doc.widgets.length, 1); // unchanged
});

test("add_widget rejects a missing/empty type", () => {
  const doc = base();
  const r = applyOp(doc, { op: "add_widget", widget: { type: "  " } });
  assert.match(r.error ?? "", /non-empty type/);
  assert.equal(r.doc.widgets.length, 0);
});

test("update_widget deep-merges layout/style/props and rejects unknown id", () => {
  let doc = base();
  doc = applyOp(doc, { op: "add_widget", widget: { type: "chart", props: { kind: "bar" }, query: "SELECT 1" } }).doc;
  const upd = applyOp(doc, { op: "update_widget", id: "w1", patch: { props: { kind: "line" }, query: "SELECT 2" } });
  assert.equal(upd.doc.widgets[0].props?.kind, "line");
  assert.equal(upd.doc.widgets[0].query, "SELECT 2");
  const bad = applyOp(doc, { op: "update_widget", id: "nope", patch: { query: "x" } });
  assert.match(bad.error ?? "", /no widget with id/);
  assert.equal(bad.doc, doc); // original returned unchanged
});

test("set_layout merges partial coords, rejects unknown id", () => {
  let doc = base();
  doc = applyOp(doc, { op: "add_widget", widget: { type: "kpi" } }).doc;
  const r = applyOp(doc, { op: "set_layout", id: "w1", layout: { x: 2, w: 6 } });
  assert.deepEqual(r.doc.widgets[0].layout, { x: 2, y: 0, w: 6, h: 3 });
  assert.match(applyOp(doc, { op: "set_layout", id: "zzz", layout: { x: 1 } }).error ?? "", /no widget/);
});

test("remove_widget removes and rejects unknown id", () => {
  let doc = base();
  doc = applyOps(doc, [
    { op: "add_widget", widget: { type: "kpi" } },
    { op: "add_widget", widget: { type: "chart" } },
  ]).doc;
  const r = applyOp(doc, { op: "remove_widget", id: "w1" });
  assert.equal(r.doc.widgets.length, 1);
  assert.equal(r.doc.widgets[0].id, "w2");
  assert.match(applyOp(doc, { op: "remove_widget", id: "w9" }).error ?? "", /no widget/);
});

test("set_param upserts and defaults value from default", () => {
  let doc = base();
  const add = applyOp(doc, { op: "set_param", param: { name: "region", type: "select", default: "All", options: ["All", "EU"] } });
  assert.equal(add.doc.params[0].value, "All");
  const upd = applyOp(add.doc, { op: "set_param", param: { name: "region", value: "EU" } });
  assert.equal(upd.doc.params[0].value, "EU");
  assert.equal(upd.doc.params.length, 1); // upsert, not duplicate
  assert.match(applyOp(doc, { op: "set_param", param: { name: "" } }).error ?? "", /non-empty name/);
});

test("restyle without id sets the theme, with id sets a widget, rejects unknown id", () => {
  let doc = base();
  doc = applyOp(doc, { op: "add_widget", widget: { type: "kpi" } }).doc;
  const theme = applyOp(doc, { op: "restyle", style: { accent: "#0a0" } });
  assert.equal(theme.doc.theme.accent, "#0a0");
  const wid = applyOp(doc, { op: "restyle", id: "w1", style: { color: "red" } });
  assert.equal(wid.doc.widgets[0].style?.color, "red");
  assert.match(applyOp(doc, { op: "restyle", id: "ghost", style: { color: "red" } }).error ?? "", /no widget/);
});

test("applyOps stops at the first error and returns that doc", () => {
  const doc = base();
  const res = applyOps(doc, [
    { op: "add_widget", widget: { type: "kpi" } },
    { op: "update_widget", id: "missing", patch: { query: "x" } }, // fails here
    { op: "add_widget", widget: { type: "chart" } }, // never applied
  ]);
  assert.match(res.error ?? "", /no widget with id/);
  assert.equal(res.doc.widgets.length, 1);
});

test("set_title renames without touching widgets", () => {
  let doc = base();
  doc = applyOp(doc, { op: "add_widget", widget: { type: "kpi" } }).doc;
  const r = applyOp(doc, { op: "set_title", title: "Renamed" });
  assert.equal(r.doc.title, "Renamed");
  assert.equal(r.doc.widgets.length, 1); // widgets preserved
});

test("applyOp never mutates the input document", () => {
  const doc = base();
  const frozen = JSON.stringify(doc);
  applyOp(doc, { op: "add_widget", widget: { type: "kpi" } });
  applyOp(doc, { op: "restyle", style: { accent: "#fff" } });
  assert.equal(JSON.stringify(doc), frozen);
});
