import assert from "node:assert/strict";
import { test } from "node:test";
import { describeTabForContext } from "./tab-context.ts";

const tab = (over: Partial<{ view: string; title: string; sql: string; execError: string | null }>) =>
  ({ id: "tab-1", view: "sql", title: "Query 1", sql: "SELECT 1", execError: null, ...over }) as never;

test("sql tab carries the SQL and the last error", () => {
  const ctx = describeTabForContext(tab({ sql: "SELECT * FROM t", execError: "object T not found" }));
  assert.equal(ctx.view, "sql");
  assert.ok(ctx.body.includes("SELECT * FROM t"));
  assert.ok(ctx.body.includes("object T not found"));
  assert.ok(describeTabForContext(tab({ sql: "  " })).body.includes("-- (empty)"));
});

test("notebook tab numbers cells and truncates long sources", () => {
  const nb = {
    id: "n1",
    title: "Sales notebook",
    cells: [
      { type: "markdown", src: "# Intro" },
      { type: "sql", src: "SELECT 1", chart: "bar" },
      { type: "sql", src: "x".repeat(3000) },
    ],
  };
  const ctx = describeTabForContext(tab({ view: "notebook", title: "Notebook" }), nb);
  assert.equal(ctx.title, "Sales notebook");
  assert.ok(ctx.body.includes("Cell 1 (markdown)"));
  assert.ok(ctx.body.includes("Cell 2 (sql, chart: bar)"));
  assert.ok(ctx.body.includes("…(truncated)"));
});

test("notebook cell cap reports the overflow", () => {
  const nb = { id: "n", title: "Big", cells: Array.from({ length: 35 }, (_, i) => ({ type: "sql", src: `SELECT ${i}` })) };
  const ctx = describeTabForContext(tab({ view: "notebook" }), nb);
  assert.ok(ctx.body.includes("Cell 30"));
  assert.ok(!ctx.body.includes("Cell 31"));
  assert.ok(ctx.body.includes("5 more cells"));
});

test("other dev tabs fall back to a title-only description", () => {
  assert.ok(describeTabForContext(tab({ view: "visualizer", title: "Visualizer" })).body.includes("Visualizer"));
  assert.ok(describeTabForContext(tab({ view: "git", title: "Source Control" })).body.includes("git repository"));
  const other = describeTabForContext(tab({ view: "guides", title: "Guides" }));
  assert.ok(other.body.includes("Guides"));
  assert.equal(other.view, "guides");
});
