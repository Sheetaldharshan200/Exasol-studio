import assert from "node:assert/strict";
import { test } from "node:test";
import { closeQuestion, hasUnsavedChanges } from "./tab-close.ts";
import type { SqlTab } from "../components/studio/tabs.ts";

const tab = (over: Partial<SqlTab>): SqlTab => ({ id: "t", title: "Query", view: "sql", sql: "", response: null, execError: null, ...over }) as SqlTab;

test("a file-backed tab is unsaved only when it differs from its last save", () => {
  assert.equal(hasUnsavedChanges(tab({ filePath: "/w/a.sql", sql: "SELECT 1", savedSql: "SELECT 1" })), false);
  assert.equal(hasUnsavedChanges(tab({ filePath: "/w/a.sql", sql: "SELECT 2", savedSql: "SELECT 1" })), true);
  assert.equal(hasUnsavedChanges(tab({ filePath: "/w/a.sql", sql: "", savedSql: undefined })), false);
});

test("an untitled tab with written SQL is unsaved; an empty one is not; other views never are", () => {
  assert.equal(hasUnsavedChanges(tab({ sql: "SELECT * FROM sales" })), true);
  assert.equal(hasUnsavedChanges(tab({ sql: "   " })), false);
  assert.equal(hasUnsavedChanges(tab({ view: "visualizer" as SqlTab["view"], sql: "x" })), false);
});

test("the question names what would be lost, and nothing is asked when nothing would be", () => {
  assert.equal(closeQuestion([tab({ sql: "" })]), null);
  assert.equal(closeQuestion([tab({ title: "Sales", sql: "SELECT 1" })]), '"Sales" has unsaved changes. Close it and discard them?');
  const many = Array.from({ length: 7 }, (_, i) => tab({ id: `t${i}`, title: `Q${i}`, sql: "SELECT 1" }));
  assert.equal(closeQuestion(many), '7 tabs have unsaved changes: "Q0", "Q1", "Q2", "Q3", "Q4" and 2 more. Close them and discard the changes?');
});
