/**
 * LIVE eval tier — runs real turns against a real LOCAL model and scores the
 * behaviors that matter: answers follow instructions, tools actually get
 * invoked (natively or via text-rescue), and attached documents are read
 * instead of hallucinated. Complements evals/run.ts (deterministic tier).
 *
 *   pnpm --filter @exasol-studio/agent-core evals:live              # default model
 *   pnpm --filter @exasol-studio/agent-core evals:live -- ollama/qwen3-coder:30b
 *
 * Requires a running local engine (built-in llama-server or Ollama). No
 * database needed — cases are chosen to be DB-free.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import { runTurn, type Attachment } from "../src/loop.ts";

const TIMEOUT_MS = 120_000;

async function main() {
  // Stores live in a throwaway dir; provider config comes from the REAL app
  // dir so cloud keys / defaults are available if the user picked them.
  const tmp = mkdtempSync(join(tmpdir(), "exa-live-eval-"));
  const config = new ConfigStore(tmp);
  initLog(tmp, { stderrMin: "warn" });
  const registry = new ProviderRegistry(config);
  const realConfig = new ConfigStore(defaultDataDir());

  const argModel = process.argv[2];
  let model = argModel ?? realConfig.get().model ?? null;
  if (!model) {
    const providers = await registry.list();
    for (const p of providers) {
      if (p.kind === "local" && p.running && p.models.length) {
        model = `${p.id}/${p.models.find((m) => m.toolCall !== false)?.id ?? p.models[0].id}`;
        break;
      }
    }
  }
  if (!model) {
    console.error("no local model available — start the built-in engine or Ollama, or pass a model ref");
    process.exit(2);
  }
  console.log(`live evals against ${model}\n`);

  const sessions = new SessionStore(tmp);
  const db = new DbRegistry();
  const memory = new MemoryStore(tmp);
  const kb = new KnowledgeGraph(tmp);
  const dashboards = new DashboardStore(tmp);
  const artifacts = new ArtifactStore(tmp);
  const documents = new DocumentStore();
  const skills = new SkillStore(tmp);

  let pass = 0;
  let fail = 0;

  type Outcome = { text: string; toolsInvoked: string[]; errors: string[] };
  async function turn(userText: string, attachments?: Attachment[]): Promise<Outcome> {
    const session = sessions.create();
    const out: Outcome = { text: "", toolsInvoked: [], errors: [] };
    const un = session.subscribe((e) => {
      if (e.type === "text-delta") out.text += e.delta;
      if (e.type === "tool-start") out.toolsInvoked.push(e.name);
      if (e.type === "error") out.errors.push(e.message);
      // Live evals never approve writes — deny instantly so nothing blocks.
      if (e.type === "permission-ask") session.answerPermission(e.id, false);
      if (e.type === "ui-request") session.answerUi(e.id, false, "eval");
    });
    const killer = setTimeout(() => session.abort?.abort(), TIMEOUT_MS);
    try {
      await runTurn({
        session, registry, db, memory, kb,
        store: sessions, config, dashboards, artifacts, skills, documents,
        modelRef: model!,
        userText,
        attachments,
        surface: "cli",
      });
    } catch (e) {
      out.errors.push(e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(killer);
      un();
    }
    return out;
  }

  function score(name: string, ok: boolean, detail: string) {
    if (ok) {
      pass++;
      console.log(`  ✓ ${name}`);
    } else {
      fail++;
      console.log(`  ✗ ${name} — ${detail}`);
    }
  }

  // L1 — instruction following, no tools needed.
  {
    const r = await turn("Reply with exactly one word: READY");
    score("L1 instruction following", /\bREADY\b/i.test(r.text), `got: ${r.text.slice(0, 120) || r.errors.join("; ")}`);
  }

  // L2 — a tool must actually be INVOKED (natively or via text-rescue) for a
  // question only a tool can answer; no phantom output.
  {
    const r = await turn("Which database connections do you currently have? Check with your tool, then answer.");
    const invoked = r.toolsInvoked.some((t) => t.includes("list_connections"));
    score("L2 tool invocation (list_connections)", invoked, `tools: [${r.toolsInvoked.join(", ")}], text: ${r.text.slice(0, 100)}`);
    score(
      "L2b answer reflects reality (no connections)",
      /no\b|none|not (yet )?connected|aren'?t any|/i.test(r.text) && !/\d+ (active )?connections/.test(r.text),
      r.text.slice(0, 140),
    );
  }

  // L3 — attached document is READ, not hallucinated (the C_ID incident).
  {
    const csv: Attachment = {
      name: "live-customers.csv",
      mime: "text/csv",
      kind: "text",
      data: "C_ID,C_NAME,C_CITY\n1,Alice,Berlin\n2,Bob,Munich\n3,Cara,Hamburg\n",
    };
    const r = await turn("What columns does the attached file have? Verify with your document tools before answering.", [csv]);
    const real = /C_ID/i.test(r.text) && /C_NAME/i.test(r.text) && /C_CITY/i.test(r.text);
    const hallucinated = /email|phone|\bage\b|country/i.test(r.text);
    score("L3 document grounding (real columns)", real && !hallucinated, r.text.slice(0, 160));
  }

  console.log(`\n${pass} passed, ${fail} failed (model: ${model})`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(`fatal: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  process.exit(1);
});
