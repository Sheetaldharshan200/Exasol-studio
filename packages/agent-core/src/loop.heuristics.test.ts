/**
 * Edge-case tests for the agent-turn routing heuristics in loop.ts.
 *
 * These three functions decide whether a turn gets re-attempted, continued, or
 * finalized. They are regex-based inferences about what a model MEANT, so their
 * failure modes are asymmetric and worth pinning down:
 *
 *   - a false positive on looksLikeUnacted/looksUnfinished burns a retry budget
 *     and re-prompts a model that was actually finished;
 *   - a false negative leaves the user with a half-done answer;
 *   - a false positive in extractReadSql would execute SQL scraped out of
 *     PROSE, so its write-statement and prose rejections are load-bearing.
 *
 * Each test names the behaviour rather than the regex, so the heuristics can be
 * rewritten (or replaced with something less brittle) without rewriting these.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { looksLikeUnacted, extractReadSql, looksUnfinished } from "./loop.ts";

describe("looksLikeUnacted", () => {
  test("ignores short or empty text", () => {
    assert.equal(looksLikeUnacted(""), false);
    assert.equal(looksLikeUnacted("too short"), false);
    // Just under the 20-char floor.
    assert.equal(looksLikeUnacted("x".repeat(19)), false);
  });

  test("flags hallucinated mechanisms outright", () => {
    assert.equal(looksLikeUnacted("I will use EXA_PUMP to load the file for you."), true);
    assert.equal(looksLikeUnacted("Reading from SYS.EXA_ATTACHED files now........"), true);
    assert.equal(looksLikeUnacted("Checking EXA_ATTACHED_FILES for your upload."), true);
  });

  test("flags a tool call emitted as text instead of invoked", () => {
    assert.equal(looksLikeUnacted('<tool_call>{"name":"run_sql"}</tool_call> ....'), true);
    assert.equal(looksLikeUnacted('Here you go: {"tool_calls": [{"x":1}]} ......'), true);
    assert.equal(looksLikeUnacted('[TOOL_REQUEST] run_sql please do the thing'), true);
    assert.equal(looksLikeUnacted('{"name":"list_schemas"} — running that now'), true);
  });

  test("does not flag a JSON object naming a tool we do not expose", () => {
    assert.equal(looksLikeUnacted('{"name":"some_other_tool"} is not one of ours at all'), false);
  });

  test("flags SQL paired with plan language — the model described instead of acting", () => {
    assert.equal(
      looksLikeUnacted("Here's my plan: I'll run SELECT * FROM CUSTOMERS to check the data."),
      true,
    );
    assert.equal(
      looksLikeUnacted("Step 1: create the table.\n```sql\nCREATE TABLE T (A INT)\n```"),
      true,
    );
    assert.equal(
      looksLikeUnacted("Let me check the schema first, then SELECT name FROM USERS."),
      true,
    );
  });

  test("does not flag SQL presented as a finished result", () => {
    // SQL with no planning language: the model is reporting, not promising.
    assert.equal(
      looksLikeUnacted("The query returned 42 rows.\n```sql\nSELECT * FROM T\n```"),
      false,
    );
  });

  test("does not flag plan language with no SQL", () => {
    assert.equal(looksLikeUnacted("Let's start by looking at what you uploaded, shall we?"), false);
  });
});

describe("extractReadSql", () => {
  test("returns null for empty or SQL-free text", () => {
    assert.equal(extractReadSql(""), null);
    assert.equal(extractReadSql("no sql here at all, just prose about databases"), null);
  });

  test("pulls a statement out of a fenced block", () => {
    assert.equal(
      extractReadSql("Here:\n```sql\nSELECT * FROM CUSTOMERS\n```"),
      "SELECT * FROM CUSTOMERS",
    );
  });

  test("pulls an unfenced statement that starts a line", () => {
    assert.equal(extractReadSql("SELECT id FROM USERS"), "SELECT id FROM USERS");
  });

  test("accepts a WITH clause", () => {
    assert.match(String(extractReadSql("WITH x AS (SELECT 1 FROM D) SELECT * FROM x")), /^WITH x AS/);
  });

  test("stops at the first semicolon", () => {
    assert.equal(extractReadSql("SELECT a FROM t; SELECT b FROM u"), "SELECT a FROM t");
  });

  test("stops at a blank line", () => {
    assert.equal(extractReadSql("SELECT a FROM t\n\nSome prose after."), "SELECT a FROM t");
  });

  test("rejects prose that merely contains the word select", () => {
    assert.equal(extractReadSql("You can select a table from the tree on the left side"), null);
  });

  test("rejects a SELECT with no FROM", () => {
    assert.equal(extractReadSql("SELECT 1 + 1 AS answer here"), null);
  });

  test("refuses every write statement — this guards against executing a mutation", () => {
    for (const w of [
      "INSERT INTO t VALUES (1)",
      "UPDATE t SET a = 1",
      "DELETE FROM t",
      "MERGE INTO t USING s ON (1=1)",
      "CREATE TABLE t (a INT)",
      "ALTER TABLE t ADD b INT",
      "DROP TABLE t",
      "TRUNCATE TABLE t",
      "GRANT SELECT ON t TO u",
      "REVOKE SELECT ON t FROM u",
    ]) {
      assert.equal(extractReadSql(w), null, `must reject: ${w}`);
    }
  });

  test("refuses a read with a write smuggled onto the same line", () => {
    assert.equal(extractReadSql("SELECT * FROM t WHERE x = 1 DROP TABLE t"), null);
  });

  test("a write on a LATER line is left behind, not returned", () => {
    // The match ends at the line break, so only the read is extracted and the
    // DELETE is never part of what would be executed.
    const got = extractReadSql("```sql\nSELECT a FROM t\nDELETE FROM t\n```");
    assert.equal(got, "SELECT a FROM t");
    assert.ok(!/DELETE/i.test(String(got)));
  });

  test("enforces the length bounds", () => {
    // Below the 12-char floor (11 chars).
    assert.equal(extractReadSql("SELECT*FROM"), null);
    // Above the 4000-char ceiling.
    assert.equal(extractReadSql(`SELECT ${"a".repeat(4100)} FROM t`), null);
    // Just inside the floor still works.
    assert.equal(extractReadSql("SELECT a FROM"), "SELECT a FROM");
  });

  test("is case-insensitive", () => {
    assert.equal(extractReadSql("select id from users"), "select id from users");
  });
});

describe("looksUnfinished", () => {
  test("empty text is not unfinished", () => {
    assert.equal(looksUnfinished(""), false);
  });

  test("detects a trailing promise to keep going", () => {
    assert.equal(looksUnfinished("Found the table. I'll now check the columns"), true);
    assert.equal(looksUnfinished("That worked. Moving on to the next schema"), true);
    assert.equal(looksUnfinished("OK. Next, I will query the fact table"), true);
    assert.equal(looksUnfinished("Good. Let's now proceed"), true);
  });

  test("a question is a legitimate stop, not an unfinished turn", () => {
    assert.equal(looksUnfinished("I'll now check the columns — which schema should I use?"), false);
  });

  test("does not flag a completed answer", () => {
    assert.equal(looksUnfinished("The table has 12 columns and 4,201 rows."), false);
    assert.equal(looksUnfinished("Done — the import finished successfully."), false);
  });

  test("only inspects the tail, so an early promise that was kept does not count", () => {
    const text = "I'll now check the columns. " + "The result is 12 columns. ".repeat(20);
    assert.equal(looksUnfinished(text), false);
  });

  test("is case-insensitive and tolerates a typographic apostrophe", () => {
    assert.equal(looksUnfinished("LET'S NOW PROCEED"), true);
    assert.equal(looksUnfinished("I’ll now check the data"), true);
  });
});
