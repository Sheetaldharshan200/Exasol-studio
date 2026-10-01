import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyScript, classifyStatement, dangerQuestion, editsQuestion, readOnlyRefusal } from "./sql-classify.ts";

const k = (s: string) => classifyStatement(s).kind;
const d = (s: string) => classifyStatement(s).danger;

test("reads, including session settings and transaction control", () => {
  for (const s of ["SELECT 1", "with q as (select 1) select * from q", "  -- note\nSELECT * FROM t", "DESCRIBE t", "OPEN SCHEMA s", "ALTER SESSION SET NLS_DATE_FORMAT='YYYY'", "COMMIT", "EXPLAIN VIRTUAL SELECT 1", "(SELECT 1)"]) {
    assert.equal(k(s), "read", s);
  }
});

test("writes, wherever they hide", () => {
  for (const s of ["INSERT INTO t VALUES (1)", "update t set a = 1 where b = 2", "CREATE TABLE x (a INT)", "ALTER TABLE t ADD c INT", "MERGE INTO t USING s ON (1=1) WHEN MATCHED THEN DELETE", "EXECUTE SCRIPT s.x()", "IMPORT INTO t FROM CSV AT 'x' FILE 'y'", "GRANT SELECT ON t TO u", "SELECT * INTO TABLE t2 FROM t", "/* hi */ DELETE FROM t WHERE 1=0"]) {
    assert.equal(k(s), "write", s);
  }
  assert.equal(k("SELECT 'INSERT INTO x' FROM t"), "read", "words inside strings do not count");
  assert.equal(k("EXPLAIN VIRTUAL INSERT INTO t SELECT * FROM v"), "read", "EXPLAIN does not run the statement");
  assert.equal(k('SELECT "INTO" FROM t'), "read", "nor in quoted names");
});

test("statements that destroy data in one go", () => {
  assert.equal(d("DROP TABLE t"), "drop");
  assert.equal(d("drop schema s cascade"), "drop");
  assert.equal(d("TRUNCATE TABLE t"), "truncate");
  assert.equal(d("DELETE FROM t"), "delete-all");
  assert.equal(d("DELETE * FROM t"), "delete-all");
  assert.equal(d("DELETE FROM t WHERE id = 1"), undefined);
  assert.equal(d("UPDATE t SET a = 1"), "update-all");
  assert.equal(d("UPDATE t SET a = (SELECT x FROM y WHERE z = 1)"), "update-all", "a WHERE inside a subquery is not the statement's");
  assert.equal(d("UPDATE t SET a = (SELECT 1) WHERE id = 3"), undefined);
  assert.equal(d("DELETE FROM t -- WHERE id = 1"), "delete-all", "a commented-out WHERE is no WHERE");
  assert.equal(d("SELECT 'DROP TABLE t'"), undefined);
  assert.equal(d("INSERT INTO t SELECT * FROM s"), undefined);
});

test("a script is classified statement by statement", () => {
  const c = classifyScript("SELECT 1; DELETE FROM t; ;  -- trailing\n");
  assert.deepEqual(c.map((s) => [s.kind, s.danger ?? null]), [["read", null], ["write", "delete-all"]]);
  assert.equal(classifyScript("").length, 0);
  assert.equal(classifyScript("SELECT 1; SELECT 2", false).length, 1, "unsplit is one statement");
});

test("the questions name what would happen", () => {
  const q = dangerQuestion(classifyScript("SELECT 1; DROP TABLE t; UPDATE u SET a = 1"), "Prod (Exasol)")!;
  assert.match(q, /^Run on Prod \(Exasol\)\?/);
  assert.match(q, /DROP TABLE t — drops an object/);
  assert.match(q, /updates every row/);
  assert.equal(dangerQuestion(classifyScript("SELECT 1"), "x"), null);
  assert.match(readOnlyRefusal(classifyScript("SELECT 1; INSERT INTO t VALUES (1)"), "Reporting")!, /"Reporting" is read-only.*INSERT INTO t/);
  assert.equal(readOnlyRefusal(classifyScript("SELECT 1"), "x"), null);
});

test("grid edits on Prod are counted in the question", () => {
  assert.equal(editsQuestion(1, "Sales (Prod)"), "Save 1 change to Sales (Prod)? This is a production database.");
  assert.match(editsQuestion(3, "x"), /^Save 3 changes/);
});
