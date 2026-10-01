import assert from "node:assert/strict";
import { test } from "node:test";
import { IDLE_WARNING_MINUTES, idleWarning, pendingSummary, uncommittedLabel } from "./txn-state.ts";

const info = (over: Partial<Parameters<typeof uncommittedLabel>[0] & object>) => ({ sessionId: "1", schema: null, autocommit: false, changes: 0, recent: [], idleSeconds: 0, open: true, changeSeq: 0, ...over });

test("the badge shows only in manual mode with changes", () => {
  assert.equal(uncommittedLabel(info({ changes: 0 })), null);
  assert.equal(uncommittedLabel(info({ autocommit: true, changes: 3 })), null);
  assert.equal(uncommittedLabel(info({ changes: 1 })), "Uncommitted · 1 change");
  assert.equal(uncommittedLabel(info({ changes: 4 })), "Uncommitted · 4 changes");
  assert.equal(uncommittedLabel(null), null);
});

test("an idle transaction is called out after the threshold, never before, never without changes", () => {
  assert.equal(idleWarning(info({ changes: 2, idleSeconds: (IDLE_WARNING_MINUTES - 1) * 60 })), null);
  assert.match(idleWarning(info({ changes: 2, idleSeconds: IDLE_WARNING_MINUTES * 60 }))!, /2 uncommitted changes has been open for 30 minutes/);
  assert.equal(idleWarning(info({ changes: 0, idleSeconds: 99_999 })), null);
});

test("the close question names what would be lost", () => {
  assert.equal(pendingSummary([{ title: "Sales", changes: 1 }]), '"Sales" has 1 uncommitted change. Commit it, or roll back?');
  assert.equal(pendingSummary([{ title: "A", changes: 2 }, { title: "B", changes: 3 }]), "2 tabs have 5 uncommitted changes. Commit them, or roll back?");
});

test("only a script that only reads is re-run after a lost session", async () => {
  const { onlyReads, sessionWasLost } = await import("./txn-state.ts");
  assert.equal(onlyReads(["SELECT 1", "-- c\nWITH x AS (SELECT 1) SELECT * FROM x"]), true);
  assert.equal(onlyReads(["SELECT 1", "INSERT INTO t VALUES (1)"]), false, "a write may already have happened");
  assert.equal(onlyReads(["/* x */ UPDATE t SET a = 1"]), false);
  assert.equal(onlyReads([]), false);
  assert.equal(sessionWasLost("Connection reset. The session was lost; the next run opens a new session."), true);
  assert.equal(sessionWasLost("[42000] syntax error"), false);
});
