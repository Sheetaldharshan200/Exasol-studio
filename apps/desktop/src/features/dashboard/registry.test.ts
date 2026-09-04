import assert from "node:assert/strict";
import { test } from "node:test";
import { createRegistry, PLACEHOLDER_TYPE } from "./registry.ts";

// The renderer is opaque to the registry, so tests use plain string sentinels.
const reg = () => createRegistry<string>("PLACEHOLDER");

test("a registered type resolves to its definition", () => {
  const r = reg();
  r.register({ type: "chart", label: "Chart", render: "CHART", dataBacked: true });
  assert.equal(r.get("chart")?.render, "CHART");
  assert.equal(r.resolve("chart").render, "CHART");
  assert.equal(r.has("chart"), true);
});

test("an unknown type resolves to the placeholder, never undefined", () => {
  const r = reg();
  assert.equal(r.get("nope"), undefined);
  const resolved = r.resolve("nope");
  assert.equal(resolved.type, PLACEHOLDER_TYPE);
  assert.equal(resolved.render, "PLACEHOLDER");
  assert.equal(r.has("nope"), false);
});

test("registering a new type needs no model change (open set)", () => {
  const r = reg();
  r.register({ type: "sparkline", label: "Sparkline", render: "SPARK" });
  assert.equal(r.resolve("sparkline").render, "SPARK");
  assert.ok(r.list().some((d) => d.type === "sparkline"));
});

test("register rejects an empty type", () => {
  const r = reg();
  assert.throws(() => r.register({ type: "  ", label: "x", render: "y" }), /non-empty type/);
});

test("list returns only registered defs (not the placeholder)", () => {
  const r = reg();
  r.register({ type: "kpi", label: "KPI", render: "KPI" });
  r.register({ type: "markdown", label: "Text", render: "MD" });
  const types = r.list().map((d) => d.type).sort();
  assert.deepEqual(types, ["kpi", "markdown"]);
});
