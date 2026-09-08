/**
 * GOLDEN eval tier (P4, docs/agentic-architecture-spec.md) — declarative
 * question suites (evals/suites/*.eval.json) run through the REAL turn loop
 * against a REAL seeded Exasol, scored deterministically (src/evals.ts,
 * unit-tested), results banked in STUDIO_EVALS so trends are one SQL query
 * away. Complements evals/run.ts (model-free recovery tier) and
 * evals/live.ts (DB-free model tier).
 *
 *   pnpm --filter @exasol-studio/agent-core evals:golden                # config default model
 *   pnpm --filter @exasol-studio/agent-core evals:golden -- <model-ref> --min-pass=0.8
 *
 * Database: EXA_EVAL_DSN (exa://user:pass@host:port); without it, local
 * Exasol Personal deployments are discovered automatically. Cases run in
 * file order and may build on earlier cases' fixtures — `--case=<id>` is
 * for re-running a case whose setup is self-contained.
 * Flags: --min-pass=<0..1> (gate, default 0.8), --no-record (skip
 * STUDIO_EVALS insert), --keep-fixture (leave EVAL_FIXTURE behind),
 * --case=<id> (run one case).
 */

import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dbTargets, type DbTarget } from "./local-db.ts";
import { randomUUID } from "node:crypto";
import { ConfigStore, defaultDataDir } from "../src/config.ts";
import { initLog } from "../src/log.ts";
import { ProviderRegistry } from "../src/providers.ts";
import { SessionStore } from "../src/session.ts";
import { DbRegistry } from "../src/db.ts";
import { MemoryStore } from "../src/memory.ts";
import { KnowledgeGraph } from "../src/kb.ts";
import { DashboardStore } from "../src/dashboards.ts";
import { ArtifactStore } from "../src/artifacts.ts";
import { DocumentStore } from "../src/documents.ts";
import { SkillStore } from "../src/skills.ts";
import { runTurn } from "../src/loop.ts";
import { parseSuite, scoreCase, scorecard, type CaseResult, type EvalCase, type EvalEvidence } from "../src/evals.ts";

const TIMEOUT_MS = 180_000;
const DB_ID = "eval";

function loadSuites(dir: string, onlyCase?: string): EvalCase[] {
  const cases: EvalCase[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".eval.json")).sort()) {
    const parsed = parseSuite(readFileSync(join(dir, f), "utf8"), f);
    if ("error" in parsed) {
      console.error(`suite error: ${parsed.error}`);
      process.exit(2);
    }
    cases.push(...parsed.cases);
  }
  return onlyCase ? cases.filter((c) => c.id === onlyCase) : cases;
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

async function main() {
  const flags = new Map<string, string>();
  const positional: string[] = [];
  for (const a of process.argv.slice(2)) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (m) flags.set(m[1], m[2] ?? "true");
    else positional.push(a);
  }
  const minPass = Number(flags.get("min-pass") ?? process.env.EXA_EVAL_MIN_PASS ?? 0.8);
  const record = flags.get("no-record") !== "true";

  // Stores are throwaway; provider config comes from the REAL app dir so the
  // user's default model and keys apply (same pattern as evals/live.ts).
  const tmp = mkdtempSync(join(tmpdir(), "exa-golden-eval-"));
  const config = new ConfigStore(tmp);
  initLog(tmp, { stderrMin: "warn" });
  // The registry must read the REAL config: provider keys and base URLs live
  // there, and resolve() looks them up through the registry's own store. The
  // throwaway config is only for runTurn's settings (it writes provider
  // limits back, which must never touch the user's real config).
  const realConfig = new ConfigStore(defaultDataDir());
  const registry = new ProviderRegistry(realConfig);
  let model = positional[0] ?? realConfig.get().model ?? null;
  if (!model) {
    for (const p of await registry.list()) {
      if (p.configured && (p.kind !== "local" || p.running) && p.models.length) {
        const m = p.models.find((m) => m.toolCall !== false) ?? p.models[0];
        model = `${p.id}/${m.id}`;
        break;
      }
    }
  }
  if (!model) {
    console.error("no model available — set one in Studio, start a local engine, or pass a model ref");
    process.exit(2);
  }

  const targets: DbTarget[] = dbTargets(flags.get("dsn") ?? process.env.EXA_EVAL_DSN);
  const db = new DbRegistry();
  let connected: DbTarget | null = null;
  const attempts: string[] = [];
  for (const t of targets) {
    db.register({ id: DB_ID, name: "eval", host: t.host, port: t.port, user: t.user, password: t.password });
    try {
      await db.query(DB_ID, "SELECT 1");
      connected = t;
      break;
    } catch (e) {
      attempts.push(`${t.label} (${t.host}:${t.port}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!connected) {
    console.error(
      `no reachable Exasol —\n  ${attempts.join("\n  ")}\n` +
        "start a local Exasol Personal, or point EXA_EVAL_DSN (or --dsn) at one: exa://user:pass@host:port",
    );
    process.exit(2);
  }

  const cases = loadSuites(join(import.meta.dirname, "suites"), flags.get("case"));
  if (!cases.length) {
    console.error("no eval cases found");
    process.exit(2);
  }
  console.log(`golden evals: ${cases.length} case(s) against ${connected.label} (${connected.host}:${connected.port}), model ${model}\n`);

  const sessions = new SessionStore(tmp);
  const memory = new MemoryStore(tmp);
  const kb = new KnowledgeGraph(tmp);
  const dashboards = new DashboardStore(tmp);
  const artifacts = new ArtifactStore(tmp);
  const documents = new DocumentStore();
  const skills = new SkillStore(tmp);

  const results: CaseResult[] = [];
  const timings = new Map<string, number>();
  const runId = randomUUID();
  const runStarted = Date.now();

  for (const c of cases) {
    for (const sql of c.setup ?? []) await db.execute(DB_ID, sql);

    const session = sessions.create();
    session.connectionId = DB_ID;
    const ev: EvalEvidence = { answer: "", toolsUsed: [], sqlExecuted: [], reads: [], deniedSql: [], errors: [] };
    const un = session.subscribe((e) => {
      if (e.type === "text-delta") ev.answer += e.delta;
      if (e.type === "tool-start" && !e.provisional) {
        ev.toolsUsed.push(e.name);
        const a = e.args as { sql?: unknown; statements?: unknown } | null;
        if (typeof a?.sql === "string") ev.sqlExecuted.push(a.sql);
        if (Array.isArray(a?.statements))
          for (const s of a.statements) {
            if (typeof s === "string") ev.sqlExecuted.push(s);
            else if (typeof (s as { sql?: unknown })?.sql === "string") ev.sqlExecuted.push((s as { sql: string }).sql);
          }
      }
      if (e.type === "error") ev.errors.push(e.message);
      // Golden evals never approve writes — the refusal case depends on it.
      // The denied SQL is remembered so scoring can tell "gate held" apart
      // from "write actually ran" (tool-start fires before the ask).
      if (e.type === "permission-ask") {
        ev.deniedSql.push(e.detail);
        session.answerPermission(e.id, false);
      }
      if (e.type === "ui-request") session.answerUi(e.id, false, "eval");
    });
    const started = Date.now();
    const killer = setTimeout(() => session.abort?.abort(), TIMEOUT_MS);
    try {
      await runTurn({
        session, registry, db, memory, kb,
        store: sessions, config, dashboards, artifacts, skills, documents,
        modelRef: model, userText: c.question, surface: "cli",
      });
    } catch (e) {
      ev.errors.push(e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(killer);
      un();
    }
    ev.reads = session.sqlRuns.map((r) => ({ sql: r.sql, rowCount: r.rowCount }));
    timings.set(c.id, Date.now() - started);

    const result = scoreCase(c, ev);
    results.push(result);
    console.log(`${result.pass ? "✓" : "✗"} ${c.id} (${((timings.get(c.id) ?? 0) / 1000).toFixed(1)}s)`);
    for (const check of result.checks) {
      if (!check.ok) console.log(`    ✗ ${check.label}${check.detail ? ` — ${check.detail}` : ""}`);
    }
    if (ev.errors.length && !result.pass) console.log(`    errors: ${ev.errors.join("; ").slice(0, 200)}`);
  }

  if (flags.get("keep-fixture") !== "true") {
    await db.execute(DB_ID, "DROP SCHEMA IF EXISTS EVAL_FIXTURE CASCADE").catch(() => undefined);
  }

  const card = scorecard(results);
  console.log(`\n${card.passed}/${card.total} passed (${(card.rate * 100).toFixed(0)}%), model ${model}, ${((Date.now() - runStarted) / 1000).toFixed(0)}s total`);

  if (record) {
    // Dogfood: results live in the database being evaluated, so the trend is
    // one SELECT away and the dashboards feature can chart it.
    try {
      await db.execute(DB_ID, "CREATE SCHEMA IF NOT EXISTS STUDIO_EVALS");
      await db.execute(
        DB_ID,
        "CREATE TABLE IF NOT EXISTS STUDIO_EVALS.RUNS (RUN_ID VARCHAR(36), RUN_TS TIMESTAMP, MODEL VARCHAR(200), SUITE VARCHAR(100), CASES INT, PASSED INT, PASS_RATE DECIMAL(5,4), DURATION_MS BIGINT)",
      );
      await db.execute(
        DB_ID,
        "CREATE TABLE IF NOT EXISTS STUDIO_EVALS.RESULTS (RUN_ID VARCHAR(36), CASE_ID VARCHAR(100), PASSED BOOLEAN, DETAIL VARCHAR(2000), DURATION_MS BIGINT)",
      );
      await db.execute(
        DB_ID,
        `INSERT INTO STUDIO_EVALS.RUNS VALUES (${q(runId)}, NOW(), ${q(model)}, 'core', ${card.total}, ${card.passed}, ${card.rate.toFixed(4)}, ${Date.now() - runStarted})`,
      );
      for (const r of results) {
        const detail = r.checks.filter((x) => !x.ok).map((x) => `${x.label}${x.detail ? `: ${x.detail}` : ""}`).join(" | ").slice(0, 1900);
        await db.execute(
          DB_ID,
          `INSERT INTO STUDIO_EVALS.RESULTS VALUES (${q(runId)}, ${q(r.id)}, ${r.pass}, ${q(detail)}, ${timings.get(r.id) ?? 0})`,
        );
      }
      console.log(`recorded as run ${runId} in STUDIO_EVALS`);
    } catch (e) {
      console.error(`could not record results: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (card.rate < minPass) {
    console.error(`FAIL: pass rate ${(card.rate * 100).toFixed(0)}% is below the ${(minPass * 100).toFixed(0)}% gate`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(`fatal: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  process.exit(1);
});
