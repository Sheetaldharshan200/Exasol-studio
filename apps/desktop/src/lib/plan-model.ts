/**
 * Normalized execution-plan model + the pure pipeline that builds it from raw
 * Exasol profile rows. Faithfully ported from the exasol-labs/exasol-vscode
 * plan module (operatorTaxonomy + planModel + planWarnings + profileRowNormalizer)
 * so Studio's Query Performance plan matches the VS Code extension exactly.
 *
 * Zero UI/driver dependencies by design — testable with plain sample rows.
 * Formatting/colors live in plan-format.ts.
 */

// ── Operator taxonomy ──────────────────────────────────────────────────────

/**
 * Operator taxonomy. Every type below maps to real, documented Exasol profile
 * PART_NAME values (docs.exasol.com › Profiling) — nothing is invented, so a
 * derived type is always evidence-backed by the raw PART_NAME it came from
 * (kept verbatim as PlanNode.operatorLabel). Unrecognized names degrade to
 * OTHER rather than being mis-labeled.
 */
export type OperatorType =
  | "SCAN" | "JOIN" | "GROUP_BY" | "WINDOW" | "SORT" | "SETOP"
  | "NETWORK" | "DML" | "LOAD" | "INDEX" | "CONNECT_BY" | "CACHE"
  | "PUSHDOWN" | "TRANSACTION" | "SYSTEM" | "SYNC" | "OTHER";

export interface OperatorTraits {
  producesRows: boolean;
  consumesRows: boolean;
  canSpill: boolean;
  movesDataOverNetwork: boolean;
  blocking: boolean;
  isSystemStep: boolean;
}

const TRAITS_BY_TYPE: Record<OperatorType, OperatorTraits> = {
  SCAN: { producesRows: true, consumesRows: false, canSpill: false, movesDataOverNetwork: false, blocking: false, isSystemStep: false },
  JOIN: { producesRows: true, consumesRows: true, canSpill: true, movesDataOverNetwork: true, blocking: true, isSystemStep: false },
  GROUP_BY: { producesRows: true, consumesRows: true, canSpill: true, movesDataOverNetwork: true, blocking: true, isSystemStep: false },
  // ANALYTIC FUNCTION — analytic/window computation; can buffer/spill, blocking.
  WINDOW: { producesRows: true, consumesRows: true, canSpill: true, movesDataOverNetwork: false, blocking: true, isSystemStep: false },
  SORT: { producesRows: true, consumesRows: true, canSpill: true, movesDataOverNetwork: false, blocking: true, isSystemStep: false },
  // CREATE UNION / UNION TABLE — pipelined combine, no spill/redistribution.
  SETOP: { producesRows: true, consumesRows: true, canSpill: false, movesDataOverNetwork: false, blocking: false, isSystemStep: false },
  NETWORK: { producesRows: true, consumesRows: true, canSpill: false, movesDataOverNetwork: true, blocking: false, isSystemStep: false },
  DML: { producesRows: false, consumesRows: true, canSpill: false, movesDataOverNetwork: false, blocking: false, isSystemStep: false },
  // IMPORT / EXPORT — move data in/out of the cluster (external transfer).
  LOAD: { producesRows: true, consumesRows: true, canSpill: false, movesDataOverNetwork: true, blocking: false, isSystemStep: false },
  // INDEX CREATE / INSERT / REBUILD — real internal-index work, not a row producer.
  INDEX: { producesRows: false, consumesRows: true, canSpill: false, movesDataOverNetwork: false, blocking: false, isSystemStep: false },
  // CONNECT BY — hierarchical query; iterative, can buffer/spill, blocking.
  CONNECT_BY: { producesRows: true, consumesRows: true, canSpill: true, movesDataOverNetwork: false, blocking: true, isSystemStep: false },
  // QUERY CACHE RESULT — reads a cached result; pure producer.
  CACHE: { producesRows: true, consumesRows: false, canSpill: false, movesDataOverNetwork: false, blocking: false, isSystemStep: false },
  // PUSHDOWN — adapter-generated remote query; fetches over the network.
  PUSHDOWN: { producesRows: true, consumesRows: false, canSpill: false, movesDataOverNetwork: true, blocking: false, isSystemStep: false },
  // COMMIT / ROLLBACK — transaction bookkeeping (system step for cost purposes).
  TRANSACTION: { producesRows: false, consumesRows: false, canSpill: false, movesDataOverNetwork: false, blocking: false, isSystemStep: true },
  SYSTEM: { producesRows: false, consumesRows: false, canSpill: false, movesDataOverNetwork: false, blocking: false, isSystemStep: true },
  // NODE SYNC / WAIT FOR COMMIT — a barrier: real query time, NOT bookkeeping,
  // so kept out of the system-step total and inside the non-system denominator.
  SYNC: { producesRows: false, consumesRows: false, canSpill: false, movesDataOverNetwork: false, blocking: true, isSystemStep: false },
  OTHER: { producesRows: true, consumesRows: true, canSpill: false, movesDataOverNetwork: false, blocking: false, isSystemStep: false },
};

// Substring rules, first match wins. Order is load-bearing: more specific names
// must precede the general keyword they contain (e.g. INDEX INSERT before DML's
// INSERT; WAIT FOR COMMIT before TRANSACTION's COMMIT; SYSTEM TABLE before SCAN).
const TYPE_RULES: Array<{ type: OperatorType; test: (name: string) => boolean }> = [
  { type: "SCAN", test: (n) => n.includes("SYSTEM TABLE") }, // catalog read, not bookkeeping
  { type: "CACHE", test: (n) => n.includes("QUERY CACHE") },
  { type: "INDEX", test: (n) => n.includes("INDEX") }, // INDEX CREATE/INSERT/REBUILD — before DML INSERT
  { type: "PUSHDOWN", test: (n) => n.includes("PUSHDOWN") },
  { type: "SCAN", test: (n) => n.includes("SCAN") },
  { type: "WINDOW", test: (n) => n.includes("ANALYTIC") },
  { type: "JOIN", test: (n) => n.includes("JOIN") || n.includes("EXISTS") }, // FULL/OUTER JOIN, EXISTS/IN (semi-join)
  { type: "GROUP_BY", test: (n) => n.includes("GROUP") || n.includes("AGGREGAT") }, // GROUP BY, GROUPING SETS
  { type: "SORT", test: (n) => n.includes("SORT") || n.includes("ORDER BY") },
  { type: "SETOP", test: (n) => n.includes("UNION") }, // CREATE UNION, UNION TABLE
  { type: "CONNECT_BY", test: (n) => n.includes("CONNECT BY") },
  { type: "SYNC", test: (n) => n.includes("NODE SYNC") || n.includes("WAIT FOR COMMIT") },
  { type: "NETWORK", test: (n) => n.includes("DISTRIBUT") || n.includes("PARTITION") || n.includes("REPLICATE") || n.includes("BROADCAST") || n.includes("REORGANIZE") || n.includes("NETWORK") },
  { type: "LOAD", test: (n) => n.includes("IMPORT") || n.includes("EXPORT") },
  { type: "DML", test: (n) => ["INSERT", "UPDATE", "DELETE", "MERGE", "TRUNCATE"].some((k) => n.includes(k)) },
  { type: "TRANSACTION", test: (n) => n.includes("COMMIT") || n.includes("ROLLBACK") },
  { type: "SYSTEM", test: (n) => ["COMPILE", "EXECUTE", "ALTER SESSION", "COLUMN STATISTICS", "CONSTRAINT CHECK", "RECOMPRESS", "TRANSACTION"].some((k) => n.includes(k)) },
];

export interface OperatorClassification {
  operatorType: OperatorType;
  traits: OperatorTraits;
}

export function classifyOperator(partName: string): OperatorClassification {
  const normalized = (partName || "").toUpperCase();
  const rule = TYPE_RULES.find((r) => r.test(normalized));
  const operatorType = rule?.type ?? "OTHER";
  return { operatorType, traits: TRAITS_BY_TYPE[operatorType] };
}

// ── Plan model ─────────────────────────────────────────────────────────────

export interface PerNodeStat {
  metric: "rows" | "duration";
  min: number;
  max: number;
  avg: number;
  nodeCount: number;
}

export type WarningType =
  | "HIGH_SKEW" | "HIGH_DURATION_SKEW" | "SPILLED_TO_DISK" | "LARGE_REDISTRIBUTION" | "ROW_ESTIMATE_MISMATCH";

export interface PlanWarning {
  type: WarningType;
  message: string;
  detail: Record<string, number | string>;
}

export interface PlanNode {
  id: string;
  operatorType: OperatorType;
  operatorLabel: string;
  traits: OperatorTraits;
  objectSchema: string | undefined;
  objectName: string | undefined;
  partInfo: string | undefined;
  remarks: string | undefined;
  objectRows: number | undefined;
  rowsOut: number | undefined;
  duration: number | undefined;
  cpu: number | undefined;
  net: number | undefined;
  tempDbRamPeak: number | undefined;
  hddWrite: number | undefined;
  hddRead: number | undefined;
  costPercent: number | undefined;
  perNodeStats: PerNodeStat | undefined;
  perNodeDurationStats: PerNodeStat | undefined;
  warnings: PlanWarning[];
  children: string[];
}

export interface Plan {
  sessionId: string;
  stmtId: string;
  queryText: string | undefined;
  totalDuration: number;
  nodes: PlanNode[];
  edges: Array<{ from: string; to: string }>;
  perNodeStatsAvailable: boolean;
  source: "DETAILS" | "DBA_SUMMARY" | "USER_SUMMARY";
}

// ── Warnings ───────────────────────────────────────────────────────────────

export interface WarningThresholds {
  skewRatio: number;
  redistributionCostSharePercent: number;
  skewMinRows: number;
  durationSkewMinSeconds: number;
}

export const DEFAULT_WARNING_THRESHOLDS: WarningThresholds = {
  skewRatio: 0.3,
  redistributionCostSharePercent: 20,
  skewMinRows: 1000,
  durationSkewMinSeconds: 0.05,
};

interface WarningInputs {
  traits: OperatorTraits;
  hddWrite: number | undefined;
  net: number | undefined;
  perNodeStats: PerNodeStat | undefined;
  perNodeDurationStats: PerNodeStat | undefined;
  costPercent: number | undefined;
}

export function computeWarnings(node: WarningInputs, thresholds: WarningThresholds = DEFAULT_WARNING_THRESHOLDS): PlanWarning[] {
  const warnings: PlanWarning[] = [];

  if (node.traits.canSpill && node.hddWrite !== undefined && node.hddWrite > 0) {
    warnings.push({
      type: "SPILLED_TO_DISK",
      message: `Wrote ${node.hddWrite.toFixed(1)} MiB to disk during execution`,
      detail: { hddWriteMiB: node.hddWrite },
    });
  }

  if (
    node.traits.movesDataOverNetwork &&
    node.net !== undefined && node.net > 0 &&
    node.costPercent !== undefined && node.costPercent > thresholds.redistributionCostSharePercent
  ) {
    warnings.push({
      type: "LARGE_REDISTRIBUTION",
      message: `Moved ${node.net.toFixed(1)} MiB across the network — this step alone accounted for ${node.costPercent.toFixed(1)}% of the query's total time (threshold ${thresholds.redistributionCostSharePercent}%)`,
      detail: { netMiB: node.net, costPercent: node.costPercent, thresholdPercent: thresholds.redistributionCostSharePercent },
    });
  }

  if (node.perNodeStats && node.perNodeStats.nodeCount > 1 && node.perNodeStats.avg > 0) {
    const ratio = (node.perNodeStats.max - node.perNodeStats.avg) / node.perNodeStats.avg;
    if (ratio > thresholds.skewRatio && node.perNodeStats.max >= thresholds.skewMinRows) {
      warnings.push({
        type: "HIGH_SKEW",
        message: `Rows per node ranged ${node.perNodeStats.min}-${node.perNodeStats.max} (avg ${node.perNodeStats.avg.toFixed(0)}) across ${node.perNodeStats.nodeCount} nodes`,
        detail: { min: node.perNodeStats.min, max: node.perNodeStats.max, avg: node.perNodeStats.avg, nodeCount: node.perNodeStats.nodeCount, ratio },
      });
    }
  }

  if (
    node.traits.blocking && !node.traits.isSystemStep &&
    (node.traits.producesRows || node.traits.consumesRows) &&
    node.perNodeDurationStats && node.perNodeDurationStats.nodeCount > 1 && node.perNodeDurationStats.avg > 0
  ) {
    const stats = node.perNodeDurationStats;
    const ratio = (stats.max - stats.avg) / stats.avg;
    if (ratio > thresholds.skewRatio && stats.max >= thresholds.durationSkewMinSeconds) {
      warnings.push({
        type: "HIGH_DURATION_SKEW",
        message: `Slowest node took ${(stats.max * 1000).toFixed(0)}ms vs ${(stats.avg * 1000).toFixed(0)}ms average across ${stats.nodeCount} nodes`,
        detail: { minSeconds: stats.min, maxSeconds: stats.max, avgSeconds: stats.avg, nodeCount: stats.nodeCount, ratio },
      });
    }
  }

  // ROW_ESTIMATE_MISMATCH never fires: these views expose no pre-execution estimate.
  return warnings;
}

// ── Normalization: raw rows → Plan ─────────────────────────────────────────

export interface RawProfileRow {
  sessionId: string;
  stmtId: string;
  partId: number;
  iproc: number | undefined;
  partName: string;
  partInfo: string | undefined;
  objectSchema: string | undefined;
  objectName: string | undefined;
  objectRows: number | undefined;
  outRows: number | undefined;
  duration: number | undefined;
  cpu: number | undefined;
  tempDbRamPeak: number | undefined;
  hddWrite: number | undefined;
  hddRead: number | undefined;
  net: number | undefined;
  remarks: string | undefined;
  sqlText: string | undefined;
}

export type ProfileSource = Plan["source"];

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toStringOrUndefined(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value);
  return s.length > 0 ? s : undefined;
}

export function mapDbRowToRawProfileRow(row: Record<string, unknown>): RawProfileRow {
  return {
    sessionId: toStringOrUndefined(row.SESSION_ID) ?? "",
    stmtId: toStringOrUndefined(row.STMT_ID) ?? "",
    partId: toNumber(row.PART_ID) ?? 0,
    iproc: toNumber(row.IPROC),
    partName: toStringOrUndefined(row.PART_NAME) ?? "UNKNOWN",
    partInfo: toStringOrUndefined(row.PART_INFO),
    objectSchema: toStringOrUndefined(row.OBJECT_SCHEMA),
    objectName: toStringOrUndefined(row.OBJECT_NAME),
    objectRows: toNumber(row.OBJECT_ROWS),
    outRows: toNumber(row.OUT_ROWS),
    duration: toNumber(row.DURATION),
    cpu: toNumber(row.CPU),
    tempDbRamPeak: toNumber(row.TEMP_DB_RAM_PEAK),
    hddWrite: toNumber(row.HDD_WRITE),
    hddRead: toNumber(row.HDD_READ),
    net: toNumber(row.NET),
    remarks: toStringOrUndefined(row.REMARKS),
    sqlText: toStringOrUndefined(row.SQL_TEXT),
  };
}

function sum(values: Array<number | undefined>): number | undefined {
  const defined = values.filter((v): v is number => v !== undefined);
  return defined.length > 0 ? defined.reduce((a, b) => a + b, 0) : undefined;
}

function max(values: Array<number | undefined>): number | undefined {
  const defined = values.filter((v): v is number => v !== undefined);
  return defined.length > 0 ? Math.max(...defined) : undefined;
}

interface CollapsedGroup {
  collapsed: RawProfileRow;
  perNodeStats: PerNodeStat | undefined;
  perNodeDurationStats: PerNodeStat | undefined;
}

function collapseGroup(rows: RawProfileRow[]): CollapsedGroup {
  const first = rows[0];
  const isPerNode = rows.every((r) => r.iproc !== undefined);

  const collapsed: RawProfileRow = {
    ...first,
    objectRows: sum(rows.map((r) => r.objectRows)),
    outRows: sum(rows.map((r) => r.outRows)),
    duration: max(rows.map((r) => r.duration)),
    cpu: max(rows.map((r) => r.cpu)),
    tempDbRamPeak: max(rows.map((r) => r.tempDbRamPeak)),
    hddWrite: sum(rows.map((r) => r.hddWrite)),
    hddRead: max(rows.map((r) => r.hddRead)),
    net: sum(rows.map((r) => r.net)),
  };

  if (!isPerNode) return { collapsed, perNodeStats: undefined, perNodeDurationStats: undefined };

  const rowCounts = rows.map((r) => r.outRows).filter((v): v is number => v !== undefined);
  const perNodeStats: PerNodeStat | undefined = rowCounts.length > 0
    ? { metric: "rows", min: Math.min(...rowCounts), max: Math.max(...rowCounts), avg: rowCounts.reduce((a, b) => a + b, 0) / rowCounts.length, nodeCount: rowCounts.length }
    : undefined;

  const durations = rows.map((r) => r.duration).filter((v): v is number => v !== undefined);
  const perNodeDurationStats: PerNodeStat | undefined = durations.length > 0
    ? { metric: "duration", min: Math.min(...durations), max: Math.max(...durations), avg: durations.reduce((a, b) => a + b, 0) / durations.length, nodeCount: durations.length }
    : undefined;

  return { collapsed, perNodeStats, perNodeDurationStats };
}

function buildNode(
  partId: number,
  collapsed: RawProfileRow,
  perNodeStats: PerNodeStat | undefined,
  perNodeDurationStats: PerNodeStat | undefined,
  classification: OperatorClassification,
  totalDuration: number,
  nonSystemDuration: number,
  thresholds: WarningThresholds,
): PlanNode {
  const { operatorType, traits } = classification;
  const denominator = traits.isSystemStep ? totalDuration : nonSystemDuration;
  const costPercent = denominator > 0 && collapsed.duration !== undefined ? (collapsed.duration / denominator) * 100 : undefined;
  const warnings = computeWarnings({ traits, hddWrite: collapsed.hddWrite, net: collapsed.net, perNodeStats, perNodeDurationStats, costPercent }, thresholds);
  return {
    id: String(partId),
    operatorType,
    operatorLabel: collapsed.partName,
    traits,
    objectSchema: collapsed.objectSchema,
    objectName: collapsed.objectName,
    partInfo: collapsed.partInfo,
    remarks: collapsed.remarks,
    objectRows: collapsed.objectRows,
    rowsOut: collapsed.outRows,
    duration: collapsed.duration,
    cpu: collapsed.cpu,
    net: collapsed.net,
    tempDbRamPeak: collapsed.tempDbRamPeak,
    hddWrite: collapsed.hddWrite,
    hddRead: collapsed.hddRead,
    costPercent,
    perNodeStats,
    perNodeDurationStats,
    warnings,
    children: [],
  };
}

export function normalizeProfileRows(
  rawRows: Record<string, unknown>[],
  context: { sessionId: string; stmtId: string; source: ProfileSource },
  thresholds: WarningThresholds = DEFAULT_WARNING_THRESHOLDS,
): Plan {
  const rows = rawRows
    .map(mapDbRowToRawProfileRow)
    .filter((r) => r.sessionId === context.sessionId && r.stmtId === context.stmtId);

  const byPartId = new Map<number, RawProfileRow[]>();
  for (const row of rows) {
    const group = byPartId.get(row.partId);
    if (group) group.push(row);
    else byPartId.set(row.partId, [row]);
  }

  const partIds = Array.from(byPartId.keys()).sort((a, b) => a - b);
  const collapsedByPartId = partIds.map((partId) => ({ partId, ...collapseGroup(byPartId.get(partId)!) }));
  const classifications = collapsedByPartId.map((g) => classifyOperator(g.collapsed.partName));

  const totalDuration = sum(collapsedByPartId.map((g) => g.collapsed.duration)) ?? 0;
  const systemDuration = sum(collapsedByPartId.map((g, i) => (classifications[i].traits.isSystemStep ? g.collapsed.duration : undefined))) ?? 0;
  const nonSystemDuration = totalDuration - systemDuration;

  const nodes = collapsedByPartId.map((g, i) =>
    buildNode(g.partId, g.collapsed, g.perNodeStats, g.perNodeDurationStats, classifications[i], totalDuration, nonSystemDuration, thresholds),
  );

  return {
    sessionId: context.sessionId,
    stmtId: context.stmtId,
    queryText: rows.find((r) => r.sqlText !== undefined)?.sqlText,
    totalDuration,
    nodes,
    edges: [],
    perNodeStatsAvailable: nodes.some((n) => n.perNodeStats !== undefined),
    source: context.source,
  };
}
