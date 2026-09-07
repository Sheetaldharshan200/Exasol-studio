import assert from "node:assert/strict";
import { test } from "node:test";
import { applyStepUpdate, buildPlan, planProgress, type Plan } from "./plan.ts";

function mustBuild(goal: string, steps: Parameters<typeof buildPlan>[1]): Plan {
  const out = buildPlan(goal, steps);
  assert.ok("plan" in out, "error" in out ? (out as { error: string }).error : "");
  return (out as { plan: Plan }).plan;
}

test("builds a valid plan with defaults and computed approval", () => {
  const plan = mustBuild("Load and chart the sales data", [
    { title: "Import sales.csv", tool: "import_csv" },
    { title: "Count the rows", sql: "SELECT COUNT(*) FROM S.SALES", dependsOn: ["s1"] },
  ]);
  assert.equal(plan.steps.length, 2);
  assert.equal(plan.steps[0].id, "s1"); // auto ids
  assert.deepEqual(plan.steps[1].dependsOn, ["s1"]);
  assert.equal(plan.requiresApproval, true); // import_csv is write-shaped
  assert.equal(plan.approved, false);
});

test("read-only plans need no approval gate", () => {
  const plan = mustBuild("Answer a question", [{ title: "Query", sql: "SELECT 1" }]);
  assert.equal(plan.requiresApproval, false);
  assert.equal(plan.approved, true);
});

test("write SQL in a step forces approval", () => {
  const plan = mustBuild("Change data", [{ title: "Fix rows", sql: "UPDATE S.T SET X = 1" }]);
  assert.equal(plan.requiresApproval, true);
});

test("rejects structural garbage honestly", () => {
  assert.match((buildPlan("", [{ title: "x" }]) as { error: string }).error, /goal/);
  assert.match((buildPlan("g", []) as { error: string }).error, /at least one/);
  assert.match(
    (buildPlan("g", Array.from({ length: 13 }, (_, i) => ({ title: `t${i}` }))) as { error: string }).error,
    /capped/,
  );
  assert.match(
    (buildPlan("g", [{ id: "a", title: "1" }, { id: "a", title: "2" }]) as { error: string }).error,
    /unique/,
  );
  assert.match(
    (buildPlan("g", [{ id: "a", title: "1", dependsOn: ["ghost"] }]) as { error: string }).error,
    /unknown step/,
  );
  assert.match(
    (buildPlan("g", [{ id: "a", title: "1", dependsOn: ["a"] }]) as { error: string }).error,
    /itself/,
  );
  // Cycle: a → b → a.
  assert.match(
    (buildPlan("g", [
      { id: "a", title: "1", dependsOn: ["b"] },
      { id: "b", title: "2", dependsOn: ["a"] },
    ]) as { error: string }).error,
    /cycle/,
  );
});

test("status transitions are enforced, including dependency order", () => {
  let plan = mustBuild("g", [
    { id: "a", title: "first" },
    { id: "b", title: "second", dependsOn: ["a"] },
  ]);
  // b cannot start before a is done.
  assert.match((applyStepUpdate(plan, "b", "running") as { error: string }).error, /unfinished/);
  plan = (applyStepUpdate(plan, "a", "running") as { plan: Plan }).plan;
  // running → running is illegal; done → anything is illegal.
  assert.match((applyStepUpdate(plan, "a", "running") as { error: string }).error, /cannot go/);
  plan = (applyStepUpdate(plan, "a", "done") as { plan: Plan }).plan;
  assert.match((applyStepUpdate(plan, "a", "failed") as { error: string }).error, /cannot go/);
  plan = (applyStepUpdate(plan, "b", "running") as { plan: Plan }).plan;
  plan = (applyStepUpdate(plan, "b", "failed", "network died") as { plan: Plan }).plan;
  assert.equal(plan.steps[1].note, "network died");
  // failed → running is the explicit retry path.
  assert.ok("plan" in applyStepUpdate(plan, "b", "running"));
  const progress = planProgress(plan);
  assert.deepEqual(progress, { done: 1, failed: 1, total: 2, finished: true });
});

test("unapproved write plans cannot start their steps", () => {
  const plan = mustBuild("g", [{ id: "a", title: "write", sql: "DELETE FROM S.T" }]);
  assert.match((applyStepUpdate(plan, "a", "running") as { error: string }).error, /not been approved/);
  const approved = { ...plan, approved: true };
  assert.ok("plan" in applyStepUpdate(approved, "a", "running"));
});
