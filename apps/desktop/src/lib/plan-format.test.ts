import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fmtMs, fmtRows, fmtPct, fmtMiB, fmtCpuPct,
  planCategoryBreakdown, planClusterSize, planLacksDetailMetrics, hottestNodeId,
  sortedWarningItems, planSourceLabel,
} from "./plan-format.ts";
import type { Plan, PlanNode } from "./plan-model.ts";

test("fmtMs scales precision with magnitude and blanks undefined", () => {
  assert.equal(fmtMs(undefined), "—");
  assert.equal(fmtMs(0.0005), "0.500 ms");
  assert.equal(fmtMs(0.05), "50.0 ms");
  assert.equal(fmtMs(1.2), "1200 ms");
});

test("fmtRows abbreviates with k/M/B", () => {
  assert.equal(fmtRows(undefined), "—");
  assert.equal(fmtRows(42), "42");
  assert.equal(fmtRows(1500), "1.5k");
  assert.equal(fmtRows(2_000_000), "2.0M");
  assert.equal(fmtRows(3_000_000_000), "3.0B");
});

test("fmtPct / fmtMiB / fmtCpuPct edge cases", () => {
  assert.equal(fmtPct(undefined), "—");
  assert.equal(fmtPct(0.4), "<1%");
  assert.equal(fmtPct(62.6), "63%");
  assert.equal(fmtMiB(undefined), "—");
  assert.equal(fmtMiB(3), "3.0 MiB");
  assert.equal(fmtCpuPct(undefined), "—");
  assert.equal(fmtCpuPct(80), "80%");
});

function node(o: Partial<PlanNode>): PlanNode {
  return {
    id: "1", operatorType: "SCAN", operatorLabel: "SCAN",
    traits: { producesRows: true, consumesRows: false, canSpill: false, movesDataOverNetwork: false, blocking: false, isSystemStep: false },
    objectSchema: undefined, objectName: undefined, partInfo: undefined, remarks: undefined,
    objectRows: undefined, rowsOut: undefined, duration: undefined, cpu: undefined, net: undefined,
    tempDbRamPeak: undefined, hddWrite: undefined, hddRead: undefined, costPercent: undefined,
    perNodeStats: undefined, perNodeDurationStats: undefined, warnings: [], children: [], ...o,
  };
}

function plan(o: Partial<Plan>): Plan {
  return { sessionId: "1", stmtId: "10", queryText: undefined, totalDuration: 0, nodes: [], edges: [], perNodeStatsAvailable: false, source: "USER_SUMMARY", ...o };
}

test("planCategoryBreakdown buckets duration by operator type, sorted desc", () => {
  const p = plan({
    totalDuration: 10,
    nodes: [
      node({ id: "1", operatorType: "SCAN", duration: 6 }),
      node({ id: "2", operatorType: "JOIN", duration: 3 }),
      node({ id: "3", operatorType: "SCAN", duration: 1 }),
    ],
  });
  const bd = planCategoryBreakdown(p);
  assert.equal(bd[0].type, "SCAN");
  assert.equal(bd[0].durationSum, 7);
  assert.equal(Math.round(bd[0].percent), 70);
  assert.equal(bd[1].type, "JOIN");
});

test("planCategoryBreakdown is empty when there is no duration", () => {
  assert.deepEqual(planCategoryBreakdown(plan({ totalDuration: 0 })), []);
});

test("planClusterSize is the max observed node count, else undefined", () => {
  assert.equal(planClusterSize(plan({ nodes: [node({})] })), undefined);
  assert.equal(planClusterSize(plan({ nodes: [node({ perNodeStats: { metric: "rows", min: 1, max: 2, avg: 1.5, nodeCount: 4 } })] })), 4);
});

test("planLacksDetailMetrics is true only when no node has cpu or net", () => {
  assert.equal(planLacksDetailMetrics(plan({ nodes: [node({})] })), true);
  assert.equal(planLacksDetailMetrics(plan({ nodes: [node({ cpu: 50 })] })), false);
  assert.equal(planLacksDetailMetrics(plan({ nodes: [] })), false);
});

test("hottestNodeId ignores system steps and picks the max cost", () => {
  const p = plan({
    nodes: [
      node({ id: "1", operatorType: "SYSTEM", traits: { producesRows: false, consumesRows: false, canSpill: false, movesDataOverNetwork: false, blocking: false, isSystemStep: true }, costPercent: 99 }),
      node({ id: "2", costPercent: 40 }),
      node({ id: "3", costPercent: 55 }),
    ],
  });
  assert.equal(hottestNodeId(p), "3");
});

test("hottestNodeId is undefined when no node has a cost", () => {
  assert.equal(hottestNodeId(plan({ nodes: [node({})] })), undefined);
});

test("sortedWarningItems orders spill/redistribution before skew", () => {
  const p = plan({
    nodes: [
      node({ id: "1", warnings: [{ type: "HIGH_SKEW", message: "skew", detail: { ratio: 2, max: 9000 } }] }),
      node({ id: "2", warnings: [{ type: "SPILLED_TO_DISK", message: "spill", detail: {} }] }),
    ],
  });
  const items = sortedWarningItems(p);
  assert.equal(items[0].warning.type, "SPILLED_TO_DISK");
  assert.equal(items[1].warning.type, "HIGH_SKEW");
});

test("planSourceLabel names each source", () => {
  assert.equal(planSourceLabel("DETAILS"), "per-node detail");
  assert.equal(planSourceLabel("DBA_SUMMARY"), "cluster summary (DBA)");
  assert.equal(planSourceLabel("USER_SUMMARY"), "cluster summary");
});
