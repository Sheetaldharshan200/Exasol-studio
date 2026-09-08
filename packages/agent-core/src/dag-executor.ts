// P5: the thin I/O layer over dag.ts — applies its actions against a real
// database with durable write-through after every transition. All decisions
// (ready set, retries, skips, compensation, finished) come from nextActions;
// this file only runs SQL and persists state, so the logic stays tested.

import { DEFAULT_RETRY, nextActions, normalizeAfterCrash, type RetryPolicy } from "./dag.ts";
import { applyStepUpdate, planProgress, type Plan } from "./plan.ts";
import { classifySql } from "./tools.ts";
import type { DbRegistry } from "./db.ts";
import { log } from "./log.ts";

/** The two calls the executor needs — narrow so tests can stub it. */
export type StepDb = Pick<DbRegistry, "query" | "execute">;

export type ExecutePlanResult =
  | { ok: boolean; plan: Plan; done: number; failed: number; notes: string[] }
  | { error: string };

/** Plans currently executing IN THIS PROCESS — a second execute_plan call on
 *  the same plan would treat its live running steps as crashed and re-run
 *  them, so re-entry is refused instead. */
const activeRuns = new Set<string>();

/** Multi-statement steps are refused — one statement per step, like the gateway. */
function multiStatement(sql: string): boolean {
  return sql.replace(/'(?:[^']|'')*'/g, "''").replace(/;\s*$/, "").includes(";");
}

/**
 * Execute every SQL-bearing step of an APPROVED plan as a DAG: independent
 * steps run concurrently (bounded), failures retry with backoff, hard
 * failures skip dependents and trigger onFailure compensation, and every
 * transition is persisted through `save` before anything else happens —
 * a crash mid-run resumes by calling this again with the stored plan.
 */
export async function executePlan(opts: {
  plan: Plan;
  db: StepDb;
  connectionId: string;
  /** Durable write-through (store + UI push). Called after EVERY transition. */
  save: (plan: Plan) => void;
  concurrency?: number;
  retry?: RetryPolicy;
  signal?: AbortSignal;
}): Promise<ExecutePlanResult> {
  const { db, connectionId } = opts;
  const retry = opts.retry ?? DEFAULT_RETRY;

  if (activeRuns.has(opts.plan.id)) {
    return { error: "This plan is already executing — its steps update live. Wait for it to finish before running it again." };
  }

  // The executor can only run steps that carry SQL. That includes pending
  // compensation steps — they may be launched later and have no fallback.
  const unfinished = opts.plan.steps.filter((s) => s.status === "pending" || s.status === "running" || s.status === "failed");
  const inert = unfinished.filter((s) => !s.sql);
  if (inert.length) {
    return { error: `Steps without SQL cannot be executed mechanically: ${inert.map((s) => s.id).join(", ")}. Finish them via update_plan_step first, or give them SQL.` };
  }
  const bad = opts.plan.steps.find((s) => s.sql && multiStatement(s.sql));
  if (bad) return { error: `Step "${bad.id}" contains multiple statements — one statement per step.` };

  activeRuns.add(opts.plan.id);
  try {
    return await runDag({ ...opts, retry });
  } finally {
    activeRuns.delete(opts.plan.id);
  }
}

async function runDag(opts: {
  plan: Plan;
  db: StepDb;
  connectionId: string;
  save: (plan: Plan) => void;
  concurrency?: number;
  retry: RetryPolicy;
  signal?: AbortSignal;
}): Promise<ExecutePlanResult> {
  const { db, connectionId, retry } = opts;

  // Durability is best-effort by contract: a failed disk write must not
  // corrupt the in-memory run or misreport a step that already executed.
  const persist = (p: Plan) => {
    try {
      opts.save(p);
    } catch (e) {
      log.warn("plan persist failed", { plan: p.id, error: e instanceof Error ? e.message : String(e) });
    }
  };

  let plan = normalizeAfterCrash(opts.plan);
  if (plan !== opts.plan) persist(plan);

  const apply = (stepId: string, status: Parameters<typeof applyStepUpdate>[2], note?: string): boolean => {
    const out = applyStepUpdate(plan, stepId, status, note);
    if ("error" in out) return false; // e.g. raced transition — nextActions re-decides
    plan = out.plan;
    persist(plan);
    return true;
  };

  const notes: string[] = [];
  const running = new Map<string, Promise<void>>();

  const launch = (stepId: string, delayMs = 0): boolean => {
    if (running.has(stepId)) return false;
    if (!apply(stepId, "running")) return false;
    const task = (async () => {
      let outcome: { status: "done" | "failed"; note: string };
      try {
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
        // Re-read the step from CURRENT state after any backoff — and bail
        // if something (a manual update) moved it while we slept.
        const step = plan.steps.find((s) => s.id === stepId);
        if (!step || step.status !== "running" || !step.sql) {
          outcome = { status: "failed", note: "step changed underneath the executor — not run" };
        } else if (classifySql(step.sql) === "read" || /^\s*EXECUTE\s+SCRIPT\b/i.test(step.sql)) {
          // EXECUTE SCRIPT returns a result TABLE — the driver's execute()
          // path throws on it AFTER the script's side effects committed,
          // which would fail the step and double-run it on retry. Scripts go
          // through the query path (still approval-gated: classifySql marks
          // EXECUTE as write, so the plan needed approval to get here).
          const out = await db.query(connectionId, step.sql);
          outcome = { status: "done", note: `${out.rowCount} row${out.rowCount === 1 ? "" : "s"}` };
        } else {
          const affected = await db.execute(connectionId, step.sql);
          outcome = { status: "done", note: `${affected} row${affected === 1 ? "" : "s"} affected` };
        }
      } catch (e) {
        outcome = { status: "failed", note: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
      }
      // The transition is applied OUTSIDE the SQL try: a persistence problem
      // must never re-classify SQL that already ran.
      apply(stepId, outcome.status, outcome.note);
      running.delete(stepId);
    })();
    running.set(stepId, task);
    return true;
  };

  for (;;) {
    if (opts.signal?.aborted) {
      notes.push("aborted — in-flight steps were left to finish, nothing new was launched");
      await Promise.allSettled(running.values());
      break;
    }
    const actions = nextActions(plan, { concurrency: opts.concurrency, retry });
    const first = actions[0];
    if (first.kind === "finished") break;
    if (first.kind === "blocked") return { error: first.reason };

    let progressed = false;
    for (const a of actions) {
      if (a.kind === "skip") {
        if (apply(a.stepId, "skipped", a.reason)) progressed = true;
      } else if (a.kind === "run") {
        if (launch(a.stepId)) progressed = true;
      } else if (a.kind === "retry") {
        if (launch(a.stepId, a.delayMs)) progressed = true;
      } else if (a.kind === "compensate") {
        if (launch(a.stepId)) {
          notes.push(`compensating "${a.forStep}" via "${a.stepId}"`);
          progressed = true;
        }
      }
    }
    if (!progressed) {
      if (!running.size) {
        // Defensive: nextActions wants work but no transition applied and
        // nothing is in flight (e.g. a legacy plan whose stored shape the
        // transition rules reject) — stop instead of spinning forever.
        notes.push("executor stalled with nothing in flight — stopping");
        break;
      }
      await Promise.race(running.values());
    }
  }

  await Promise.allSettled(running.values());
  const p = planProgress(plan);
  const final = nextActions(plan, { concurrency: opts.concurrency, retry })[0];
  return { ok: final.kind === "finished" && final.ok, plan, done: p.done, failed: p.failed, notes };
}
