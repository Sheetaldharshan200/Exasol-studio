// P5 of the agentic architecture (docs/agentic-architecture-spec.md):
// the execution DAG. Pure decision logic ONLY — ready-set computation,
// bounded concurrency, retry/backoff, failure propagation (skip dependents),
// compensation triggering, crash-resume normalization — so every rule is
// unit-tested. The I/O executor (dag-executor.ts) just applies these actions.

import type { Plan, PlanStep } from "./plan.ts";

export type RetryPolicy = {
  /** Total tries per step, first run included. */
  maxAttempts: number;
  /** Base delay; attempt n waits backoffMs * 2^(n-1). */
  backoffMs: number;
};

export const DEFAULT_RETRY: RetryPolicy = { maxAttempts: 2, backoffMs: 1000 };
export const DEFAULT_CONCURRENCY = 3;

export type DagAction =
  | { kind: "run"; stepId: string }
  | { kind: "retry"; stepId: string; delayMs: number }
  | { kind: "skip"; stepId: string; reason: string }
  | { kind: "compensate"; stepId: string; forStep: string }
  | { kind: "blocked"; reason: string }
  | { kind: "wait" }
  | { kind: "finished"; ok: boolean };

/** Step ids that exist only as another step's onFailure hook. */
export function compensationIds(plan: Plan): Set<string> {
  return new Set(plan.steps.map((s) => s.onFailure).filter((x): x is string => Boolean(x)));
}

function settled(s: PlanStep): boolean {
  return s.status === "done" || s.status === "failed" || s.status === "skipped";
}

function retriesLeft(s: PlanStep, retry: RetryPolicy): boolean {
  return (s.attempts ?? 0) < retry.maxAttempts;
}

/** A failed step is FINAL once its retries are exhausted. */
function failedHard(s: PlanStep, retry: RetryPolicy): boolean {
  return s.status === "failed" && !retriesLeft(s, retry);
}

/**
 * What the executor should do next, given only the durable plan state.
 * Deterministic and side-effect free: call it again after every transition.
 *
 * Order of concerns: finished check, approval gate, skip propagation,
 * compensation triggering, then run/retry up to the concurrency budget.
 */
export function nextActions(
  plan: Plan,
  opts: { concurrency?: number; retry?: RetryPolicy } = {},
): DagAction[] {
  const retry = opts.retry ?? DEFAULT_RETRY;
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const comps = compensationIds(plan);
  const byId = new Map(plan.steps.map((s) => [s.id, s]));
  const normal = plan.steps.filter((s) => !comps.has(s.id));

  // Compensation steps are scheduled ONLY for hard failures of their owner,
  // and (like everything else) retry until their own attempts run out.
  const triggeredComps: DagAction[] = [];
  for (const s of normal) {
    if (!s.onFailure || !failedHard(s, retry)) continue;
    const comp = byId.get(s.onFailure);
    if (!comp) continue;
    if (comp.status === "pending") triggeredComps.push({ kind: "compensate", stepId: comp.id, forStep: s.id });
    else if (comp.status === "failed" && retriesLeft(comp, retry)) {
      triggeredComps.push({ kind: "retry", stepId: comp.id, delayMs: retry.backoffMs * 2 ** Math.max(0, (comp.attempts ?? 0) - 1) });
    }
  }

  // Finished: every normal step settled beyond retry, every triggered
  // compensation settled beyond retry, nothing running anywhere.
  const anyRunning = plan.steps.some((s) => s.status === "running");
  const normalSettled = normal.every((s) => (s.status === "failed" ? !retriesLeft(s, retry) : settled(s)));
  if (normalSettled && triggeredComps.length === 0 && !anyRunning) {
    // Skips only ever cascade from a failure, so "no step failed" is the
    // complete success criterion.
    return [{ kind: "finished", ok: normal.every((s) => s.status !== "failed") }];
  }

  if (plan.requiresApproval && !plan.approved) {
    return [{ kind: "blocked", reason: "The plan contains write steps and has not been approved." }];
  }

  const actions: DagAction[] = [];

  // Failure propagation: a pending step whose dependency failed hard or was
  // skipped can never run — skip it (which cascades on the next call).
  // Skips are bookkeeping, not work: they don't consume the budget.
  for (const s of normal) {
    if (s.status !== "pending") continue;
    const dead = s.dependsOn.find((d) => {
      const dep = byId.get(d);
      return dep ? failedHard(dep, retry) || dep.status === "skipped" : false;
    });
    if (dead) actions.push({ kind: "skip", stepId: s.id, reason: `depends on "${dead}", which did not complete` });
  }

  const running = plan.steps.filter((s) => s.status === "running").length;
  let budget = Math.max(0, concurrency - running);

  // Budget order: compensations (cleanup beats new work), retries, fresh runs.
  for (const c of triggeredComps) {
    if (budget === 0) break;
    actions.push(c);
    budget--;
  }
  for (const s of normal) {
    if (budget === 0) break;
    if (s.status === "failed" && retriesLeft(s, retry)) {
      const n = s.attempts ?? 0;
      actions.push({ kind: "retry", stepId: s.id, delayMs: retry.backoffMs * 2 ** Math.max(0, n - 1) });
      budget--;
    }
  }
  for (const s of normal) {
    if (budget === 0) break;
    if (s.status !== "pending") continue;
    if (actions.some((a) => a.kind === "skip" && a.stepId === s.id)) continue;
    if (s.dependsOn.every((d) => byId.get(d)?.status === "done")) {
      actions.push({ kind: "run", stepId: s.id });
      budget--;
    }
  }

  if (actions.length === 0) return [{ kind: "wait" }];
  return actions;
}

/**
 * Crash recovery: a stored plan with `running` steps was interrupted —
 * nothing is actually running anymore. Mark them failed (their attempt was
 * consumed) so nextActions() can retry or propagate; everything else is
 * already durable. Returns the plan untouched when nothing was running.
 */
export function normalizeAfterCrash(plan: Plan): Plan {
  if (!plan.steps.some((s) => s.status === "running")) return plan;
  return {
    ...plan,
    updatedAt: Date.now(),
    steps: plan.steps.map((s) =>
      s.status === "running" ? { ...s, status: "failed" as const, note: "interrupted — the run did not survive a restart" } : s,
    ),
  };
}
