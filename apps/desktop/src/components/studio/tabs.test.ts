import assert from "node:assert/strict";
import { test } from "node:test";
import { adoptPendingTabs, newTab, tabHasWork, WELCOME_TAB, type SqlTab } from "./tabs.ts";

const sqlTab = (id: string, sql: string): SqlTab => ({ id, title: id, view: "sql", sql, response: null, execError: null });

test("a tab with a written query carries work", () => {
  assert.equal(tabHasWork(sqlTab("a", "SELECT * FROM T")), true);
});

test("an untouched tab does not", () => {
  assert.equal(tabHasWork(sqlTab("a", "")), false);
  assert.equal(tabHasWork(sqlTab("a", "   \n  ")), false);
  // The first tab's seeded example is not something the user wrote.
  assert.equal(tabHasWork(newTab(1)), false);
  assert.equal(tabHasWork(newTab(2)), false);
});

test("an edited starter tab does carry work", () => {
  const edited = { ...newTab(1), sql: `${newTab(1).sql}\nSELECT 2;` };
  assert.equal(tabHasWork(edited), true);
});

test("anything that is not a plain SQL tab is kept", () => {
  assert.equal(tabHasWork(WELCOME_TAB), true);
  assert.equal(tabHasWork({ ...sqlTab("n", ""), view: "notebook" } as SqlTab), true);
});

test("work drafted before connecting is carried onto the connection", () => {
  const drafted = [sqlTab("d1", "SELECT 1"), sqlTab("d2", "SELECT 2")];
  const adopted = adoptPendingTabs([], drafted);
  assert.deepEqual(adopted.map((t) => t.id), ["d1", "d2"]);
});

test("the connection's own tabs come first, the drafts after", () => {
  const adopted = adoptPendingTabs([sqlTab("own", "SELECT 9")], [sqlTab("d1", "SELECT 1")]);
  assert.deepEqual(adopted.map((t) => t.id), ["own", "d1"]);
});

test("untouched drafts are not piled on", () => {
  const adopted = adoptPendingTabs([], [sqlTab("empty", ""), sqlTab("real", "SELECT 1")]);
  assert.deepEqual(adopted.map((t) => t.id), ["real"]);
});

test("a tab already on the connection is never duplicated", () => {
  const same = sqlTab("d1", "SELECT 1");
  assert.deepEqual(adoptPendingTabs([same], [same]).map((t) => t.id), ["d1"]);
});

test("nothing drafted leaves the connection's tabs untouched", () => {
  const own = [sqlTab("own", "SELECT 9")];
  assert.deepEqual(adoptPendingTabs(own, []), own);
});

test("an id collision between DIFFERENT tabs re-ids rather than losing the SQL", () => {
  // Clock-derived ids can repeat across the two lists; dropping the pending
  // tab would throw away exactly the work adoption exists to rescue.
  const out = adoptPendingTabs([sqlTab("tab-100-1", "")], [sqlTab("tab-100-1", "SELECT 42")]);
  assert.deepEqual(out.map((t) => t.sql), ["", "SELECT 42"]);
  assert.equal(new Set(out.map((t) => t.id)).size, 2);
});
