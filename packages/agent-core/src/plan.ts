// P2 of the agentic architecture (docs/agentic-architecture-spec.md):
// the explicit plan object. Pure logic ONLY — schema validation, dependency
// checks, status transitions, progress — so every rule is unit-tested.
// Storage lives in plans-store.ts; execution stays with the model until P5
// (which is why `dependsOn` is recorded from day one: it is P5's seam).

import { classifySql } from "./tools.ts";

export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped";

export type PlanStep = {
  id: string;
  title: string;
  /** Tool the step intends to use (informational until P5). */
  tool?: string;
  /** SQL the step intends to run — drives the write-approval requirement. */
  sql?: string;
  dependsOn: string[];
  status: StepStatus;
  note?: string;
  /** P5: id of a compensation step to run if THIS step fails hard. The
   *  referenced step is excluded from normal scheduling. */
  onFailure?: string;
  /** P5: how many times this step has been started (durable, drives retry). */
  attempts?: number;
};

export type Plan = {
  id: string;
  goal: string;
  createdAt: number;
  updatedAt: number;
  steps: PlanStep[];
  /** True when any step carries a write statement or a write-shaped tool. */
  requiresApproval: boolean;
  /** Set by the approval gate (loop path) or the user's go-ahead (gateway). */
  approved: boolean;
};

export type PlanStepInput = {
  id?: string;
  title: string;
  tool?: string;
  sql?: string;
  dependsOn?: string[];
  onFailure?: string;
};

const MAX_STEPS = 12;

/** Tools that change state — a plan using them needs approval like write SQL. */
const WRITE_SHAPED_TOOLS = /^(import_csv|run_sql_write|create_dashboard|save_dashboard|control_app|install_component)$/;

function stepNeedsApproval(step: PlanStepInput): boolean {
  if (step.sql && classifySql(step.sql) !== "read") return true;
  if (step.tool && WRITE_SHAPED_TOOLS.test(step.tool)) return true;
  return false;
}

/** Kahn's algorithm — true when the dependency graph has no cycle. */
function acyclic(steps: { id: string; dependsOn: string[] }[]): boolean {
  const indegree = new Map<string, number>(steps.map((s) => [s.id, 0]));
  const dependents = new Map<string, string[]>();
  for (const s of steps) {
    for (const d of s.dependsOn) {
      indegree.set(s.id, (indegree.get(s.id) ?? 0) + 1);
      dependents.set(d, [...(dependents.get(d) ?? []), s.id]);
    }
  }
  const queue = steps.filter((s) => (indegree.get(s.id) ?? 0) === 0).map((s) => s.id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift()!;
    visited++;
    for (const dep of dependents.get(id) ?? []) {
      const left = (indegree.get(dep) ?? 0) - 1;
      indegree.set(dep, left);
      if (left === 0) queue.push(dep);
    }
  }
  return visited === steps.length;
}

export function buildPlan(goal: string, stepsInput: PlanStepInput[]): { plan: Plan } | { error: string } {
  const trimmedGoal = goal.trim();
  if (!trimmedGoal) return { error: "A plan needs a goal." };
  if (stepsInput.length === 0) return { error: "A plan needs at least one step." };
  if (stepsInput.length > MAX_STEPS) return { error: `Plans are capped at ${MAX_STEPS} steps — split the work.` };

  const steps: PlanStep[] = stepsInput.map((s, i) => ({
    id: (s.id ?? `s${i + 1}`).trim(),
    title: s.title.trim(),
    tool: s.tool?.trim() || undefined,
    sql: s.sql?.trim() || undefined,
    dependsOn: (s.dependsOn ?? []).map((d) => d.trim()).filter(Boolean),
    status: "pending" as const,
    onFailure: s.onFailure?.trim() || undefined,
  }));

  if (steps.some((s) => !s.id || !s.title)) return { error: "Every step needs an id and a title." };
  const ids = new Set(steps.map((s) => s.id));
  if (ids.size !== steps.length) return { error: "Step ids must be unique." };
  for (const s of steps) {
    if (s.dependsOn.includes(s.id)) return { error: `Step "${s.id}" cannot depend on itself.` };
    for (const d of s.dependsOn) {
      if (!ids.has(d)) return { error: `Step "${s.id}" depends on unknown step "${d}".` };
    }
  }
  // P5 compensation hooks: the target must exist, differ from its owner, and
  // stay OUT of the normal flow (nothing may depend on a compensation step —
  // it only runs when its owner fails hard).
  const compTargets = new Set(steps.map((s) => s.onFailure).filter(Boolean) as string[]);
  for (const s of steps) {
    if (!s.onFailure) continue;
    if (s.onFailure === s.id) return { error: `Step "${s.id}" cannot be its own onFailure step.` };
    if (!ids.has(s.onFailure)) return { error: `Step "${s.id}" names unknown onFailure step "${s.onFailure}".` };
  }
  for (const s of steps) {
    const dep = s.dependsOn.find((d) => compTargets.has(d));
    if (dep) return { error: `Step "${s.id}" depends on "${dep}", which is a compensation step and only runs on failure.` };
    if (compTargets.has(s.id) && s.onFailure) return { error: `Compensation step "${s.id}" cannot have its own onFailure hook.` };
    // A compensation step fires when its owner FAILED — dependencies could
    // never be satisfied at that point, so they are rejected outright.
    if (compTargets.has(s.id) && s.dependsOn.length) return { error: `Compensation step "${s.id}" cannot have dependencies — it runs when its owner fails.` };
  }

  if (!acyclic(steps)) return { error: "The step dependencies contain a cycle." };

  const requiresApproval = stepsInput.some(stepNeedsApproval);
  const now = Date.now();
  return {
    plan: {
      id: `plan-${now}-${Math.random().toString(36).slice(2, 8)}`,
      goal: trimmedGoal,
      createdAt: now,
      updatedAt: now,
      steps,
      requiresApproval,
      approved: !requiresApproval, // read-only plans need no gate
    },
  };
}

/** Legal transitions. `failed → running` allows an explicit retry. */
const TRANSITIONS: Record<StepStatus, StepStatus[]> = {
  pending: ["running", "skipped"],
  running: ["done", "failed"],
  failed: ["running", "skipped"],
  done: [],
  skipped: [],
};

export function applyStepUpdate(
  plan: Plan,
  stepId: string,
  status: StepStatus,
  note?: string,
): { plan: Plan } | { error: string } {
  const step = plan.steps.find((s) => s.id === stepId);
  if (!step) return { error: `No step "${stepId}" in this plan.` };
  if (!TRANSITIONS[step.status].includes(status)) {
    return { error: `Step "${stepId}" cannot go ${step.status} → ${status}.` };
  }
  if (status === "running") {
    const blockers = step.dependsOn.filter((d) => plan.steps.find((s) => s.id === d)?.status !== "done");
    if (blockers.length) {
      return { error: `Step "${stepId}" depends on unfinished step(s): ${blockers.join(", ")}.` };
    }
    if (plan.requiresApproval && !plan.approved) {
      return { error: "This plan contains write steps and has not been approved yet." };
    }
  }
  return {
    plan: {
      ...plan,
      updatedAt: Date.now(),
      steps: plan.steps.map((s) =>
        s.id === stepId
          ? {
              ...s,
              status,
              note: note?.trim() || s.note,
              // Every start consumes an attempt — durable, so retry budgets
              // survive a crash (P5).
              attempts: status === "running" ? (s.attempts ?? 0) + 1 : s.attempts,
            }
          : s,
      ),
    },
  };
}

export function planProgress(plan: Plan): { done: number; failed: number; total: number; finished: boolean } {
  // Compensation steps count only once triggered — an untriggered one stays
  // pending forever by design and must not hold the plan open.
  const comps = new Set(plan.steps.map((s) => s.onFailure).filter(Boolean) as string[]);
  const counted = plan.steps.filter((s) => !comps.has(s.id) || s.status !== "pending");
  const done = counted.filter((s) => s.status === "done").length;
  const failed = counted.filter((s) => s.status === "failed").length;
  const settled = counted.every((s) => s.status === "done" || s.status === "skipped" || s.status === "failed");
  return { done, failed, total: counted.length, finished: settled };
}
