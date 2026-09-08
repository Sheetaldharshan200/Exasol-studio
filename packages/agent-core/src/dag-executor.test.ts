import { test } from "node:test";
import assert from "node:assert/strict";
import { executePlan, type StepDb } from "./dag-executor.ts";
import { buildPlan, type Plan, type PlanStepInput } from "./plan.ts";

function approvedPlan(steps: PlanStepInput[]): Plan {
  const out = buildPlan("goal", steps);
  if ("error" in out) throw new Error(out.error);
  return { ...out.plan, approved: true };
}

/** A scriptable database: per-SQL behavior, records concurrency + order. */
function stubDb(behavior: Record<string, { failTimes?: number; delayMs?: number }> = {}) {
  const executed: string[] = [];
  const fails = new Map<string, number>();
  let inFlight = 0;
  let peak = 0;
  const run = async (sql: string): Promise<void> => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    const b = behavior[sql];
    await new Promise((r) => setTimeout(r, b?.delayMs ?? 2));
    inFlight--;
    const failLeft = (b?.failTimes ?? 0) - (fails.get(sql) ?? 0);
    if (failLeft > 0) {
      fails.set(sql, (fails.get(sql) ?? 0) + 1);
      throw new Error(`boom: ${sql}`);
    }
    executed.push(sql);
  };
  const db: StepDb = {
    query: async (_id, sql) => {
      await run(sql);
      return { columns: ["C"], rows: [[1]], rowCount: 1, truncated: false };
    },
    execute: async (_id, sql) => {
      await run(sql);
      return 1;
    },
  };
  return { db, executed, peakInFlight: () => peak };
}

const fastRetry = { maxAttempts: 2, backoffMs: 1 };

test("independent branches run concurrently; the join waits for both", async () => {
  const plan = approvedPlan([
    { id: "a", title: "a", sql: "SELECT 'a'" },
    { id: "b", title: "b", sql: "SELECT 'b'" },
    { id: "join", title: "j", sql: "SELECT 'join'", dependsOn: ["a", "b"] },
  ]);
  const { db, executed, peakInFlight } = stubDb({ "SELECT 'a'": { delayMs: 25 }, "SELECT 'b'": { delayMs: 25 } });
  const saves: Plan[] = [];
  const out = await executePlan({ plan, db, connectionId: "c", save: (p) => saves.push(p), retry: fastRetry });
  if ("error" in out) throw new Error(out.error);
  assert.equal(out.ok, true);
  assert.equal(out.done, 3);
  assert.equal(peakInFlight(), 2); // a + b overlapped
  assert.equal(executed.at(-1), "SELECT 'join'");
  // every transition was persisted (2 per step: running + done)
  assert.ok(saves.length >= 6);
  assert.ok(out.plan.steps.every((s) => s.status === "done"));
});

test("a transient failure retries once and the run still succeeds", async () => {
  const plan = approvedPlan([{ id: "a", title: "a", sql: "SELECT 1" }]);
  const { db } = stubDb({ "SELECT 1": { failTimes: 1 } });
  const out = await executePlan({ plan, db, connectionId: "c", save: () => undefined, retry: fastRetry });
  if ("error" in out) throw new Error(out.error);
  assert.equal(out.ok, true);
  assert.equal(out.plan.steps[0].attempts, 2);
});

test("a hard failure skips dependents and runs the onFailure compensation", async () => {
  const plan = approvedPlan([
    { id: "load", title: "load", sql: "IMPORT INTO S.T FROM LOCAL CSV FILE 'x'", onFailure: "cleanup" },
    { id: "after", title: "after", sql: "SELECT 2", dependsOn: ["load"] },
    { id: "cleanup", title: "cleanup", sql: "DROP TABLE S.T" },
  ]);
  const { db, executed } = stubDb({ "IMPORT INTO S.T FROM LOCAL CSV FILE 'x'": { failTimes: 99 } });
  const out = await executePlan({ plan, db, connectionId: "c", save: () => undefined, retry: fastRetry });
  if ("error" in out) throw new Error(out.error);
  assert.equal(out.ok, false);
  const byId = new Map(out.plan.steps.map((s) => [s.id, s]));
  assert.equal(byId.get("load")!.status, "failed");
  assert.equal(byId.get("after")!.status, "skipped");
  assert.equal(byId.get("cleanup")!.status, "done");
  assert.ok(executed.includes("DROP TABLE S.T"));
  assert.ok(out.notes.some((n) => /compensating "load"/.test(n)));
});

test("resume after a crash: interrupted running steps are retried, done work is not redone", async () => {
  const base = approvedPlan([
    { id: "a", title: "a", sql: "SELECT 'a'" },
    { id: "b", title: "b", sql: "SELECT 'b'", dependsOn: ["a"] },
  ]);
  // Simulate the stored state of a crash: a done, b was mid-flight (1 attempt).
  const crashed: Plan = {
    ...base,
    steps: base.steps.map((s) => (s.id === "a" ? { ...s, status: "done" as const } : { ...s, status: "running" as const, attempts: 1 })),
  };
  const { db, executed } = stubDb();
  const out = await executePlan({ plan: crashed, db, connectionId: "c", save: () => undefined, retry: fastRetry });
  if ("error" in out) throw new Error(out.error);
  assert.equal(out.ok, true);
  assert.deepEqual(executed, ["SELECT 'b'"]); // a was NOT re-run
  assert.equal(out.plan.steps.find((s) => s.id === "b")!.attempts, 2);
});

test("unapproved write plans and non-SQL steps are refused up front", async () => {
  const write = buildPlan("g", [{ id: "w", title: "w", sql: "DELETE FROM T" }]);
  if ("error" in write) throw new Error(write.error);
  const { db } = stubDb();
  const blocked = await executePlan({ plan: write.plan, db, connectionId: "c", save: () => undefined });
  assert.ok("error" in blocked && /not been approved/.test(blocked.error));

  const inert = approvedPlan([{ id: "t", title: "tool step, no sql", tool: "import_csv" }]);
  const refused = await executePlan({ plan: inert, db, connectionId: "c", save: () => undefined });
  assert.ok("error" in refused && /without SQL/.test(refused.error));

  // a PENDING compensation step without SQL is refused too — it could be
  // launched later and would have nothing to run
  const compNoSql = approvedPlan([
    { id: "a", title: "a", sql: "SELECT 1", onFailure: "c" },
    { id: "c", title: "cleanup without sql" },
  ]);
  const refused3 = await executePlan({ plan: compNoSql, db, connectionId: "c", save: () => undefined });
  assert.ok("error" in refused3 && /without SQL/.test(refused3.error));

  const multi = approvedPlan([{ id: "m", title: "m", sql: "SELECT 1; SELECT 2" }]);
  const refused2 = await executePlan({ plan: multi, db, connectionId: "c", save: () => undefined });
  assert.ok("error" in refused2 && /multiple statements/.test(refused2.error));
});

test("re-entry on a plan that is already executing is refused", async () => {
  const plan = approvedPlan([{ id: "a", title: "a", sql: "SELECT 'slow'" }]);
  const { db } = stubDb({ "SELECT 'slow'": { delayMs: 60 } });
  const first = executePlan({ plan, db, connectionId: "c", save: () => undefined, retry: fastRetry });
  await new Promise((r) => setTimeout(r, 10)); // let it start
  const second = await executePlan({ plan, db, connectionId: "c", save: () => undefined, retry: fastRetry });
  assert.ok("error" in second && /already executing/.test(second.error));
  const out = await first;
  if ("error" in out) throw new Error(out.error);
  assert.equal(out.ok, true);
  // once finished, the plan may run again (the lock is released)
  const again = await executePlan({ plan: out.plan, db, connectionId: "c", save: () => undefined, retry: fastRetry });
  assert.ok(!("error" in again));
});

test("a save() that throws never re-classifies SQL that already ran", async () => {
  const plan = approvedPlan([{ id: "a", title: "a", sql: "SELECT 1" }]);
  const { db, executed } = stubDb();
  const out = await executePlan({
    plan, db, connectionId: "c", retry: fastRetry,
    save: () => {
      throw new Error("disk full");
    },
  });
  if ("error" in out) throw new Error(out.error);
  assert.equal(out.ok, true);
  assert.deepEqual(executed, ["SELECT 1"]);
  assert.equal(out.plan.steps[0].status, "done");
});

test("semicolons inside string literals are not multi-statement", async () => {
  const plan = approvedPlan([{ id: "a", title: "a", sql: "SELECT 'a;b' FROM DUAL" }]);
  const { db } = stubDb();
  const out = await executePlan({ plan, db, connectionId: "c", save: () => undefined, retry: fastRetry });
  if ("error" in out) throw new Error(out.error);
  assert.equal(out.ok, true);
});
