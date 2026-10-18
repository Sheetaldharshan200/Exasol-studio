import assert from "node:assert/strict";
import { test } from "node:test";
import { withConnDefaults } from "./conn-settings.ts";
import { guardDecision, installRunGuard } from "./run-guard.ts";

const s = (safety: object) => withConnDefaults({ safety });

test("read-only refuses a write, and reads run", () => {
  assert.match(guardDecision(s({ readOnly: true }), "UPDATE t SET a = 1 WHERE b = 2", true, "Rep").refuse!, /read-only/);
  assert.deepEqual(guardDecision(s({ readOnly: true }), "SELECT 1", true, "Rep"), {});
});

test("Prod asks before destroying data; elsewhere only when set", () => {
  assert.match(guardDecision(s({ env: "prod" }), "DROP TABLE t", true, "Sales").ask!, /^Run on Sales \(Prod\)\?/);
  assert.deepEqual(guardDecision(s({ env: "dev" }), "DROP TABLE t", true, "Sales"), {});
  assert.match(guardDecision(s({ confirmDangerous: true }), "TRUNCATE TABLE t", true, "Sales").ask!, /^Run on Sales\?/);
  assert.deepEqual(guardDecision(s({ env: "prod" }), "DELETE FROM t WHERE id = 1", true, "Sales"), {});
});

test("the installed guard reads settings per run and throws on refuse or cancel", async () => {
  let guard: ((r: { profileId: string; connectionName: string; sql: string; split: boolean }) => Promise<void>) | null = null;
  const stored: Record<string, unknown> = { prod: { safety: { env: "prod" } }, ro: { safety: { readOnly: true } } };
  let answer = false;
  const remove = installRunGuard({ setRunGuard: (fn) => (guard = fn), settingsOf: async (id) => stored[id] ?? null, confirm: () => answer });
  const run = (profileId: string, sql: string) => guard!({ profileId, connectionName: "C", sql, split: true });
  await assert.rejects(run("prod", "DROP TABLE t"), (e: { message: string }) => /cancelled/.test(e.message));
  answer = true;
  await run("prod", "DROP TABLE t");
  await assert.rejects(run("ro", "INSERT INTO t VALUES (1)"), (e: { message: string }) => /read-only/.test(e.message));
  await run("other", "DROP TABLE t");
  remove();
  assert.equal(guard, null);
});
