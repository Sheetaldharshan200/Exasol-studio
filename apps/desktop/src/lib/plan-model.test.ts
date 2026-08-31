import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyOperator, computeWarnings, normalizeProfileRows, type WarningThresholds } from "./plan-model.ts";

test("classifyOperator recognizes operator families by substring", () => {
  // Each case is a documented Exasol PART_NAME (docs.exasol.com › Profiling).
  assert.equal(classifyOperator("SCAN").operatorType, "SCAN");
  assert.equal(classifyOperator("SYSTEM TABLE").operatorType, "SCAN"); // catalog read, not bookkeeping
  assert.equal(classifyOperator("PIPE JOIN").operatorType, "JOIN");
  assert.equal(classifyOperator("FULL JOIN").operatorType, "JOIN");
  assert.equal(classifyOperator("OUTER JOIN").operatorType, "JOIN");
  assert.equal(classifyOperator("EXISTS").operatorType, "JOIN"); // semi-join
  assert.equal(classifyOperator("GROUP BY").operatorType, "GROUP_BY");
  assert.equal(classifyOperator("GROUPING SETS").operatorType, "GROUP_BY");
  assert.equal(classifyOperator("PIPE AGGREGATOR").operatorType, "GROUP_BY");
  assert.equal(classifyOperator("ANALYTIC FUNCTION").operatorType, "WINDOW");
  assert.equal(classifyOperator("SORT").operatorType, "SORT");
  assert.equal(classifyOperator("CREATE UNION").operatorType, "SETOP");
  assert.equal(classifyOperator("UNION TABLE").operatorType, "SETOP");
  assert.equal(classifyOperator("CONNECT BY").operatorType, "CONNECT_BY");
  assert.equal(classifyOperator("NODE SYNC").operatorType, "SYNC");
  assert.equal(classifyOperator("DISTRIBUTE / PARTITION").operatorType, "NETWORK");
  assert.equal(classifyOperator("REPLICATE").operatorType, "NETWORK");
  assert.equal(classifyOperator("IMPORT").operatorType, "LOAD");
  assert.equal(classifyOperator("EXPORT").operatorType, "LOAD");
  assert.equal(classifyOperator("INSERT").operatorType, "DML");
  assert.equal(classifyOperator("DELETE").operatorType, "DML");
  assert.equal(classifyOperator("QUERY CACHE RESULT").operatorType, "CACHE");
  assert.equal(classifyOperator("PUSHDOWN").operatorType, "PUSHDOWN");
  assert.equal(classifyOperator("COMMIT").operatorType, "TRANSACTION");
  assert.equal(classifyOperator("ROLLBACK").operatorType, "TRANSACTION");
  assert.equal(classifyOperator("COMPILE/EXECUTE").operatorType, "SYSTEM");
  assert.equal(classifyOperator("COLUMN STATISTICS").operatorType, "SYSTEM");
  assert.equal(classifyOperator("PREFERENCE PROCESSING").operatorType, "OTHER");
  assert.equal(classifyOperator("").operatorType, "OTHER");
});

test("classifyOperator ordering: specific names win over the general keyword they contain", () => {
  assert.equal(classifyOperator("INDEX INSERT").operatorType, "INDEX"); // not DML (INSERT)
  assert.equal(classifyOperator("INDEX CREATE").operatorType, "INDEX");
  assert.equal(classifyOperator("WAIT FOR COMMIT").operatorType, "SYNC"); // not TRANSACTION (COMMIT)
  assert.equal(classifyOperator("SYSTEM TABLE").operatorType, "SCAN"); // not SYSTEM
});

test("classifyOperator marks only true bookkeeping as a system step", () => {
  assert.equal(classifyOperator("COMPILE").traits.isSystemStep, true);
  assert.equal(classifyOperator("NODE SYNC").traits.isSystemStep, false); // real query time
  assert.equal(classifyOperator("TABLE SCAN").traits.isSystemStep, false);
});

test("computeWarnings flags a spill only on spill-capable operators", () => {
  const join = classifyOperator("JOIN").traits;
  const scan = classifyOperator("TABLE SCAN").traits;
  assert.equal(computeWarnings({ traits: join, hddWrite: 12, net: undefined, perNodeStats: undefined, perNodeDurationStats: undefined, costPercent: 5 }).some((w) => w.type === "SPILLED_TO_DISK"), true);
  // A scan can't spill — same hddWrite must not fire.
  assert.equal(computeWarnings({ traits: scan, hddWrite: 12, net: undefined, perNodeStats: undefined, perNodeDurationStats: undefined, costPercent: 5 }).some((w) => w.type === "SPILLED_TO_DISK"), false);
});

test("computeWarnings flags a large redistribution only past the cost threshold", () => {
  const net = classifyOperator("REDISTRIBUTE").traits;
  const under = computeWarnings({ traits: net, hddWrite: undefined, net: 80, perNodeStats: undefined, perNodeDurationStats: undefined, costPercent: 10 });
  const over = computeWarnings({ traits: net, hddWrite: undefined, net: 80, perNodeStats: undefined, perNodeDurationStats: undefined, costPercent: 30 });
  assert.equal(under.some((w) => w.type === "LARGE_REDISTRIBUTION"), false);
  assert.equal(over.some((w) => w.type === "LARGE_REDISTRIBUTION"), true);
});

test("computeWarnings row-skew respects the noise floor", () => {
  const join = classifyOperator("JOIN").traits;
  const base = { traits: join, hddWrite: undefined, net: undefined, perNodeDurationStats: undefined, costPercent: 5 };
  // Skewed but tiny row counts (< skewMinRows) must NOT fire.
  assert.equal(computeWarnings({ ...base, perNodeStats: { metric: "rows", min: 0, max: 4, avg: 1, nodeCount: 4 } }).some((w) => w.type === "HIGH_SKEW"), false);
  // Skewed AND large enough → fires.
  assert.equal(computeWarnings({ ...base, perNodeStats: { metric: "rows", min: 100, max: 5000, avg: 1500, nodeCount: 4 } }).some((w) => w.type === "HIGH_SKEW"), true);
});

/** A raw DB row (column names as Exasol returns them). */
function row(o: Partial<Record<string, unknown>>): Record<string, unknown> {
  return { SESSION_ID: "1", STMT_ID: "10", ...o };
}

test("normalizeProfileRows builds nodes ordered by PART_ID with cost shares", () => {
  const rows = [
    row({ PART_ID: 2, PART_NAME: "GROUP BY", DURATION: 1 }),
    row({ PART_ID: 1, PART_NAME: "TABLE SCAN", OBJECT_SCHEMA: "S", OBJECT_NAME: "T", OBJECT_ROWS: 1000, OUT_ROWS: 100, DURATION: 3 }),
  ];
  const plan = normalizeProfileRows(rows, { sessionId: "1", stmtId: "10", source: "USER_SUMMARY" });
  assert.deepEqual(plan.nodes.map((n) => n.id), ["1", "2"]); // sorted by PART_ID
  assert.equal(plan.totalDuration, 4);
  assert.equal(plan.perNodeStatsAvailable, false); // no IPROC
  // Non-system denominator = 4 (no system steps): scan 3/4 = 75%.
  assert.equal(Math.round(plan.nodes[0].costPercent!), 75);
});

test("normalizeProfileRows excludes system-step time from the non-system denominator", () => {
  const rows = [
    row({ PART_ID: 1, PART_NAME: "COMPILE", DURATION: 6 }), // system step
    row({ PART_ID: 2, PART_NAME: "TABLE SCAN", DURATION: 3 }),
    row({ PART_ID: 3, PART_NAME: "JOIN", DURATION: 1 }),
  ];
  const plan = normalizeProfileRows(rows, { sessionId: "1", stmtId: "10", source: "USER_SUMMARY" });
  assert.equal(plan.totalDuration, 10); // wall stays over everything
  // System step divides by total: 6/10 = 60%.
  assert.equal(Math.round(plan.nodes[0].costPercent!), 60);
  // Scan divides by non-system (10-6=4): 3/4 = 75%.
  assert.equal(Math.round(plan.nodes[1].costPercent!), 75);
});

test("normalizeProfileRows computes per-node skew from IPROC rows", () => {
  const rows = [
    row({ PART_ID: 1, IPROC: 0, PART_NAME: "JOIN", OUT_ROWS: 100, DURATION: 0.5 }),
    row({ PART_ID: 1, IPROC: 1, PART_NAME: "JOIN", OUT_ROWS: 100, DURATION: 0.5 }),
    row({ PART_ID: 1, IPROC: 2, PART_NAME: "JOIN", OUT_ROWS: 100, DURATION: 0.5 }),
    row({ PART_ID: 1, IPROC: 3, PART_NAME: "JOIN", OUT_ROWS: 9000, DURATION: 0.5 }),
  ];
  const plan = normalizeProfileRows(rows, { sessionId: "1", stmtId: "10", source: "DETAILS" });
  assert.equal(plan.perNodeStatsAvailable, true);
  const node = plan.nodes[0];
  assert.equal(node.perNodeStats?.nodeCount, 4);
  assert.equal(node.perNodeStats?.max, 9000);
  assert.equal(node.rowsOut, 9300); // OUT_ROWS summed across nodes
  assert.equal(node.warnings.some((w) => w.type === "HIGH_SKEW"), true);
});

test("normalizeProfileRows ignores rows from other statements/sessions", () => {
  const rows = [
    row({ PART_ID: 1, PART_NAME: "SCAN", DURATION: 1 }),
    row({ SESSION_ID: "1", STMT_ID: "99", PART_ID: 1, PART_NAME: "SCAN", DURATION: 5 }),
  ];
  const plan = normalizeProfileRows(rows, { sessionId: "1", stmtId: "10", source: "USER_SUMMARY" });
  assert.equal(plan.nodes.length, 1);
  assert.equal(plan.totalDuration, 1);
});

test("normalizeProfileRows tolerates an empty result", () => {
  const plan = normalizeProfileRows([], { sessionId: "1", stmtId: "10", source: "USER_SUMMARY" });
  assert.deepEqual(plan.nodes, []);
  assert.equal(plan.totalDuration, 0);
  assert.equal(plan.perNodeStatsAvailable, false);
});

test("normalizeProfileRows honors custom thresholds", () => {
  const strict: WarningThresholds = { skewRatio: 0.3, redistributionCostSharePercent: 20, skewMinRows: 1, durationSkewMinSeconds: 0.05 };
  const rows = [
    row({ PART_ID: 1, IPROC: 0, PART_NAME: "JOIN", OUT_ROWS: 1, DURATION: 0.1 }),
    row({ PART_ID: 1, IPROC: 1, PART_NAME: "JOIN", OUT_ROWS: 100, DURATION: 0.1 }),
  ];
  const plan = normalizeProfileRows(rows, { sessionId: "1", stmtId: "10", source: "DETAILS" }, strict);
  assert.equal(plan.nodes[0].warnings.some((w) => w.type === "HIGH_SKEW"), true);
});

