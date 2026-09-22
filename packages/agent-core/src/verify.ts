// P1 of the agentic architecture (docs/agentic-architecture-spec.md):
// automated answer verification. Pure decision logic ONLY — what to verify
// and how to compare — so every rule is unit-tested. The side-effecting
// re-execution lives in loop.ts (independent DB session via db.verifyQuery).

import { classifySql } from "./tools.ts";

/** One read query the turn actually ran, with enough of its result to compare. */
export type SqlRun = {
  sql: string;
  columns: string[];
  /** Model-capped sample rows (full result when rowCount <= cap). */
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
};

export type VerificationPlan = {
  sql: string;
  expected: SqlRun;
  /** "full" compares values; "count" compares only row counts (capped results). */
  mode: "full" | "count";
};

export type VerificationOutcome = {
  status: "verified" | "mismatch" | "unverified";
  /** Human-readable reason (mismatch detail, or why verification was skipped). */
  detail: string;
  expectedRows?: number;
  actualRows?: number;
  elapsedMs?: number;
  sql?: string;
};

/** SQL whose re-execution can legitimately differ — never verify these.
 *  Conservative on purpose: a false positive only downgrades to "unverified",
 *  a false negative would stamp a lie. */
const NON_DETERMINISTIC =
  /\b(RANDOM|RAND|CURRENT_TIMESTAMP|CURRENT_DATE|LOCALTIMESTAMP|SYSTIMESTAMP|SYSDATE|NOW|GETDATE|CURRENT_SESSION|CURRENT_STATEMENT|CURRENT_USER|SESSION_USER|CURRENT_SCHEMA|POSIX_TIME|UUID|SYS_GUID|ROWNUM|ROWID|NEXTVAL|SCOPE_USER)\b\s*(\(|,|\)|$|\s|\.)/i;

/**
 * Pick what to verify from a turn's read runs: the LAST result-bearing read —
 * that is what the answer was built from. Returns null (nothing verifiable)
 * for write-only turns, non-deterministic SQL, or empty run lists.
 */
export function planVerification(runs: SqlRun[]): VerificationPlan | null {
  for (let i = runs.length - 1; i >= 0; i--) {
    const run = runs[i];
    if (classifySql(run.sql) !== "read") continue;
    if (NON_DETERMINISTIC.test(run.sql)) return null;
    // A truncated result can't be value-compared (we only kept a sample and
    // without ORDER BY the sample isn't stable) — fall back to count-compare.
    const mode: VerificationPlan["mode"] = run.truncated ? "count" : "full";
    return { sql: run.sql, expected: run, mode };
  }
  return null;
}

/**
 * Cell normalization for comparison. Both runs use the same driver and the
 * same statement, so TYPES are stable across runs — no cross-type coercion
 * (a VARCHAR "1" must never verify equal to numeric 1: that would mask
 * result drift).
 * - JS numbers: 10-significant-digit precision (float aggregates differ in
 *   the last bits legitimately). NaN/Infinity normalize to distinct tokens.
 * - Numeric-looking STRINGS (DECIMAL from the driver): canonicalized
 *   TEXTUALLY (sign, leading zeros, trailing fraction zeros) — lossless for
 *   values beyond 2^53, no float round-trip.
 * - Everything else compares as-is. Ambiguity is prevented by JSON row
 *   serialization, not by sentinel tokens.
 */
function normalizeCell(value: unknown): string | boolean | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return `num:${String(value)}`;
    return `num:${value.toPrecision(10).replace(/\.?0+(e|$)/i, "$1")}`;
  }
  if (typeof value === "string" && /^[+-]?\d+(\.\d+)?$/.test(value)) {
    const negative = value.startsWith("-");
    const digits = value.replace(/^[+-]/, "");
    const [intRaw, fracRaw = ""] = digits.split(".");
    const int = intRaw.replace(/^0+(?=\d)/, "");
    const frac = fracRaw.replace(/0+$/, "");
    const canonical = frac ? `${int}.${frac}` : int;
    return `dec:${negative && canonical !== "0" ? "-" : ""}${canonical}`;
  }
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value;
  return String(value);
}

/** Order-insensitive row multiset (ORDER BY must not matter). JSON per row —
 *  no delimiter or sentinel collisions possible. */
function multiset(rows: unknown[][]): string[] {
  return rows.map((r) => JSON.stringify(r.map(normalizeCell))).sort();
}

/**
 * Compare the original result against the independent re-execution.
 * Column NAMES must match (same statement — a difference means the schema
 * changed underneath us, which IS a mismatch worth reporting).
 */
export function compareResults(
  plan: VerificationPlan,
  actual: SqlRun,
): { status: "verified" | "mismatch"; detail: string } {
  const expected = plan.expected;
  if (expected.rowCount !== actual.rowCount) {
    return {
      status: "mismatch",
      detail: `Row counts differ: the answer saw ${expected.rowCount}, the independent re-run returned ${actual.rowCount}.`,
    };
  }
  if (plan.mode === "count") {
    return { status: "verified", detail: `Row count (${actual.rowCount}) reproduced on an independent session (values not compared — result was larger than the sample cap).` };
  }
  if (expected.columns.join("") !== actual.columns.join("")) {
    return {
      status: "mismatch",
      detail: `Columns differ between runs: [${expected.columns.join(", ")}] vs [${actual.columns.join(", ")}].`,
    };
  }
  const a = multiset(expected.rows);
  const b = multiset(actual.rows);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return {
        status: "mismatch",
        detail: `Values differ between the answer's result and the independent re-run (first differing row after sorting: ${a[i]} vs ${b[i]}).`,
      };
    }
  }
  return { status: "verified", detail: `Result reproduced on an independent database session (${actual.rowCount} row${actual.rowCount === 1 ? "" : "s"}, values compared).` };
}
