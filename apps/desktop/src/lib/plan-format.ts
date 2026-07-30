/**
 * Pure formatting + palette for the execution-plan view, ported from
 * exasol-vscode's planFormat.ts. VS Code chart theme variables are mapped to
 * concrete colors that read on both light and dark app themes.
 */
import type { OperatorType, Plan, PlanNode, PlanWarning } from "./plan-model";

export const OPERATOR_BADGE: Record<OperatorType, string> = {
  SCAN: "S", JOIN: "J", GROUP_BY: "G", WINDOW: "W", SORT: "O", SETOP: "U",
  NETWORK: "N", DML: "D", LOAD: "L", INDEX: "I", CONNECT_BY: "H", CACHE: "C",
  PUSHDOWN: "P", TRANSACTION: "T", SYSTEM: "⚙", SYNC: "‖", OTHER: "⋯",
};

/** Operator hue — distinct, theme-legible chart colors; bookkeeping kinds use
 *  theme tokens. */
export const OPERATOR_COLOR: Record<OperatorType, string> = {
  SCAN: "#3b82f6",       // blue
  JOIN: "#a855f7",       // purple
  GROUP_BY: "#22c55e",   // green
  WINDOW: "#14b8a6",     // teal
  SORT: "#eab308",       // yellow
  SETOP: "#06b6d4",      // cyan
  NETWORK: "#f97316",    // orange
  DML: "#ef4444",        // red
  LOAD: "#f43f5e",       // rose
  INDEX: "#6366f1",      // indigo
  CONNECT_BY: "#d946ef", // fuchsia
  CACHE: "#84cc16",      // lime
  PUSHDOWN: "#0ea5e9",   // sky
  TRANSACTION: "var(--muted-foreground)",
  SYSTEM: "var(--muted-foreground)",
  SYNC: "#ec4899",       // pink
  OTHER: "var(--foreground)",
};

/** The plan's single highest-cost operator is drawn in this attention color. */
export const HOT_COLOR = "#ef4444";

export const OPERATOR_TYPE_LABEL: Record<OperatorType, string> = {
  SCAN: "Scan", JOIN: "Join", GROUP_BY: "Group By", WINDOW: "Window", SORT: "Sort", SETOP: "Set Op",
  NETWORK: "Network", DML: "DML", LOAD: "Load", INDEX: "Index", CONNECT_BY: "Connect By", CACHE: "Cache",
  PUSHDOWN: "Pushdown", TRANSACTION: "Transaction", SYSTEM: "System", SYNC: "Sync", OTHER: "Other",
};

export const WARNING_LABEL: Record<PlanWarning["type"], string> = {
  HIGH_SKEW: "Row skew",
  HIGH_DURATION_SKEW: "Duration skew",
  SPILLED_TO_DISK: "Spilled to disk",
  LARGE_REDISTRIBUTION: "Large redistribution",
  ROW_ESTIMATE_MISMATCH: "Row estimate mismatch",
};

export function fmtMs(seconds: number | undefined): string {
  if (seconds === undefined) return "—";
  const ms = seconds * 1000;
  if (ms < 1) return `${ms.toFixed(3)} ms`;
  if (ms < 100) return `${ms.toFixed(1)} ms`;
  return `${ms.toFixed(0)} ms`;
}

export function fmtRows(n: number | undefined): string {
  if (n === undefined) return "—";
  const roundedMillions = n / 1_000_000;
  if (n >= 1_000_000_000 || roundedMillions >= 999.5) return `${(n / 1_000_000_000).toFixed(n >= 99_950_000_000 ? 0 : 1)}B`;
  const roundedThousands = n / 1_000;
  if (n >= 1_000_000 || roundedThousands >= 999.5) return `${(n / 1_000_000).toFixed(n >= 99_950_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return String(n);
}

export function fmtPct(p: number | undefined): string {
  if (p === undefined) return "—";
  return p < 1 ? "<1%" : `${p.toFixed(0)}%`;
}

export function fmtMiB(n: number | undefined): string {
  if (n === undefined) return "—";
  return `${n.toFixed(1)} MiB`;
}

export function fmtCpuPct(n: number | undefined): string {
  if (n === undefined) return "—";
  return `${n}%`;
}

export function planSourceLabel(source: Plan["source"]): string {
  return source === "DETAILS" ? "per-node detail" : source === "DBA_SUMMARY" ? "cluster summary (DBA)" : "cluster summary";
}

export function planClusterSize(plan: Plan): number | undefined {
  const counts = plan.nodes.map((n) => n.perNodeStats?.nodeCount).filter((n): n is number => n !== undefined);
  return counts.length > 0 ? Math.max(...counts) : undefined;
}

export interface CategoryTime {
  type: OperatorType;
  label: string;
  color: string;
  durationSum: number;
  percent: number;
}

export function planCategoryBreakdown(plan: Plan): CategoryTime[] {
  if (plan.totalDuration <= 0) return [];
  const sums = new Map<OperatorType, number>();
  for (const node of plan.nodes) {
    if (node.duration === undefined) continue;
    sums.set(node.operatorType, (sums.get(node.operatorType) ?? 0) + node.duration);
  }
  return Array.from(sums.entries())
    .map(([type, durationSum]) => ({
      type,
      label: OPERATOR_TYPE_LABEL[type],
      color: OPERATOR_COLOR[type],
      durationSum,
      percent: (durationSum / plan.totalDuration) * 100,
    }))
    .sort((a, b) => b.percent - a.percent);
}

export function planLacksDetailMetrics(plan: Plan): boolean {
  return plan.nodes.length > 0 && plan.nodes.every((n) => n.cpu === undefined && n.net === undefined);
}

export function hottestNodeId(plan: Plan): string | undefined {
  let hottest: { id: string; costPercent: number } | undefined;
  for (const node of plan.nodes) {
    if (node.traits.isSystemStep || node.costPercent === undefined) continue;
    if (!hottest || node.costPercent > hottest.costPercent) hottest = { id: node.id, costPercent: node.costPercent };
  }
  return hottest?.id;
}

/** Rail order: real spill / dominant redistribution first, then skew by impact. */
const WARNING_PRIORITY: Record<PlanWarning["type"], number> = {
  SPILLED_TO_DISK: 0,
  LARGE_REDISTRIBUTION: 1,
  HIGH_DURATION_SKEW: 2,
  HIGH_SKEW: 3,
  ROW_ESTIMATE_MISMATCH: 4,
};

function warningImpact(warning: PlanWarning): number {
  const ratio = typeof warning.detail.ratio === "number" ? warning.detail.ratio : 0;
  if (warning.type === "HIGH_SKEW") {
    const m = typeof warning.detail.max === "number" ? warning.detail.max : 0;
    return ratio * m;
  }
  if (warning.type === "HIGH_DURATION_SKEW") {
    const m = typeof warning.detail.maxSeconds === "number" ? warning.detail.maxSeconds : 0;
    return ratio * m;
  }
  return 0;
}

export function sortedWarningItems(plan: Plan): Array<{ node: Plan["nodes"][number]; warning: PlanWarning }> {
  const items = plan.nodes.flatMap((node) => node.warnings.map((warning) => ({ node, warning })));
  return items.slice().sort((a, b) => {
    const priorityDiff = WARNING_PRIORITY[a.warning.type] - WARNING_PRIORITY[b.warning.type];
    return priorityDiff !== 0 ? priorityDiff : warningImpact(b.warning) - warningImpact(a.warning);
  });
}

/** Fixed legend order: data-flow operators first, then movement/IO, then the
 *  bookkeeping/barrier kinds last, ending on the catch-all Other. */
export const LEGEND_ORDER: OperatorType[] = [
  "SCAN", "CACHE", "PUSHDOWN", "JOIN", "GROUP_BY", "WINDOW", "SORT", "SETOP", "CONNECT_BY",
  "NETWORK", "DML", "LOAD", "INDEX", "SYNC", "TRANSACTION", "SYSTEM", "OTHER",
];

/** "N rows → M (P%)" scan selectivity; never a percentage over 100% (that
 *  would signal a data problem, not real selectivity). */
export function scannedSelectivity(node: PlanNode): string | undefined {
  if (node.objectRows === undefined || node.objectRows === 0 || node.rowsOut === undefined) return undefined;
  const rowsPart = `${node.objectRows.toLocaleString()} rows → ${node.rowsOut.toLocaleString()}`;
  if (node.rowsOut > node.objectRows) return rowsPart;
  return `${rowsPart} (${((node.rowsOut / node.objectRows) * 100).toFixed(1)}%)`;
}

/** A non-system node's cost excludes bookkeeping time; a system step's is of total. */
export function durationShareLabel(node: PlanNode): string {
  return node.traits.isSystemStep ? "Duration share (of total)" : "Duration share (of query)";
}

/** A plain-text plan summary for clipboard export (block-formatted, not
 *  column-aligned, so it reads in proportional-font destinations too). */
export function buildPlanText(plan: Plan): string {
  const lines: string[] = [];
  lines.push("Query execution plan");
  lines.push(`Session ${plan.sessionId} · Statement ${plan.stmtId}`);
  lines.push(`Total time ${fmtMs(plan.totalDuration)} · ${plan.nodes.length} operator${plan.nodes.length === 1 ? "" : "s"} · source ${planSourceLabel(plan.source)}`);
  const cluster = planClusterSize(plan);
  if (cluster !== undefined) lines.push(`Nodes observed: ${cluster}`);
  lines.push("");
  for (const node of plan.nodes) {
    const obj = node.objectName ? ` on ${node.objectSchema ? node.objectSchema + "." : ""}${node.objectName}` : "";
    lines.push(`[${node.id}] ${node.operatorLabel} (${OPERATOR_TYPE_LABEL[node.operatorType]})${obj}`);
    const facts = [
      `Duration ${fmtMs(node.duration)} (${fmtPct(node.costPercent)})`,
      node.cpu !== undefined ? `CPU ${fmtCpuPct(node.cpu)}` : undefined,
      node.rowsOut !== undefined ? `Rows out ${node.rowsOut.toLocaleString()}` : undefined,
      node.net !== undefined ? `Net ${fmtMiB(node.net)}` : undefined,
      node.hddWrite !== undefined ? `HDD write ${fmtMiB(node.hddWrite)}` : undefined,
      node.tempDbRamPeak !== undefined ? `Temp RAM ${fmtMiB(node.tempDbRamPeak)}` : undefined,
    ].filter((v): v is string => v !== undefined);
    if (facts.length) lines.push(`  ${facts.join("  ")}`);
    const scanned = scannedSelectivity(node);
    if (scanned) lines.push(`  Scanned: ${scanned}`);
    if (node.perNodeStats) lines.push(`  Per-node rows: min ${node.perNodeStats.min} / max ${node.perNodeStats.max} / avg ${node.perNodeStats.avg.toFixed(0)} / nodes ${node.perNodeStats.nodeCount}`);
    if (node.remarks) lines.push(`  Remarks: ${node.remarks}`);
    for (const w of node.warnings) lines.push(`  ⚠ ${WARNING_LABEL[w.type]}: ${w.message}`);
  }
  if (plan.queryText) {
    lines.push("");
    lines.push("Query:");
    lines.push(plan.queryText);
  }
  return lines.join("\n");
}
