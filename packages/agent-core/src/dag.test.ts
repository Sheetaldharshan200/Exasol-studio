import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RETRY, compensationIds, nextActions, normalizeAfterCrash } from "./dag.ts";
import { buildPlan, applyStepUpdate, type Plan, type PlanStepInput, type StepStatus } from "./plan.ts";

function mkPlan(steps: PlanStepInput[], statuses: Record<string, StepStatus | [StepStatus, number]> = {}): Plan {
  const out = buildPlan("test goal", steps);
  if ("error" in out) throw new Error(out.error);
  let plan = out.plan;
  plan = {
    ...plan,
    approved: true,
    steps: plan.steps.map((s) => {
      const v = statuses[s.id];
      if (!v) return s;
      const [status, attempts] = Array.isArray(v) ? v : [v, v === "pending" ? 0 : 1];
      return { ...s, status, attempts };
    }),
  };
  return plan;
}

const ids = (as: ReturnType<typeof nextActions>, kind: string) =>
  as.filter((a) => a.kind === kind).map((a) => ("stepId" in a ? a.stepId : "")).sort();

// ── ready set + concurrency ───────────────────────────────────────────────────

test("independent roots run in parallel up to the concurrency cap", () => {
  const plan = mkPlan([
    { id: "a", title: "a" },
    { id: "b", title: "b" },
    { id: "c", title: "c" },
    { id: "d", title: "d" },
  ]);
  assert.deepEqual(ids(nextActions(plan, { concurrency: 3 }), "run"), ["a", "b", "c"]);
  assert.deepEqual(ids(nextActions(plan, { concurrency: 1 }), "run"), ["a"]);
});

test("running steps consume budget", () => {
  const plan = mkPlan(
    [
      { id: "a", title: "a" },
      { id: "b", title: "b" },
      { id: "c", title: "c" },
    ],
    { a: "running" },
  );
  assert.deepEqual(ids(nextActions(plan, { concurrency: 2 }), "run"), ["b"]);
});

test("diamond dependencies: joins wait for ALL branches", () => {
  const steps: PlanStepInput[] = [
    { id: "root", title: "r" },
    { id: "left", title: "l", dependsOn: ["root"] },
    { id: "right", title: "r2", dependsOn: ["root"] },
    { id: "join", title: "j", dependsOn: ["left", "right"] },
  ];
  const afterRoot = mkPlan(steps, { root: "done" });
  assert.deepEqual(ids(nextActions(afterRoot), "run"), ["left", "right"]);
  const oneBranch = mkPlan(steps, { root: "done", left: "done", right: "running" });
  assert.deepEqual(ids(nextActions(oneBranch), "run"), []);
  const both = mkPlan(steps, { root: "done", left: "done", right: "done" });
  assert.deepEqual(ids(nextActions(both), "run"), ["join"]);
});

test("nothing ready while a dependency runs → wait", () => {
  const plan = mkPlan([{ id: "a", title: "a" }, { id: "b", title: "b", dependsOn: ["a"] }], { a: "running" });
  assert.deepEqual(nextActions(plan), [{ kind: "wait" }]);
});

// ── retry / backoff ───────────────────────────────────────────────────────────

test("a failed step retries with exponential backoff until attempts run out", () => {
  const one = mkPlan([{ id: "a", title: "a" }], { a: ["failed", 1] });
  const acts = nextActions(one, { retry: { maxAttempts: 3, backoffMs: 100 } });
  assert.deepEqual(acts, [{ kind: "retry", stepId: "a", delayMs: 100 }]);
  const two = mkPlan([{ id: "a", title: "a" }], { a: ["failed", 2] });
  assert.deepEqual(nextActions(two, { retry: { maxAttempts: 3, backoffMs: 100 } }), [{ kind: "retry", stepId: "a", delayMs: 200 }]);
  const spent = mkPlan([{ id: "a", title: "a" }], { a: ["failed", 3] });
  assert.deepEqual(nextActions(spent, { retry: { maxAttempts: 3, backoffMs: 100 } }), [{ kind: "finished", ok: false }]);
});

test("retry exhaustion propagates: dependents are skipped, then finished not-ok", () => {
  const steps: PlanStepInput[] = [
    { id: "a", title: "a" },
    { id: "b", title: "b", dependsOn: ["a"] },
    { id: "c", title: "c", dependsOn: ["b"] },
  ];
  const plan = mkPlan(steps, { a: ["failed", DEFAULT_RETRY.maxAttempts] });
  const acts = nextActions(plan);
  assert.deepEqual(ids(acts, "skip"), ["b"]);
  // apply the skip → the skip cascades to c on the next call
  const p2 = { ...plan, steps: plan.steps.map((s) => (s.id === "b" ? { ...s, status: "skipped" as const } : s)) };
  assert.deepEqual(ids(nextActions(p2), "skip"), ["c"]);
  const p3 = { ...p2, steps: p2.steps.map((s) => (s.id === "c" ? { ...s, status: "skipped" as const } : s)) };
  assert.deepEqual(nextActions(p3), [{ kind: "finished", ok: false }]);
});

// ── compensation ──────────────────────────────────────────────────────────────

test("compensation steps are excluded from normal scheduling and trigger on hard failure", () => {
  const steps: PlanStepInput[] = [
    { id: "load", title: "load", onFailure: "cleanup" },
    { id: "cleanup", title: "drop staging" },
  ];
  const fresh = mkPlan(steps);
  assert.deepEqual(compensationIds(fresh), new Set(["cleanup"]));
  assert.deepEqual(ids(nextActions(fresh), "run"), ["load"]); // cleanup NOT scheduled
  const softFail = mkPlan(steps, { load: ["failed", 1] });
  assert.deepEqual(ids(nextActions(softFail, { retry: { maxAttempts: 2, backoffMs: 10 } }), "compensate"), []);
  const hardFail = mkPlan(steps, { load: ["failed", 2] });
  const acts = nextActions(hardFail, { retry: { maxAttempts: 2, backoffMs: 10 } });
  assert.deepEqual(acts.filter((a) => a.kind === "compensate"), [{ kind: "compensate", stepId: "cleanup", forStep: "load" }]);
  // plan is not finished until the compensation settles
  assert.ok(!acts.some((a) => a.kind === "finished"));
  const compensated = mkPlan(steps, { load: ["failed", 2], cleanup: "done" });
  assert.deepEqual(nextActions(compensated, { retry: { maxAttempts: 2, backoffMs: 10 } }), [{ kind: "finished", ok: false }]);
});

test("buildPlan validates compensation hooks", () => {
  assert.ok("error" in buildPlan("g", [{ id: "a", title: "a", onFailure: "a" }]));
  assert.ok("error" in buildPlan("g", [{ id: "a", title: "a", onFailure: "nope" }]));
  assert.ok("error" in buildPlan("g", [
    { id: "a", title: "a", onFailure: "c" },
    { id: "b", title: "b", dependsOn: ["c"] },
    { id: "c", title: "c" },
  ]));
  assert.ok("error" in buildPlan("g", [
    { id: "a", title: "a", onFailure: "c" },
    { id: "c", title: "c", onFailure: "a" },
  ]));
  // a compensation step with dependencies could never start (its owner failed)
  assert.ok("error" in buildPlan("g", [
    { id: "a", title: "a", onFailure: "c" },
    { id: "b", title: "b" },
    { id: "c", title: "c", dependsOn: ["b"] },
  ]));
});

test("compensations respect the concurrency budget and retry with backoff", () => {
  const steps: PlanStepInput[] = [
    { id: "a", title: "a", onFailure: "ca" },
    { id: "b", title: "b", onFailure: "cb" },
    { id: "c", title: "c", onFailure: "cc" },
    { id: "ca", title: "ca" },
    { id: "cb", title: "cb" },
    { id: "cc", title: "cc" },
  ];
  const r = { maxAttempts: 1, backoffMs: 50 };
  const allFailed = mkPlan(steps, { a: ["failed", 1], b: ["failed", 1], c: ["failed", 1] });
  const acts = nextActions(allFailed, { concurrency: 2, retry: r });
  assert.equal(acts.filter((x) => x.kind === "compensate").length, 2); // capped, not 3
  // a failed compensation retries until ITS attempts run out (owner must be
  // failed HARD, or the owner's own retry takes precedence)
  const compFailed = mkPlan(steps, { a: ["failed", 2], b: "done", c: "done", ca: ["failed", 1] });
  const acts2 = nextActions(compFailed, { concurrency: 2, retry: { maxAttempts: 2, backoffMs: 50 } });
  assert.deepEqual(acts2.filter((x) => x.kind === "retry"), [{ kind: "retry", stepId: "ca", delayMs: 50 }]);
  // and once exhausted, the plan can finish (not ok)
  const compSpent = mkPlan(steps, { a: ["failed", 1], b: "done", c: "done", ca: ["failed", 1] });
  assert.deepEqual(nextActions(compSpent, { retry: r }), [{ kind: "finished", ok: false }]);
});

// ── approval gate ─────────────────────────────────────────────────────────────

test("an unapproved write plan is blocked, never launched", () => {
  const out = buildPlan("g", [{ id: "w", title: "write", sql: "DELETE FROM T" }]);
  if ("error" in out) throw new Error(out.error);
  assert.equal(out.plan.requiresApproval, true);
  assert.deepEqual(nextActions(out.plan), [{ kind: "blocked", reason: "The plan contains write steps and has not been approved." }]);
});

// ── resume from partial (crash) ───────────────────────────────────────────────

test("normalizeAfterCrash fails interrupted steps; resume recomputes the ready set", () => {
  const steps: PlanStepInput[] = [
    { id: "a", title: "a" },
    { id: "b", title: "b" },
    { id: "c", title: "c", dependsOn: ["a", "b"] },
  ];
  const crashed = mkPlan(steps, { a: "done", b: ["running", 1] });
  const resumed = normalizeAfterCrash(crashed);
  const b = resumed.steps.find((s) => s.id === "b")!;
  assert.equal(b.status, "failed");
  assert.match(b.note ?? "", /interrupted/);
  // b consumed one attempt; with the default policy it retries once more
  assert.deepEqual(nextActions(resumed), [{ kind: "retry", stepId: "b", delayMs: DEFAULT_RETRY.backoffMs }]);
  // untouched plans come back identical
  const clean = mkPlan(steps, { a: "done" });
  assert.equal(normalizeAfterCrash(clean), clean);
});

test("attempts are consumed on every running transition via applyStepUpdate", () => {
  const out = buildPlan("g", [{ id: "a", title: "a" }]);
  if ("error" in out) throw new Error(out.error);
  const started = applyStepUpdate(out.plan, "a", "running");
  if ("error" in started) throw new Error(started.error);
  assert.equal(started.plan.steps[0].attempts, 1);
  const failed = applyStepUpdate(started.plan, "a", "failed");
  if ("error" in failed) throw new Error(failed.error);
  const retried = applyStepUpdate(failed.plan, "a", "running");
  if ("error" in retried) throw new Error(retried.error);
  assert.equal(retried.plan.steps[0].attempts, 2);
});

// ── finished states ───────────────────────────────────────────────────────────

test("all-done finishes ok; a plan with an untriggered compensation finishes too", () => {
  const ok = mkPlan([{ id: "a", title: "a" }, { id: "b", title: "b", dependsOn: ["a"] }], { a: "done", b: "done" });
  assert.deepEqual(nextActions(ok), [{ kind: "finished", ok: true }]);
  const withComp = mkPlan(
    [
      { id: "load", title: "load", onFailure: "cleanup" },
      { id: "cleanup", title: "cleanup" },
    ],
    { load: "done" },
  );
  assert.deepEqual(nextActions(withComp), [{ kind: "finished", ok: true }]);
});
