/**
 * Pure query-profile logic for the Query Performance view: the plan-part
 * share-of-wall maths and the measured-bottleneck analysis. Extracted from
 * QueryProfileView.tsx so it can be unit-tested without mounting the view
 * (KISS: the decision logic is pure-function-shaped).
 */

/** One engine execution step (a row of EXA_STATISTICS.EXA_USER_PROFILE_LAST_DAY). */
export type ProfilePart = {
  partId: number;
  name: string;
  info: string | null;
  schema: string | null;
  object: string | null;
  objectRows: number | null;
  /** Rows entering this part — the exact basis for selectivity/fan-out. */
  inRows: number | null;
  outRows: number | null;
  duration: number | null;
  cpu: number | null;
  tempRam: number | null;
  hddRead: number | null;
  hddWrite: number | null;
  net: number | null;
  /** The engine's own note for the part (e.g. which index it used/built). */
  remarks: string | null;
};

export type ProfileData = {
  sql: string;
  script: string;
  commandName: string;
  parts: ProfilePart[];
  /** The statement's EXACT totals from EXA_USER_SQL_LAST_DAY (wall time —
   *  part durations overlap under parallel execution and must not be summed). */
  wall: {
    duration: number | null;
    commandName: string;
    rowCount: number | null;
    cpu: number | null;
    tempRam: number | null;
    hddRead: number | null;
    net: number | null;
  } | null;
};

export type Insight = { severity: "warn" | "info"; fact: string; advice?: string };

/** Format a measured number for display (— for null/undefined). */
export const fmt = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: digits });

/** Sum of per-part durations (parts run in parallel, so this can exceed wall). */
export function partsDurationSum(parts: ProfilePart[]): number {
  return parts.reduce((s, p) => s + (p.duration ?? 0), 0);
}

/**
 * The denominator for "% of time" bars: the exact wall time when known,
 * otherwise the sum of part durations. Never negative.
 */
export function planDenominator(parts: ProfilePart[], wall: ProfileData["wall"]): number {
  const denom = wall?.duration ?? partsDurationSum(parts);
  return denom > 0 ? denom : 0;
}

/** Each part with its share (%) of the denominator. 0% when the denominator is 0. */
export function computePlanRows(
  parts: ProfilePart[],
  wall: ProfileData["wall"],
): { part: ProfilePart; sharePct: number }[] {
  const denom = planDenominator(parts, wall);
  return parts.map((part) => ({
    part,
    sharePct: denom > 0 ? ((part.duration ?? 0) / denom) * 100 : 0,
  }));
}

/** Measured facts first (exact numbers from the engine), each with an optional
 *  recommendation — clearly separated so nothing reads as more than it is. */
export function analyze(parts: ProfilePart[], wall: ProfileData["wall"]): Insight[] {
  const out: Insight[] = [];
  const denom = wall?.duration ?? partsDurationSum(parts);
  if (!denom) return out;

  // FACT: slowest part, exact measured duration.
  const top = [...parts].sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))[0];
  if ((top?.duration ?? 0) > 0) {
    const where = top.object ? ` on ${top.schema}.${top.object}` : "";
    out.push({
      severity: (top.duration ?? 0) / denom >= 0.35 ? "warn" : "info",
      fact: `Slowest step: ${top.name}${where} — ${fmt(top.duration, 3)}s measured (${(((top.duration ?? 0) / denom) * 100).toFixed(0)}% of the ${fmt(denom, 2)}s wall time).`,
      advice: adviceFor(top, parts),
    });
  }

  // FACT: scan selectivity — exact, from IN_ROWS/OUT_ROWS when present.
  for (const p of parts) {
    if (!p.name.includes("SCAN")) continue;
    const inn = p.inRows ?? p.objectRows;
    const outR = p.outRows;
    if (inn !== null && outR !== null && inn > 100_000 && outR / inn < 0.02) {
      out.push({
        severity: "info",
        fact: `Scan of ${p.schema}.${p.object}: ${fmt(inn, 0)} rows in → ${fmt(outR, 0)} out (${((outR / inn) * 100).toFixed(2)}% kept), ${fmt(p.duration, 3)}s.`,
        advice: "Highly selective filter over a large table — PARTITION BY the filter column (partition pruning) or maintain a filtered derived table if this slice is routine.",
      });
    }
  }

  // FACT: join fan-out — exact from IN_ROWS → OUT_ROWS on the join part.
  for (const p of parts) {
    if (!p.name.includes("JOIN")) continue;
    const inn = p.inRows;
    const outR = p.outRows;
    if (inn !== null && outR !== null && inn > 0 && outR > inn * 2 && outR > 100_000) {
      out.push({
        severity: "warn",
        fact: `${p.name}${p.object ? ` with ${p.schema}.${p.object}` : ""}: ${fmt(inn, 0)} rows in → ${fmt(outR, 0)} out (×${(outR / inn).toFixed(1)} fan-out), ${fmt(p.duration, 3)}s.`,
        advice: "Row multiplication in a join double-counts downstream aggregates — verify key uniqueness on the lookup side, or aggregate to the join grain first.",
      });
      break;
    }
  }

  // FACT: inter-node traffic (exact MiB from the NET column).
  const net = parts.reduce((s, p) => s + (p.net ?? 0), 0);
  if (net > 50) {
    out.push({
      severity: "warn",
      fact: `${fmt(net, 0)} MiB moved between cluster nodes during execution (NET column).`,
      advice: "Joins/groups are redistributing data (global join). DISTRIBUTE BY the join column on both tables so matching rows are co-located — usually the biggest single Exasol win.",
    });
  }

  // FACT: disk I/O (exact MiB) — the working set didn't fit in RAM.
  const hdd = parts.reduce((s, p) => s + (p.hddRead ?? 0) + (p.hddWrite ?? 0), 0);
  if (hdd > 0) {
    out.push({
      severity: "warn",
      fact: `${fmt(hdd, 0)} MiB of disk I/O (HDD_READ/HDD_WRITE) — data was not fully resident in RAM.`,
      advice: "Touch fewer columns (Exasol is columnar), filter earlier, or increase DB RAM.",
    });
  }

  // FACT: the engine's own remarks (index built/used) — verbatim.
  for (const p of parts) {
    if (p.remarks && /index/i.test(p.remarks)) {
      out.push({
        severity: "info",
        fact: `Engine remark on ${p.name}: "${p.remarks}".`,
        advice: /creat/i.test(p.remarks) ? "Index creation is a one-time cost — the next run of this query skips it." : undefined,
      });
    }
  }

  if (!out.length) out.push({ severity: "info", fact: "No dominant step or resource pressure measured — time is spread across steps with healthy row reduction." });
  return out;
}

export function adviceFor(p: ProfilePart, parts: ProfilePart[]): string | undefined {
  if (p.name.includes("SCAN")) {
    const inn = p.inRows ?? p.objectRows ?? 0;
    const kept = p.outRows ?? 0;
    return inn > 0 && kept / inn < 0.05
      ? "The scan reads far more than it keeps — PARTITION BY the filter column, or keep a filtered derived table for this routine slice."
      : "Most of the table is genuinely needed — select fewer columns (columnar I/O), or pre-aggregate if this query repeats.";
  }
  if (p.name.includes("JOIN")) {
    const net = parts.reduce((s, x) => s + (x.net ?? 0), 0);
    return net > 10
      ? "This join ships data between nodes — DISTRIBUTE BY the join column on both tables to make it a local join."
      : "Check join keys are typed identically (implicit casts disable the join index) and unique on the lookup side.";
  }
  if (p.name.includes("GROUP")) return "High-cardinality grouping — pre-filter rows before aggregating, group on fewer columns, or materialize a pre-aggregate for repeated use.";
  if (p.name.includes("SORT") || p.name.includes("ORDER")) return "Full-result sorting — keep a LIMIT so the engine can top-N instead, or drop ORDER BY where order doesn't matter.";
  if (p.name.includes("INSERT") || p.name.includes("CREATE")) return "Write step — larger batches with a single commit are fastest.";
  return undefined;
}
