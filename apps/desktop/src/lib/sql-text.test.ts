/**
 * Edge-case tests for the editor's SQL text utilities.
 *
 * These were unreachable inside ExasolStudio.tsx until they were extracted.
 * `splitStatements` in particular must mirror the backend splitter
 * (query.rs::split_statements) — if the two disagree, "Run" sends something
 * different from what the server executes, which is a silent correctness bug.
 * The splitter cases here intentionally mirror the Rust test names.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  splitStatements,
  statementAtOffset,
  stripSqlComments,
  parseSingleTable,
  tabTitleFromSql,
  fmtClock,
  pickRunSql,
} from "./sql-text.ts";

describe("pickRunSql — every run mode / permutation", () => {
  const full = "SELECT 1;\nSELECT 2;\nSELECT 3";
  // offsets: cursor in "SELECT 2" ≈ 13, in "SELECT 1" ≈ 3.

  test("auto runs the selection when there is one", () => {
    assert.equal(pickRunSql("auto", full, "SELECT 2", 3), "SELECT 2");
    // whitespace-only selection is treated as no selection
    assert.equal(pickRunSql("auto", full, "   \n ", 3), "SELECT 1");
  });

  test("auto runs the statement at the cursor when nothing is selected", () => {
    assert.equal(pickRunSql("auto", full, "", 3), "SELECT 1");
    assert.equal(pickRunSql("auto", full, "", 13), "SELECT 2");
    assert.equal(pickRunSql("auto", full, "", 25), "SELECT 3");
  });

  test("selection runs the selection, else the whole buffer", () => {
    assert.equal(pickRunSql("selection", full, "SELECT 3", 0), "SELECT 3");
    assert.equal(pickRunSql("selection", full, "", 0), full);
    assert.equal(pickRunSql("selection", full, "  ", 0), full);
  });

  test("statement always runs the statement at the cursor (ignores selection)", () => {
    assert.equal(pickRunSql("statement", full, "SELECT 2", 3), "SELECT 1");
  });

  test("script and buffer run the whole buffer", () => {
    assert.equal(pickRunSql("script", full, "SELECT 2", 3), full);
    assert.equal(pickRunSql("buffer", full, "SELECT 2", 3), full);
  });
});

const texts = (sql: string) => splitStatements(sql).map((s) => s.text);

describe("splitStatements", () => {
  test("splits plain statements", () => {
    assert.deepEqual(texts("SELECT 1; SELECT 2"), ["SELECT 1", "SELECT 2"]);
  });

  test("empty and whitespace input yields nothing", () => {
    assert.deepEqual(texts(""), []);
    assert.deepEqual(texts("   \n\t "), []);
    assert.deepEqual(texts(";;;"), []);
  });

  test("trailing semicolon does not add an empty statement", () => {
    assert.deepEqual(texts("SELECT 1;"), ["SELECT 1"]);
    assert.deepEqual(texts("SELECT 1;  \n "), ["SELECT 1"]);
  });

  test("statement without a trailing semicolon is kept", () => {
    assert.deepEqual(texts("SELECT 1"), ["SELECT 1"]);
  });

  test("semicolon inside a single-quoted literal is not a split", () => {
    assert.deepEqual(texts("SELECT 'a;b' FROM t"), ["SELECT 'a;b' FROM t"]);
  });

  test("semicolon inside a quoted identifier is not a split", () => {
    assert.deepEqual(texts('SELECT "we;ird" FROM t'), ['SELECT "we;ird" FROM t']);
  });

  test("a quote inside the other quote style is literal text", () => {
    assert.deepEqual(texts(`SELECT 'it"s'; SELECT 2`), [`SELECT 'it"s'`, "SELECT 2"]);
    assert.deepEqual(texts(`SELECT "it's"; SELECT 2`), [`SELECT "it's"`, "SELECT 2"]);
  });

  test("semicolon inside a line comment is not a split", () => {
    assert.deepEqual(texts("SELECT 1 -- a; b\n; SELECT 2"), ["SELECT 1 -- a; b", "SELECT 2"]);
  });

  test("semicolon inside a block comment is not a split", () => {
    assert.deepEqual(texts("SELECT /* a; b */ 1; SELECT 2"), ["SELECT /* a; b */ 1", "SELECT 2"]);
  });

  test("unterminated literal swallows the rest rather than mis-splitting", () => {
    assert.deepEqual(texts("SELECT 'oops; SELECT 2"), ["SELECT 'oops; SELECT 2"]);
  });

  test("unterminated block comment swallows the rest", () => {
    assert.deepEqual(texts("SELECT 1 /* nope; SELECT 2"), ["SELECT 1 /* nope; SELECT 2"]);
  });

  test("offsets bracket the statement text in the original buffer", () => {
    const sql = "SELECT 1; SELECT 2";
    for (const s of splitStatements(sql)) {
      assert.equal(sql.slice(s.start, s.end).trim(), s.text);
    }
  });

  test("handles non-ASCII without mangling characters", () => {
    assert.deepEqual(texts("SELECT 'Grüße'; SELECT 'naïve'"), [
      "SELECT 'Grüße'",
      "SELECT 'naïve'",
    ]);
  });
});

describe("statementAtOffset", () => {
  const sql = "SELECT 1; SELECT 2; SELECT 3";

  test("returns the statement the cursor sits in", () => {
    assert.equal(statementAtOffset(sql, 3), "SELECT 1");
    assert.equal(statementAtOffset(sql, 13), "SELECT 2");
    assert.equal(statementAtOffset(sql, 25), "SELECT 3");
  });

  test("a cursor resting just after a semicolon still runs that statement", () => {
    // Offset 8 is the ';' of the first statement.
    assert.equal(statementAtOffset(sql, 8), "SELECT 1");
  });

  test("a cursor past the end returns the last statement", () => {
    assert.equal(statementAtOffset(sql, 9999), "SELECT 3");
  });

  test("a single unterminated statement is returned whole", () => {
    assert.equal(statementAtOffset("SELECT 1", 0), "SELECT 1");
  });

  test("empty or comment-only input falls back to the trimmed buffer", () => {
    assert.equal(statementAtOffset("", 0), "");
    assert.equal(statementAtOffset("   ", 1), "");
  });
});

describe("stripSqlComments", () => {
  test("removes line comments but keeps the newline", () => {
    assert.equal(stripSqlComments("SELECT 1 -- note\nFROM t"), "SELECT 1 \nFROM t");
  });

  test("removes block comments", () => {
    assert.equal(stripSqlComments("SELECT /* note */ 1"), "SELECT  1");
  });

  test("preserves comment-like text inside string literals", () => {
    assert.equal(stripSqlComments("SELECT '-- not a comment'"), "SELECT '-- not a comment'");
    assert.equal(stripSqlComments("SELECT '/* nope */'"), "SELECT '/* nope */'");
  });

  test("preserves comment-like text inside quoted identifiers", () => {
    assert.equal(stripSqlComments('SELECT "a--b"'), 'SELECT "a--b"');
  });

  test("an unterminated block comment removes the remainder", () => {
    assert.equal(stripSqlComments("SELECT 1 /* dangling"), "SELECT 1 ");
  });

  test("empty input is unchanged", () => {
    assert.equal(stripSqlComments(""), "");
  });
});

describe("parseSingleTable", () => {
  test("detects a bare single-table select", () => {
    assert.deepEqual(parseSingleTable("SELECT * FROM CUSTOMERS"), { table: "CUSTOMERS" });
  });

  test("detects a schema-qualified table", () => {
    assert.deepEqual(parseSingleTable("SELECT * FROM MART.CUSTOMERS"), {
      schema: "MART",
      table: "CUSTOMERS",
    });
  });

  test("handles multi-line builder SQL", () => {
    // Regression guard: the old single-space " from " probe missed this, so
    // query-builder results were not editable while one-liners were.
    assert.deepEqual(parseSingleTable("SELECT *\nFROM  MART.ORDERS\n"), {
      schema: "MART",
      table: "ORDERS",
    });
  });

  test("strips quotes from identifiers", () => {
    assert.deepEqual(parseSingleTable('SELECT * FROM "mart"."orders"'), {
      schema: "mart",
      table: "orders",
    });
  });

  test("tolerates a trailing semicolon", () => {
    assert.deepEqual(parseSingleTable("SELECT * FROM T;"), { table: "T" });
  });

  test("is case-insensitive on the keywords", () => {
    assert.deepEqual(parseSingleTable("select * from t"), { table: "t" });
  });

  test("rejects anything that is not a plain single-table read", () => {
    for (const sql of [
      "SELECT a FROM t JOIN u ON t.id = u.id",
      "SELECT a FROM t GROUP BY a",
      "SELECT a FROM t UNION SELECT b FROM u",
      "SELECT a FROM t HAVING a > 1",
      "SELECT DISTINCT a FROM t",
      "INSERT INTO t VALUES (1)",
      "UPDATE t SET a = 1",
      "WITH x AS (SELECT 1) SELECT * FROM x",
    ]) {
      assert.equal(parseSingleTable(sql), null, `must reject: ${sql}`);
    }
  });

  test("rejects an aggregate or function in the projection", () => {
    assert.equal(parseSingleTable("SELECT COUNT(*) FROM t"), null);
    assert.equal(parseSingleTable("SELECT UPPER(a) FROM t"), null);
  });

  test("rejects a select with no FROM", () => {
    assert.equal(parseSingleTable("SELECT 1"), null);
  });

  test("handles empty input", () => {
    assert.equal(parseSingleTable(""), null);
    assert.equal(parseSingleTable("   "), null);
  });
});

describe("tabTitleFromSql", () => {
  test("names the tab after the table", () => {
    assert.equal(tabTitleFromSql("SELECT * FROM WEATHER_DAILY"), "WEATHER_DAILY");
    assert.equal(tabTitleFromSql("SELECT * FROM MART.ORDERS"), "ORDERS");
  });

  test("falls back to Untitled for anything ambiguous", () => {
    assert.equal(tabTitleFromSql(""), "Untitled");
    assert.equal(tabTitleFromSql("SELECT COUNT(*) FROM t"), "Untitled");
    assert.equal(tabTitleFromSql("not sql at all"), "Untitled");
  });
});

describe("fmtClock", () => {
  test("formats a timestamp as 24-hour wall-clock time", () => {
    // Locale-dependent separators, so assert the shape rather than the string.
    assert.match(fmtClock(Date.UTC(2024, 0, 1, 13, 45, 30)), /\d{1,2}\D\d{2}\D\d{2}/);
  });

  test("does not use a 12-hour suffix", () => {
    const s = fmtClock(Date.UTC(2024, 0, 1, 13, 45, 30));
    assert.ok(!/AM|PM/i.test(s), `expected 24-hour output, got ${s}`);
  });
});
