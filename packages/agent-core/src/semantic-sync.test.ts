import { test } from "node:test";
import assert from "node:assert/strict";
import { SemanticSync } from "./semantic-sync.ts";
import type { SemanticSyncResult } from "./semantic.ts";

type Row = unknown[];
const out = (rows: Row[]) => ({ columns: [], rows, rowCount: rows.length, truncated: false });

/** Scriptable framework: models + per-script failures, records every call. */
function fakeDb(opts: { installed?: boolean; models?: [string, string][]; failValidate?: string[]; issues?: Row[] } = {}) {
  const calls: string[] = [];
  return {
    calls,
    db: {
      queryIsolated: async (_id: string, sql: string) => {
        calls.push(sql);
        if (sql.includes("EXA_ALL_TABLES")) return out([[opts.installed === false ? 0 : 1]]);
        if (sql.includes("FROM SYS_SEMANTIC.MODELS")) return out(opts.models ?? []);
        if (sql.includes("VALIDATE_MODEL")) {
          const failing = (opts.failValidate ?? []).find((m) => sql.includes(`'${m}'`));
          if (failing) throw new Error(`validation blew up for ${failing}`);
          return out([["OK"]]);
        }
        if (sql.includes("REFRESH_SEMANTIC_SURFACE")) return out([["PUBLISHED"]]);
        if (sql.includes("CURRENT_VALIDATION_ISSUES")) return out(opts.issues ?? []);
        throw new Error(`unexpected sql: ${sql}`);
      },
    },
  };
}

function collect(): { results: SemanticSyncResult[]; onResult: (r: SemanticSyncResult) => void } {
  const results: SemanticSyncResult[] = [];
  return { results, onResult: (r) => results.push(r) };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("a burst of writes coalesces into ONE pass; schema impact wins and refreshes only PUBLISHED models", async () => {
  const { db, calls } = fakeDb({ models: [["sales", "PUBLISHED"], ["draft_model", "DRAFT"]] });
  const { results, onResult } = collect();
  const sync = new SemanticSync(db, onResult, { debounceMs: 20 });
  // an import burst plus one DDL — one pass, impact "schema"
  sync.noteWrite("c1", "INSERT INTO S.T VALUES (1)");
  sync.noteWrite("c1", "CREATE TABLE S.NEW (X INT)");
  sync.noteWrite("c1", "INSERT INTO S.T VALUES (2)");
  await wait(120);
  assert.equal(results.length, 1);
  assert.equal(results[0].impact, "schema");
  assert.deepEqual(
    results[0].models.map((m) => ({ name: m.name, refreshed: m.refreshed ?? null })),
    [
      { name: "sales", refreshed: true },
      { name: "draft_model", refreshed: null }, // drafts are NEVER auto-published
    ],
  );
  assert.equal(calls.filter((c) => c.includes("VALIDATE_MODEL")).length, 2);
  assert.equal(calls.filter((c) => c.includes("REFRESH_SEMANTIC_SURFACE")).length, 1);
  assert.ok(calls.some((c) => c.includes("VALIDATE_MODEL('sales')")));
});

test("data-only writes validate but never touch the published surface", async () => {
  const { db, calls } = fakeDb({ models: [["sales", "PUBLISHED"]] });
  const { results, onResult } = collect();
  const sync = new SemanticSync(db, onResult, { debounceMs: 20 });
  sync.noteWrite("c1", "IMPORT INTO S.T FROM LOCAL CSV FILE 'x.csv'");
  await wait(100);
  assert.equal(results.length, 1);
  assert.equal(results[0].impact, "data");
  assert.equal(calls.filter((c) => c.includes("REFRESH_SEMANTIC_SURFACE")).length, 0);
});

test("no framework installed → silent no-op after ONE cheap probe", async () => {
  const { db, calls } = fakeDb({ installed: false });
  const { results, onResult } = collect();
  const sync = new SemanticSync(db, onResult, { debounceMs: 20 });
  sync.noteWrite("c1", "CREATE TABLE S.T (X INT)");
  await wait(100);
  assert.equal(results.length, 0);
  assert.equal(calls.length, 1);
});

test("reads never schedule anything", async () => {
  const { db, calls } = fakeDb({ models: [["sales", "PUBLISHED"]] });
  const { onResult } = collect();
  const sync = new SemanticSync(db, onResult, { debounceMs: 20 });
  sync.noteWrite("c1", "SELECT * FROM S.T");
  sync.noteWrite("c1", "EXECUTE SCRIPT SEMANTIC_ADMIN.VALIDATE_MODEL('sales')"); // no self-trigger
  await wait(80);
  assert.equal(calls.length, 0);
});

test("a failing validation is reported per model and blocks that model's refresh", async () => {
  const { db } = fakeDb({ models: [["sales", "PUBLISHED"], ["mart", "PUBLISHED"]], failValidate: ["sales"] });
  const { results, onResult } = collect();
  const sync = new SemanticSync(db, onResult, { debounceMs: 20 });
  sync.noteWrite("c1", "ALTER TABLE ORDERS DROP COLUMN X");
  await wait(120);
  const sales = results[0].models.find((m) => m.name === "sales")!;
  const mart = results[0].models.find((m) => m.name === "mart")!;
  assert.equal(sales.validated, false);
  assert.match(sales.error ?? "", /blew up/);
  assert.equal(sales.refreshed, undefined);
  assert.equal(mart.validated, true);
  assert.equal(mart.refreshed, true);
});

test("validation issues are collected, capped, and errors ranked first", async () => {
  const issues: Row[] = [
    ["sales", "WARNING", "W1", "drift"],
    ["sales", "ERROR", "E1", "ORDERS.AMOUNT missing"],
  ];
  const { db } = fakeDb({ models: [["sales", "PUBLISHED"]], issues });
  const { results, onResult } = collect();
  const sync = new SemanticSync(db, onResult, { debounceMs: 20 });
  sync.noteWrite("c1", "ALTER TABLE ORDERS DROP COLUMN AMOUNT");
  await wait(100);
  assert.equal(results[0].issueCount, 2);
  assert.match(results[0].issues[0], /\[ERROR\] E1/);
});

test("connect-time pass is VALIDATE-ONLY — no republish without a proven schema change", async () => {
  const { db, calls } = fakeDb({ models: [["sales", "PUBLISHED"]] });
  const { results, onResult } = collect();
  const sync = new SemanticSync(db, onResult, { debounceMs: 20 });
  sync.noteConnect("c1");
  await wait(100);
  assert.equal(results.length, 1);
  assert.equal(results[0].impact, "data");
  assert.equal(calls.filter((c) => c.includes("REFRESH_SEMANTIC_SURFACE")).length, 0);
  assert.equal(calls.filter((c) => c.includes("VALIDATE_MODEL")).length, 1);
});

test("connections are independent: each gets its own pass", async () => {
  const { db } = fakeDb({ models: [["sales", "PUBLISHED"]] });
  const { results, onResult } = collect();
  const sync = new SemanticSync(db, onResult, { debounceMs: 20 });
  sync.noteWrite("c1", "CREATE TABLE A.T (X INT)");
  sync.noteWrite("c2", "CREATE TABLE B.T (X INT)");
  await wait(120);
  assert.deepEqual(results.map((r) => r.connectionId).sort(), ["c1", "c2"]);
});
