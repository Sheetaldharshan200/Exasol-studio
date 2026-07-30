import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyze,
  computePlanRows,
  partsDurationSum,
  planDenominator,
  type ProfileData,
  type ProfilePart,
} from "./query-plan.ts";

/** A profile part with sensible nulls; override what a test cares about. */
function part(overrides: Partial<ProfilePart>): ProfilePart {
  return {
    partId: 0,
    name: "SELECT",
    info: null,
    schema: null,
    object: null,
    objectRows: null,
    inRows: null,
    outRows: null,
    duration: null,
    cpu: null,
    tempRam: null,
    hddRead: null,
    hddWrite: null,
    net: null,
    remarks: null,
    ...overrides,
  };
}

const noWall: ProfileData["wall"] = null;

test("partsDurationSum sums durations, treating null as 0", () => {
  assert.equal(partsDurationSum([]), 0);
  assert.equal(partsDurationSum([part({ duration: 1.5 }), part({ duration: null }), part({ duration: 2 })]), 3.5);
});

test("planDenominator prefers wall time, falls back to parts sum", () => {
  const parts = [part({ duration: 2 }), part({ duration: 3 })];
  assert.equal(planDenominator(parts, { duration: 4, commandName: "SELECT", rowCount: null, cpu: null, tempRam: null, hddRead: null, net: null }), 4);
  assert.equal(planDenominator(parts, noWall), 5); // sum fallback
});

test("planDenominator never returns a negative and clamps 0", () => {
  assert.equal(planDenominator([], noWall), 0);
  assert.equal(planDenominator([part({ duration: 0 })], noWall), 0);
});

test("computePlanRows gives each part its share of the denominator", () => {
  const parts = [part({ partId: 1, duration: 3 }), part({ partId: 2, duration: 1 })];
  const rows = computePlanRows(parts, noWall); // denom = 4
  assert.equal(rows.length, 2);
  assert.equal(rows[0].sharePct, 75);
  assert.equal(rows[1].sharePct, 25);
});

test("computePlanRows returns 0% (never NaN) when there is no time", () => {
  const rows = computePlanRows([part({ partId: 1, duration: 0 }), part({ partId: 2, duration: null })], noWall);
  assert.equal(rows[0].sharePct, 0);
  assert.equal(rows[1].sharePct, 0);
});

test("analyze returns nothing when there is no measured time", () => {
  assert.deepEqual(analyze([], noWall), []);
  assert.deepEqual(analyze([part({ duration: 0 })], noWall), []);
});

test("analyze flags the slowest step as a warning when it dominates the wall", () => {
  const parts = [part({ partId: 1, name: "TABLE SCAN", object: "ORDERS", schema: "SALES", duration: 9 }), part({ partId: 2, name: "GROUP BY", duration: 1 })];
  const out = analyze(parts, noWall); // denom = 10, slowest = 90% → warn
  assert.ok(out.length >= 1);
  assert.equal(out[0].severity, "warn");
  assert.match(out[0].fact, /Slowest step: TABLE SCAN on SALES\.ORDERS/);
});

test("analyze reports a highly selective large scan as info with a partition hint", () => {
  const parts = [part({ name: "TABLE SCAN", schema: "S", object: "BIG", inRows: 1_000_000, outRows: 500, duration: 2 })];
  const out = analyze(parts, noWall);
  assert.ok(out.some((i) => /Scan of S\.BIG/.test(i.fact) && /kept/.test(i.fact)));
  assert.ok(out.some((i) => /PARTITION BY/.test(i.advice ?? "")));
});

test("analyze warns on a join fan-out", () => {
  const parts = [part({ name: "JOIN", schema: "S", object: "DIM", inRows: 200_000, outRows: 600_000, duration: 3 })];
  const out = analyze(parts, noWall);
  assert.ok(out.some((i) => i.severity === "warn" && /fan-out/.test(i.fact)));
});

test("analyze warns on heavy inter-node network traffic", () => {
  const parts = [part({ name: "JOIN", duration: 1, net: 120 })];
  const out = analyze(parts, noWall);
  assert.ok(out.some((i) => /MiB moved between cluster nodes/.test(i.fact)));
});

test("analyze warns on disk I/O and surfaces index remarks", () => {
  const parts = [part({ name: "TABLE SCAN", duration: 1, hddRead: 30, hddWrite: 5, remarks: "using index on ORDERS(ID)" })];
  const out = analyze(parts, noWall);
  assert.ok(out.some((i) => /disk I\/O/.test(i.fact)));
  assert.ok(out.some((i) => /Engine remark/.test(i.fact) && /index/.test(i.fact)));
});

test("analyze gives a reassuring note when nothing stands out", () => {
  // Reachable only when wall time is known but no part carries a duration and
  // no resource pressure is measured — so no slowest-step/scan/join insight.
  const wall: ProfileData["wall"] = { duration: 1, commandName: "SELECT", rowCount: 10, cpu: null, tempRam: null, hddRead: null, net: null };
  const parts = [part({ name: "SELECT", duration: null }), part({ name: "FILTER", duration: 0 })];
  const out = analyze(parts, wall);
  assert.equal(out.length, 1);
  assert.match(out[0].fact, /No dominant step/);
});
