import assert from "node:assert/strict";
import { test } from "node:test";
import { toolGerund, workingLabel, workingStatus } from "./work-label.ts";

test("database tools read as querying, whatever the server prefix", () => {
  assert.equal(toolGerund("run_sql"), "Querying the database");
  assert.equal(toolGerund("exasol-studio_sql_query"), "Querying the database");
  assert.equal(toolGerund("exasol_list_schemas"), "Querying the database");
});

test("file/shell/search/planning/web tools map to their gerunds", () => {
  assert.equal(toolGerund("bash"), "Running a command");
  assert.equal(toolGerund("read"), "Reading files");
  assert.equal(toolGerund("filesystem_read_file"), "Reading files");
  assert.equal(toolGerund("edit"), "Editing files");
  assert.equal(toolGerund("grep"), "Searching");
  assert.equal(toolGerund("todowrite"), "Planning");
  assert.equal(toolGerund("team_spawn"), "Planning");
  assert.equal(toolGerund("webfetch"), "Browsing the web");
  assert.equal(toolGerund("question"), "Asking you");
  assert.equal(toolGerund("mystery_tool"), "Working");
});

test("workingLabel routes reasoning vs tool vs unknown", () => {
  assert.equal(workingLabel("reasoning"), "Thinking");
  assert.equal(workingLabel("tool-call", "bash"), "Running a command");
  assert.equal(workingLabel(null), "Working");
});

test("workingStatus adds elapsed seconds only once meaningful", () => {
  assert.equal(workingStatus("Thinking", 0), "Thinking…");
  assert.equal(workingStatus("Thinking", 2.9), "Thinking…");
  assert.equal(workingStatus("Querying the database", 12.6), "Querying the database… · 12s");
});
