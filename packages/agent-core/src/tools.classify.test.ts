/**
 * Edge-case tests for classifySql — the agent's SQL safety gate.
 *
 * This single function decides whether a statement the model wrote auto-runs
 * ("read") or is held for the user's explicit approval ("write"). A false
 * "read" executes a mutation without consent; a false "write" merely asks an
 * unnecessary question. So every ambiguous case below must land on "write" —
 * the failure mode has to be the annoying one, never the destructive one.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { classifySql } from "./tools.ts";

describe("classifySql — reads", () => {
  test("recognizes each read keyword", () => {
    for (const sql of [
      "SELECT 1 FROM t",
      "WITH x AS (SELECT 1) SELECT * FROM x",
      "SHOW SESSION",
      "DESC t",
      "DESCRIBE t",
      "VALUES (1)",
      "EXPLAIN SELECT * FROM t",
    ]) {
      assert.equal(classifySql(sql), "read", sql);
    }
  });

  test("is case-insensitive", () => {
    assert.equal(classifySql("select 1 from t"), "read");
    assert.equal(classifySql("Select 1"), "read");
  });

  test("ignores leading whitespace and line comments", () => {
    assert.equal(classifySql("   \n\t SELECT 1"), "read");
    assert.equal(classifySql("-- fetch rows\nSELECT 1"), "read");
    assert.equal(classifySql("-- a\n-- b\nSELECT 1"), "read");
  });

  test("ignores leading block comments, including Exasol hint-style", () => {
    assert.equal(classifySql("/* note */ SELECT 1"), "read");
    assert.equal(classifySql("/* multi\nline */ SELECT 1"), "read");
  });

  test("keyword followed directly by a parenthesis still classifies", () => {
    assert.equal(classifySql("SELECT(1)"), "read");
  });
});

describe("classifySql — writes and the fail-safe default", () => {
  test("classifies every mutation keyword as write", () => {
    for (const sql of [
      "INSERT INTO t VALUES (1)",
      "UPDATE t SET a = 1",
      "DELETE FROM t",
      "MERGE INTO t USING s ON (1=1)",
      "CREATE TABLE t (a INT)",
      "ALTER TABLE t ADD b INT",
      "DROP TABLE t",
      "TRUNCATE TABLE t",
      "GRANT SELECT ON t TO u",
      "IMPORT INTO t FROM CSV AT 'url'",
      "COMMIT",
      "ALTER SESSION SET QUERY_TIMEOUT = 1",
    ]) {
      assert.equal(classifySql(sql), "write", sql);
    }
  });

  test("anything unrecognizable defaults to write — approval, not execution", () => {
    assert.equal(classifySql(""), "write");
    assert.equal(classifySql("   "), "write");
    assert.equal(classifySql("garbage input"), "write");
    // A lone comment with no statement behind it must not auto-run.
    assert.equal(classifySql("-- just a comment"), "write");
    assert.equal(classifySql("/* only a comment */"), "write");
  });

  test("a parenthesized leading subquery is held for approval, not auto-run", () => {
    // The classifier reads the FIRST bare token; "(" hides it, and the safe
    // answer for anything it cannot see is "write".
    assert.equal(classifySql("(SELECT 1) UNION (SELECT 2)"), "write");
  });

  test("a read keyword later in the text does not rescue a write", () => {
    assert.equal(classifySql("DELETE FROM t WHERE id IN (SELECT id FROM u)"), "write");
  });

  test("comment tricks cannot smuggle a write past the gate", () => {
    assert.equal(classifySql("/* SELECT */ DROP TABLE t"), "write");
    assert.equal(classifySql("-- SELECT\nDROP TABLE t"), "write");
    // Comments do not nest in SQL; the non-greedy strip must leave DROP first.
    assert.equal(classifySql("/* /* */ DROP TABLE t"), "write");
  });

  test("EXPORT is a write — it moves data out of the database", () => {
    assert.equal(classifySql("EXPORT t INTO CSV AT 'url'"), "write");
  });

  test("SELECT INTO TABLE is Exasol's CTAS — it mutates and must not auto-run", () => {
    // Review finding (Critical): every SELECT was whitelisted, but
    // SELECT … INTO TABLE creates a table.
    assert.equal(classifySql("SELECT * INTO TABLE copied_t FROM source_t"), "write");
    assert.equal(classifySql("select c into table t2 from t1"), "write");
    assert.equal(classifySql("WITH x AS (SELECT 1) SELECT * INTO TABLE t FROM x"), "write");
  });

  test("a read-prefixed batch must not auto-run the statements behind it", () => {
    // Review finding (High): only the first token was examined.
    assert.equal(classifySql("SELECT 1; DROP TABLE t"), "write");
    assert.equal(classifySql("SELECT 1 FROM t;\nDELETE FROM t"), "write");
  });

  test("a single trailing semicolon does not demote a genuine read", () => {
    assert.equal(classifySql("SELECT 1 FROM t;"), "read");
    assert.equal(classifySql("SELECT 1 FROM t;   \n"), "read");
  });

  test("string contents can neither fake nor hide the gate's signals", () => {
    // "into"/";" INSIDE a literal is data, not a mutation — stays a read.
    assert.equal(classifySql("SELECT * FROM t WHERE note = 'put into box'"), "read");
    assert.equal(classifySql("SELECT 'a;b' FROM t"), "read");
    // A quoted identifier named INTO is also just data.
    assert.equal(classifySql('SELECT "INTO" FROM t'), "read");
    // An UNTERMINATED literal leaves its contents visible → fail closed.
    assert.equal(classifySql("SELECT 'oops; DROP TABLE t"), "write");
  });

  test("INTO must be a whole word — into_table is an ordinary identifier", () => {
    assert.equal(classifySql("SELECT * FROM into_table"), "read");
  });
});
