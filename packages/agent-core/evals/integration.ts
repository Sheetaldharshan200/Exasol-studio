/**
 * INTEGRATION tier — boots the REAL agent-core server in-process (temp data
 * dir, random port) and drives the whole P1–P5 stack through the actual HTTP
 * gateway, exactly the way the desktop app and MCP clients do:
 *
 *   P1  run_query verify:true reproduces the result on an independent session
 *   P2  propose → approval gate blocks execution → approve
 *   P5  execute_plan runs a diamond DAG: parallel branches, retry with
 *       backoff, skip-on-failure, onFailure compensation, durable resume
 *   P3  the run lands in the trace store (gateway spans, summary, recent)
 *   Guardrail: writePolicy=deny refuses write plans even when approved
 *
 * Needs a local Exasol (discovered, or EXA_EVAL_DSN) — a LOCAL tier like
 * evals/golden.ts and evals/live.ts, not part of CI:
 *
 *   pnpm --filter @exasol-studio/agent-core smoke:gateway
 *
 * No model is needed: everything here is deterministic plumbing.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/config.ts";
import { DbRegistry } from "../src/db.ts";
import { initLog } from "../src/log.ts";
import { startServer } from "../src/server.ts";
import { dbTargets, type DbTarget } from "./local-db.ts";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Set by main() once a DB target answers; the exit-path cleanup uses it. */
let cleanupTarget: DbTarget | null = null;
let tmpDir: string | null = null;

/**
 * Belt-and-braces cleanup that does NOT depend on the in-process server
 * still being healthy: drop the smoke schemas over a direct DB session and
 * remove the temp data dir (it holds the gateway token while alive). Runs
 * on success AND on a mid-run crash.
 */
async function cleanupExitPath(): Promise<void> {
  if (cleanupTarget) {
    try {
      const db = new DbRegistry();
      db.register({ id: "cleanup", name: "cleanup", host: cleanupTarget.host, port: cleanupTarget.port, user: cleanupTarget.user, password: cleanupTarget.password });
      await db.executeIsolated("cleanup", "DROP SCHEMA IF EXISTS ITEST_DAG CASCADE");
      await db.executeIsolated("cleanup", "DROP SCHEMA IF EXISTS ITEST_DENIED CASCADE");
    } catch {
      /* best effort — the in-run cleanup plan is the primary path */
    }
  }
  if (tmpDir) {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}

async function main() {
  const tmp = mkdtempSync(join(tmpdir(), "exa-integration-"));
  tmpDir = tmp;
  const config = new ConfigStore(tmp);
  initLog(tmp, { stderrMin: "warn" });
  const { port, token } = await startServer(config);
  const base = `http://127.0.0.1:${port}/v1`;

  const http = async <T = Record<string, unknown>>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> => {
    const res = await fetch(base + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return (await res.json()) as T;
  };

  // ── Database: first local target that answers ─────────────────────────────
  for (const t of dbTargets(process.env.EXA_EVAL_DSN)) {
    await http("/connections", { id: "itest", name: "itest", host: t.host, port: t.port, user: t.user, password: t.password, encryption: true }, "PUT");
    const probe = await http<{ rowCount?: number; error?: string }>("/gateway/query", { database: "itest", sql: "SELECT 1" });
    if (probe.rowCount === 1) {
      console.log(`database: ${t.label} (${t.host}:${t.port})\n`);
      cleanupTarget = t;
      break;
    }
  }
  if (!cleanupTarget) {
    console.error("no reachable local Exasol — start Exasol Personal or set EXA_EVAL_DSN");
    process.exit(2);
  }

  // ── P1: verified query on an independent session ──────────────────────────
  console.log("P1 verification");
  {
    type R = { rowCount: number; verification?: { status: string; detail?: string } };
    const r = await http<R>("/gateway/query", { database: "itest", sql: "SELECT 42 AS ANSWER", verify: true });
    check("verify:true returns a verification stamp", Boolean(r.verification), JSON.stringify(r).slice(0, 120));
    check("independent re-run verified the result", r.verification?.status === "verified", r.verification?.detail);
    const nd = await http<R>("/gateway/query", { database: "itest", sql: "SELECT RANDOM() AS R", verify: true });
    check("non-deterministic SQL is honestly unverified", nd.verification?.status === "unverified", nd.verification?.detail);
  }

  // ── P2 + P5: plan lifecycle and DAG execution ─────────────────────────────
  console.log("\nP2 plan gate + P5 DAG execution");
  type PlanResp = { plan?: { id: string; requiresApproval: boolean; approved: boolean; steps: { id: string; status: string; attempts?: number; note?: string }[] }; error?: string };
  const proposed = await http<PlanResp>("/gateway/plan", {
    goal: "integration DAG",
    steps: [
      { id: "s1", title: "schema", sql: "CREATE SCHEMA IF NOT EXISTS ITEST_DAG" },
      { id: "s2", title: "branch A", sql: "CREATE OR REPLACE TABLE ITEST_DAG.A AS SELECT 1 AS X", dependsOn: ["s1"] },
      { id: "s3", title: "branch B", sql: "CREATE OR REPLACE TABLE ITEST_DAG.B AS SELECT 2 AS X", dependsOn: ["s1"] },
      { id: "s4", title: "join", sql: "SELECT COUNT(*) AS N FROM ITEST_DAG.A, ITEST_DAG.B", dependsOn: ["s2", "s3"] },
      { id: "s5", title: "doomed", sql: "INSERT INTO ITEST_DAG.MISSING VALUES (1)", dependsOn: ["s1"], onFailure: "s6" },
      { id: "s6", title: "compensate", sql: "DROP SCHEMA IF EXISTS ITEST_DAG_STAGING CASCADE" },
    ],
  });
  const planId = proposed.plan?.id ?? "";
  check("write plan requires approval", proposed.plan?.requiresApproval === true && proposed.plan?.approved === false);

  const premature = await http<{ error?: string }>("/gateway/plan/execute", { planId, database: "itest" });
  check("execution is BLOCKED before approval", /not been approved/i.test(premature.error ?? ""), JSON.stringify(premature).slice(0, 120));

  await http("/gateway/plan/approve", { planId });
  type ExecResp = { ok?: boolean; notes?: string[]; plan?: PlanResp["plan"]; error?: string };
  const exec = await http<ExecResp>("/gateway/plan/execute", { planId, database: "itest" });
  const step = (id: string) => exec.plan?.steps.find((s) => s.id === id);
  // Concurrency itself (real overlap) is proven in dag-executor.test.ts via
  // peak-in-flight; over HTTP this asserts the DAG completed correctly.
  check("independent branches + join completed", ["s1", "s2", "s3", "s4"].every((id) => step(id)?.status === "done"), JSON.stringify(exec.plan?.steps ?? exec).slice(0, 200));
  check("doomed step retried once then failed hard", step("s5")?.status === "failed" && step("s5")?.attempts === 2, `attempts=${step("s5")?.attempts}`);
  check("compensation ran", step("s6")?.status === "done" && (exec.notes ?? []).some((n) => n.includes("compensating")));
  check("run reports ok=false honestly", exec.ok === false);

  const again = await http<ExecResp>("/gateway/plan/execute", { planId, database: "itest" });
  check("re-execution of a settled plan is a clean no-op (resume semantics)", !("error" in again && again.error) && again.plan?.steps.every((s) => s.status !== "running") === true, JSON.stringify(again).slice(0, 120));

  // ── Guardrail: writePolicy=deny beats plan approval ───────────────────────
  console.log("\nwrite guardrail");
  try {
    config.update((c) => {
      c.agent = { ...c.agent, writePolicy: "deny" };
    });
    const denyPlan = await http<PlanResp>("/gateway/plan", {
      goal: "denied write",
      steps: [{ id: "w", title: "write", sql: "CREATE SCHEMA IF NOT EXISTS ITEST_DENIED" }],
    });
    // The approve/execute routes fall back to the CURRENT plan when planId is
    // missing — an undefined id here would test the wrong plan and false-pass.
    const denyId = denyPlan.plan?.id;
    check("deny-plan was proposed (explicit id)", Boolean(denyId), JSON.stringify(denyPlan).slice(0, 120));
    if (denyId) {
      const approved = await http<PlanResp>("/gateway/plan/approve", { planId: denyId });
      check("deny-plan was approved", approved.plan?.approved === true);
      const denied = await http<{ error?: string }>("/gateway/plan/execute", { planId: denyId, database: "itest" });
      check("writePolicy=deny refuses even an approved plan", /disabled in this workspace/i.test(denied.error ?? ""), JSON.stringify(denied).slice(0, 140));
    }
  } finally {
    config.update((c) => {
      c.agent = { ...c.agent, writePolicy: "ask" };
    });
  }

  // ── P3: the activity landed in the trace store ────────────────────────────
  console.log("\nP3 observability");
  {
    type Summary = { gatewayCalls: number; failures: number };
    const s = await http<Summary>("/traces/summary?days=1");
    check("gateway spans recorded (queries + plan runs)", s.gatewayCalls >= 3, `gatewayCalls=${s.gatewayCalls}`);
    const r = await http<{ spans: { kind: string; name: string; ok: boolean }[] }>("/traces/recent?limit=50");
    check("recent activity includes run_query and execute_plan", r.spans.some((x) => x.name === "run_query") && r.spans.some((x) => x.name === "execute_plan"));
  }

  // ── Cleanup (via the same machinery it just proved) ───────────────────────
  console.log("\ncleanup");
  const cleanup = await http<PlanResp>("/gateway/plan", {
    goal: "cleanup",
    steps: [
      { id: "c1", title: "drop dag schema", sql: "DROP SCHEMA IF EXISTS ITEST_DAG CASCADE" },
      { id: "c2", title: "drop guardrail leftovers", sql: "DROP SCHEMA IF EXISTS ITEST_DENIED CASCADE" },
    ],
  });
  await http("/gateway/plan/approve", { planId: cleanup.plan?.id });
  const cleaned = await http<ExecResp>("/gateway/plan/execute", { planId: cleanup.plan?.id, database: "itest" });
  check("cleanup plan executed", cleaned.ok === true);

  console.log(`\n${pass} passed, ${fail} failed`);
  await cleanupExitPath();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error(`fatal: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  // A mid-run crash must not strand smoke schemas in the user's database.
  await cleanupExitPath();
  process.exit(1);
});
