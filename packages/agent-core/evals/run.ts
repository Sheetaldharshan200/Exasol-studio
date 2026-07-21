/**
 * Eval harness — every model failure we've caught in the field, banked as a
 * deterministic regression test against the RECOVERY LAYER (detectors,
 * repair, extraction, rendering, schemas). Zero deps, zero model calls, so
 * it runs in CI in milliseconds:
 *
 *   pnpm --filter @exasol-studio/agent-core evals
 *
 * Every case cites the real incident it came from. When a new failure is
 * captured in the wild, it gets a case here BEFORE the fix — fixes get
 * measured, not vibed.
 */

import { looksLikeUnacted, looksUnfinished } from "../src/loop.ts";
import { extractTextToolCalls, parseLooseArgs, repairArgs, resolveToolName, zodSchemaish } from "../src/tool-repair.ts";
import { MarkdownStream } from "../src/tui.ts";
import { parseCsv, buildPlan, objectsToTable } from "../src/csv-import.ts";
import { DashboardSchema } from "../src/dashboards.ts";
import { TurnBoard } from "../src/board.ts";
import { z } from "zod";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const TOOLSET = ["run_sql", "list_schemas", "list_tables", "describe_table", "kb_search", "import_csv", "get_table_sample", "list_connections", "search_documents", "read_document", "remember"];

// ─── Incident 2026-07-16: "EXA_PUMP plan" — model printed a fake install plan
// with invented SQL instead of calling tools. ─────────────────────────────────
console.log("\nplan-without-tools (EXA_PUMP incident)");
check(
  "invented EXA_PUMP statement trips the detector",
  looksLikeUnacted("Step 6: Load the data into the tpch schema.\nEXA_PUMP tpch.customer FROM 'customer.csv';"),
);
check(
  "invented SYS.EXA_ATTACHED_FILES trips the detector",
  looksLikeUnacted("Step 4: SELECT * FROM SYS.EXA_ATTACHED_FILES;"),
);
check(
  "plan language + SQL trips the detector",
  looksLikeUnacted("Let's start by checking if the schema exists.\n```sql\nCREATE SCHEMA IF NOT EXISTS tpch;\n```\nWe'll use this later."),
);
check("a plain conceptual answer does NOT trip it", !looksLikeUnacted("Exasol stores tables column-oriented, which is why aggregations are fast."));

// ─── Incident 2026-07-17: model emitted the tool call as TEXT and stopped. ───
console.log("\ntext-emitted tool calls (search_documents / list_connections incidents)");
{
  const exact = `{\n  "name": "search_documents",\n  "arguments": {\n    "query": "customer.csv"\n  }\n}`;
  const calls = extractTextToolCalls(exact);
  check("the exact search_documents text call extracts", calls.length === 1 && calls[0].name === "search_documents");
  check("its arguments survive", (calls[0]?.args as { query?: string })?.query === "customer.csv");
}
check(
  "fenced ```json tool call extracts",
  extractTextToolCalls('```json\n{"name": "list_connections", "arguments": {}}\n```').length === 1,
);
check(
  "tool-call-as-text trips the unacted detector",
  looksLikeUnacted('I will check the connections.\n{"name": "list_connections", "arguments": {}}'),
);
check("plain JSON data does NOT extract as a call", extractTextToolCalls('the spec is {"panels": [{"id": 1}], "title": "x"}').length === 0);

// ─── Incident 2026-07-17: phantom ui_connect while UI tools disabled. ────────
console.log("\nphantom tools (ui_connect incident)");
check("ui_connect does not resolve when not exposed", resolveToolName("ui_connect", TOOLSET) === null);
check(
  "the phantom call still EXTRACTS (so the loop can correct it)",
  extractTextToolCalls('{"name": "ui_connect", "arguments": {"connection": "local"}}').length === 1,
);

// ─── Hallucinated names / malformed args (ongoing small-model behavior). ─────
console.log("\nname + argument repair");
check("execute_sql → run_sql", resolveToolName("execute_sql", TOOLSET) === "run_sql");
check("exa_pump → import_csv", resolveToolName("exa_pump", TOOLSET) === "import_csv");
check("list_schema → list_schemas", resolveToolName("list_schema", TOOLSET) === "list_schemas");
check("garbage name stays unresolved", resolveToolName("totally_fake_xyz", TOOLSET) === null);
{
  const schema = { properties: { sql: { type: "string" } }, required: ["sql"] };
  check("{query} → {sql}", (repairArgs({ query: "SELECT 1" }, schema) as { sql?: string })?.sql === "SELECT 1");
  check("missing required arg is NOT invented", repairArgs({ nothing: 1 }, schema) === null);
  check("double-encoded args parse", (parseLooseArgs('"{\\"sql\\": \\"SELECT 1\\"}"') as { sql?: string })?.sql === "SELECT 1");
}
{
  const sch = zodSchemaish(z.object({ sql: z.string(), limit: z.number().int().optional() }));
  check("zod introspection finds required keys", sch?.required.join(",") === "sql");
  check(
    "string→number coercion via introspected schema",
    (repairArgs({ sql: "SELECT 1", limit: "5" }, sch!) as { limit?: number })?.limit === 5,
  );
}

// ─── Incident 2026-07-17: turn ended MID-PLAN ("I'll now move on…"). ─────────
console.log("\nmid-plan stops (SEMANTIC_ADMIN incident)");
check(
  "the exact incident text trips looksUnfinished",
  looksUnfinished("The tables in the SEMANTIC_ADMIN schema are: ...\n\nI'll now move on to the next schema, SEMANTIC_AGENT."),
);
check("'Moving on to schema B.' trips it", looksUnfinished("Done with schema A. Moving on to schema B."));
check("a COMPLETE answer does not trip it", !looksUnfinished("Here are all 12 tables across 4 schemas: A.T1, A.T2, B.T1."));
check("a question to the user does not trip it", !looksUnfinished("I found 4 schemas. Which one should I explore first?"));

// ─── Incident 2026-07-17: raw tool-call JSON rendered in the CLI. ────────────
console.log("\nCLI rendering (JSON suppression incident)");
{
  const captured: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  (process.stdout as unknown as { write: (s: string) => boolean }).write = (s: string) => {
    captured.push(s);
    return true;
  };
  try {
    const md = new MarkdownStream();
    md.feed('Check:\n```json\n{"name": "list_schemas", "arguments": {}}\n```\nnow bare:\n{\n"name": "run_sql",\n"arguments": {"sql": "SELECT 1"}\n}\n');
    md.feed("```sql\nSELECT * FROM T\n```\n");
    md.flush();
  } finally {
    (process.stdout as unknown as { write: typeof orig }).write = orig;
  }
  const out = captured.join("");
  check("fenced tool-call JSON is suppressed", !out.includes("list_schemas"));
  check("bare tool-call JSON is suppressed", !out.includes("run_sql"));
  check("legit SQL block still renders", out.includes("SELECT * FROM T"));
}

// ─── Incident 2026-07-17: messy data loading (import_csv hardening). ─────────
console.log("\nmessy data loading");
{
  const clean = buildPlan(parseCsv("A,B\n1,x\n2,y"), "s", "t");
  check("clean CSV plans 2 rows", clean.rowCount === 2 && clean.columns.length === 2);
  const noHeader = buildPlan(parseCsv("1,2,3\n4,5,6"), "s", "t");
  check("headerless CSV synthesizes COL_n and keeps row 1", noHeader.columns[0].name === "COL_1" && noHeader.rowCount === 2);
  const messy = buildPlan(parseCsv('id;note\n1;"multi\nline"\n2;ok'), "s", "t");
  check("semicolon + quoted newline survive", messy.rowCount === 2);
  const objs = buildPlan(objectsToTable([{ a: 1, b: "x" }, { a: 2, c: true }]), "s", "t", { assumeHeader: true });
  check("parquet-style objects union columns", objs.columns.length === 3);
}

// ─── Markdown dashboard panels (schema contract). ────────────────────────────
console.log("\ndashboard schema");
{
  const base = { version: 1, id: "d", title: "T", description: "", panels: [] as unknown[] };
  const md = { id: "p1", title: "n", grid: { x: 0, y: 0, w: 12, h: 3 }, viz: { type: "markdown", content: "## hi" } };
  const chartNoQuery = { id: "p2", title: "c", grid: { x: 0, y: 3, w: 6, h: 6 }, viz: { type: "echarts", chart: "bar" } };
  check("markdown panel needs no query", DashboardSchema.safeParse({ ...base, panels: [md] }).success);
  check("data panel without query is rejected", !DashboardSchema.safeParse({ ...base, panels: [chartNoQuery] }).success);
}

// ─── Incident 2026-07-17: model hallucinated CSV columns because searching
// the FILENAME found nothing (DocumentStore ignored docName). ────────────────
console.log("\ndocument search");
{
  const { DocumentStore } = await import("../src/documents.ts");
  const ds = new DocumentStore();
  ds.add("s1", "test-customers.csv", "text/csv", "C_ID,C_NAME,C_CITY\n1,Alice,Berlin\n2,Bob,Munich");
  check("searching by FILENAME finds the file's chunks", ds.search("s1", "test-customers.csv").length > 0);
  check("content search still works", ds.search("s1", "alice berlin").length > 0);
}

// ─── Durable turns (crash-recovery contract). ────────────────────────────────
console.log("\ndurable turns");
{
  const { SessionStore } = await import("../src/session.ts");
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "exa-eval-crash-"));
  const store1 = new SessionStore(dir);
  const s1 = store1.create();
  s1.record({ kind: "user", text: "create schema TPCH" });
  const { AIMessage: EvalAI, ToolMessage: EvalTool, HumanMessage: EvalHuman } = await import("@langchain/core/messages");
  s1.checkpoint("create schema TPCH", [
    new EvalAI({ content: "", tool_calls: [{ id: "t1", name: "run_sql", args: { sql: "CREATE SCHEMA TPCH" } }] }),
    new EvalTool({ tool_call_id: "t1", name: "run_sql", content: JSON.stringify({ ok: true }) }),
  ]);
  store1.touch(s1);
  // "crash" — no clearCheckpoint. A fresh store revives the session:
  const s2 = new SessionStore(dir).get(s1.id)!;
  check("crashed turn's steps are recovered", s2.messages.some((m) => m._getType() === "tool"));
  check("recovery note is present", String(s2.messages.at(-1)?.content ?? "").includes("[Recovered]"));
  check("user text is not duplicated", s2.messages.filter((m) => m._getType() === "human" && m.content === "create schema TPCH").length === 1);
  const s3 = new SessionStore(dir).get(s1.id)!;
  check("checkpoint is consumed (no double recovery)", !String(s3.messages.at(-1)?.content ?? "").includes("[Recovered]"));

  // A write awaiting approval when the process died must SURVIVE the restart
  // as a re-ask (durable interrupt) — and never auto-execute.
  const dir2 = mkdtempSync(join(tmpdir(), "exa-eval-perm-"));
  const storeA = new SessionStore(dir2);
  const sA = storeA.create();
  sA.record({ kind: "user", text: "drop the STAGING schema" });
  sA.record({ kind: "permission.ask", id: "p1", tool: "run_sql", summary: "Drop schema STAGING", detail: "DROP SCHEMA STAGING CASCADE" });
  sA.checkpoint("drop the STAGING schema", [new EvalAI({ content: "I need approval to drop it." })]);
  storeA.touch(sA);
  const sB = new SessionStore(dir2).get(sA.id)!;
  const note = String(sB.messages.at(-1)?.content ?? "");
  check("pending permission survives restart as a re-ask", note.includes("Drop schema STAGING"));
  check("recovery never claims the write ran", note.includes("did NOT run") || note.includes("It did NOT run"));

  // /undo: rewinds the last exchange from model context.
  const sU = storeA.create();
  sU.messages.push(new EvalHuman("q1"), new EvalAI("a1"));
  check("undo drops the last exchange", sU.undoLastExchange() && sU.messages.length === 0);
  check("undo on empty is a no-op", !sU.undoLastExchange());
}

// ─── CLI history must never persist credentials. ─────────────────────────────
console.log("\ncredential redaction");
{
  const redact = (line: string) => line.replace(/exa:\/\/([^:@\s]+):[^@\s]+@/g, "exa://$1:***@");
  check(
    "password in exa:// URL is redacted",
    redact("/connect exa://sys:Sup3rSecret!@localhost:8563 local") === "/connect exa://sys:***@localhost:8563 local",
  );
  check("plain lines untouched", redact("what are my schemas") === "what are my schemas");
}

// ─── Multi-agent board (typed findings + shared digest). ─────────────────────
console.log("\nturn board");
{
  const b = new TurnBoard();
  const t1 = b.begin("find revenue tables");
  b.complete(t1, true, [{ kind: "sql", purpose: "revenue by segment", sql: "SELECT ...", tested: true }], "found it");
  const d = b.digest();
  check("digest lists the task + tested sql", d.includes("[done]") && d.includes("✓tested"));
  check("findings are typed and retrievable", b.allFindings()[0]?.kind === "sql");
}

// ─── Semantic recall — hashed embeddings are deterministic + rank sensibly. ──
console.log("\nsemantic recall (offline hashed embeddings)");
{
  const { embed, cosine } = await import("../src/embed.ts");
  const [a, b, c] = await embed([
    "revenue by market segment from orders",
    "total sales grouped by customer segment",
    "average daily temperature per city",
  ]);
  check("embedding is deterministic", (await embed(["x"]))[0].join(",") === (await embed(["x"]))[0].join(","));
  check("self-similarity is 1", Math.abs(cosine(a, a) - 1) < 1e-6);
  check("related > unrelated", cosine(a, b) > cosine(a, c), `rev/sales=${cosine(a, b).toFixed(3)} rev/weather=${cosine(a, c).toFixed(3)}`);
}

// ─── LightRAG-style hybrid doc retrieval — dense catches a paraphrase. ───────
console.log("\nhybrid document retrieval");
{
  const { DocumentStore } = await import("../src/documents.ts");
  const ds = new DocumentStore();
  ds.add("s", "notes.md", "text/markdown",
    "# Earnings\nQuarterly revenue and profit figures for the fiscal year.\n\n# Weather\nDaily rainfall and temperature readings by station.\n\n# Staffing\nHeadcount and hiring plans across departments.");
  // "income" appears in NO chunk verbatim — only dense embedding links it to
  // the revenue/profit chunk. Keyword-only would miss or mis-rank it.
  const hits = await ds.hybrid("s", "income and earnings", 1);
  check("hybrid returns a chunk", hits.length === 1);
  check("hybrid picks the earnings section", (hits[0]?.heading ?? "").toLowerCase().includes("earnings"),
    `got: ${hits[0]?.heading}`);
}

// ─── Semantic skill auto-activation (jcode: embedding hit → load skill). ─────
console.log("\nskill auto-activation");
{
  const { SkillStore } = await import("../src/skills.ts");
  const { mkdtempSync } = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = mkdtempSync(path.join(os.tmpdir(), "exa-skills-"));
  const store = new SkillStore(dir);
  store.save("chart-builder", "Build charts and dashboards from SQL results", "# charts\nMake dashboards.");
  store.save("email-parser", "Extract and validate email addresses from text", "# email\nParse emails.");
  const hit = await store.recall("make me a dashboard of revenue", 1);
  check("recall returns a skill", hit.length === 1);
  // Should surface a chart/dashboard skill (built-in dashboard-builder or ours),
  // never the unrelated email parser.
  check("recall picks a dashboard skill, not email", /dashboard|chart/.test(hit[0]?.name ?? "") && hit[0]?.name !== "email-parser", `got: ${hit[0]?.name}`);
}

// ─── Memory consolidation merges near-duplicate notes. ──────────────────────
console.log("\nmemory consolidation");
{
  const { MemoryStore } = await import("../src/memory.ts");
  const os = await import("node:os");
  const path = await import("node:path");
  const { mkdtempSync } = await import("node:fs");
  const dir = mkdtempSync(path.join(os.tmpdir(), "exa-mem-"));
  const mem = new MemoryStore(dir);
  mem.remember("project", null, "ORDERS joins CUSTOMER on the O_CUSTKEY column");
  mem.remember("project", null, "ORDERS joins CUSTOMER on O_CUSTKEY column key");
  mem.remember("project", null, "Currency for all amounts is EUR");
  const merged = await mem.consolidate(null);
  check("near-duplicate notes are merged", merged >= 1, `merged=${merged}`);
  const hits = await mem.recall(null, "how do orders relate to customers", 5);
  check("distinct facts survive consolidation", hits.some((h) => /EUR/.test(h.text)) && hits.some((h) => /CUSTKEY/i.test(h.text)));
}

// ─── Incident 2026-07-21: multi-file TPC-H upload imported one file and
// stopped; batch work must run as A2A tasks that ALL reach a terminal state. ──
{
  console.log("\nA2A task orchestration");
  const { TaskManager } = await import("../src/a2a.ts");

  // 1) drain waits for EVERY task — none left non-terminal, results ordered.
  const m1 = new TaskManager();
  const done: string[] = [];
  for (const name of ["customer", "orders", "lineitem", "nation"]) {
    m1.submit(name, async () => {
      await new Promise((r) => setTimeout(r, name === "customer" ? 30 : 5));
      done.push(name);
      return `${name}-ok`;
    });
  }
  const r1 = await m1.drain(2, () => {});
  check("drain waits for every task (all terminal)", r1.length === 4 && r1.every((t) => t.state === "completed"));
  check("slow tasks still complete (no early return)", done.includes("customer") && done.length === 4);

  // 2) one failing task never sinks the batch — others complete, failure isolated.
  const m2 = new TaskManager();
  m2.submit("good-1", async () => 1);
  m2.submit("bad", async () => { throw new Error("column overflow"); });
  m2.submit("good-2", async () => 2);
  const r2 = await m2.drain(4, () => {});
  check("a failed task is isolated", r2.filter((t) => t.state === "completed").length === 2 && r2.find((t) => t.title === "bad")?.state === "failed");
  check("failure carries the real error", /column overflow/.test(r2.find((t) => t.title === "bad")?.error ?? ""));

  // 3) concurrency is bounded — never more workers in flight than lanes.
  const m3 = new TaskManager();
  let inFlight = 0;
  let peak = 0;
  for (let i = 0; i < 10; i++) {
    m3.submit(`t${i}`, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return i;
    });
  }
  await m3.drain(3, () => {});
  check("concurrency stays within lanes", peak <= 3, `peak=${peak}`);

  // 4) lifecycle is observable while running (A2A tasks/get semantics):
  //    every task passes through working before terminal, and status
  //    progress lines surface through onUpdate.
  const m4 = new TaskManager();
  const states: string[] = [];
  m4.submit("import", async (report) => {
    report("500/3000 rows");
    report("3000/3000 rows");
    return "ok";
  });
  const statuses: string[] = [];
  await m4.drain(1, (t) => {
    states.push(t.state);
    if (t.status) statuses.push(t.status);
  });
  check("tasks pass through working → completed", states.includes("working") && states.at(-1) === "completed");
  check("progress polls stream through updates", statuses.includes("500/3000 rows") && statuses.includes("3000/3000 rows"));
}

console.log(`\n${pass} passed, ${fail} failed${fail ? `: ${failures.join("; ")}` : ""}`);
process.exit(fail ? 1 : 0);
