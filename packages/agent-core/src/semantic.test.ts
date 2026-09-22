import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySemanticImpact, formatIssues, mergeImpact, uncoveredSchemas } from "./semantic.ts";

test("schema-impact statements: DDL that can break bindings", () => {
  assert.equal(classifySemanticImpact("CREATE TABLE S.T (X INT)"), "schema");
  assert.equal(classifySemanticImpact("  alter table s.t drop column x"), "schema");
  assert.equal(classifySemanticImpact("DROP SCHEMA STAGING CASCADE"), "schema");
  assert.equal(classifySemanticImpact("RENAME TABLE A TO B"), "schema");
});

test("data-impact statements: loads and mutations", () => {
  assert.equal(classifySemanticImpact("INSERT INTO S.T VALUES (1)"), "data");
  assert.equal(classifySemanticImpact("IMPORT INTO S.T FROM LOCAL CSV FILE 'x.csv'"), "data");
  assert.equal(classifySemanticImpact("MERGE INTO S.T USING U ON 1=1 WHEN MATCHED THEN UPDATE SET X=1"), "data");
  assert.equal(classifySemanticImpact("TRUNCATE TABLE S.T"), "data");
  assert.equal(classifySemanticImpact("update s.t set x = 2"), "data");
  assert.equal(classifySemanticImpact("DELETE FROM S.T"), "data");
});

test("no impact: reads and the sync's OWN script calls (no self-trigger)", () => {
  assert.equal(classifySemanticImpact("SELECT * FROM S.T"), "none");
  assert.equal(classifySemanticImpact("WITH x AS (SELECT 1) SELECT * FROM x"), "none");
  assert.equal(classifySemanticImpact("EXECUTE SCRIPT SEMANTIC_ADMIN.VALIDATE_MODEL('m')"), "none");
  assert.equal(classifySemanticImpact("EXECUTE SCRIPT SEMANTIC_ADMIN.REFRESH_SEMANTIC_SURFACE('m')"), "none");
  assert.equal(classifySemanticImpact("DESCRIBE S.T"), "none");
});

test("OTHER scripts are schema-impacting: Lua can run DDL, and drafting a model should trigger a pass", () => {
  assert.equal(classifySemanticImpact("EXECUTE SCRIPT MY_SCHEMA.LOAD_EVERYTHING('x')"), "schema");
  assert.equal(classifySemanticImpact("EXECUTE SCRIPT SEMANTIC_ADMIN.CALL_ADMIN_JSON('CREATE_MODEL', '{}')"), "schema");
  assert.equal(classifySemanticImpact("execute script semantic_admin.validate_model('m')"), "none");
});

test("a CREATE inside a string does not classify (prefix match only)", () => {
  assert.equal(classifySemanticImpact("SELECT 'CREATE TABLE X' FROM DUAL"), "none");
});

test("leading comments do not hide the verb", () => {
  assert.equal(classifySemanticImpact("-- staging load\nIMPORT INTO S.T FROM LOCAL CSV FILE 'x'"), "data");
  assert.equal(classifySemanticImpact("/* migration 42 */ ALTER TABLE S.T ADD COLUMN Y INT"), "schema");
  assert.equal(classifySemanticImpact("/* note */\n-- more\n  DROP TABLE S.T"), "schema");
  assert.equal(classifySemanticImpact("-- just a comment"), "none");
});

test("mergeImpact: schema dominates, data beats none", () => {
  assert.equal(mergeImpact("none", "data"), "data");
  assert.equal(mergeImpact("data", "schema"), "schema");
  assert.equal(mergeImpact("schema", "data"), "schema");
  assert.equal(mergeImpact("none", "none"), "none");
});

test("uncoveredSchemas: new datasets surface, bound and internal schemas never do", () => {
  const all = ["MART", "TPCH", "newdata", "SYS_SEMANTIC", "SEMANTIC_ADMIN", "EXA_STATISTICS", "STUDIO_EVALS", "EVAL_FIXTURE", "DAG_SMOKE", "ITEST_DAG", "SYS"];
  // bound includes the model's published schema (excluded by NAME, not prefix)
  const bound = ["mart"];
  assert.deepEqual(uncoveredSchemas(all, bound), ["TPCH", "newdata"]);
  assert.deepEqual(uncoveredSchemas([], []), []);
  assert.deepEqual(uncoveredSchemas(["MART"], ["MART"]), []);
  // a user schema merely STARTING with SYS is not internal
  assert.deepEqual(uncoveredSchemas(["SYSTEM_DATA"], []), ["SYSTEM_DATA"]);
  // quoted case-sensitive schemas keep their exact catalog casing
  assert.deepEqual(uncoveredSchemas(["myData"], []), ["myData"]);
  // ...and match bindings case-insensitively (unquoted identifiers fold)
  assert.deepEqual(uncoveredSchemas(["MYDATA"], ["mydata"]), []);
  // a published schema named SEMANTIC_SALES is excluded via the bound list
  assert.deepEqual(uncoveredSchemas(["SEMANTIC_SALES"], ["SEMANTIC_SALES"]), []);
  // but a user dataset that HAPPENS to start with SEMANTIC_ still surfaces
  assert.deepEqual(uncoveredSchemas(["SEMANTIC_NOTES"], []), ["SEMANTIC_NOTES"]);
});

test("formatIssues caps, ranks errors first, truncates long messages", () => {
  const rows = [
    { model: "sales", severity: "WARNING", rule: "W1", message: "minor drift" },
    { model: "sales", severity: "ERROR", rule: "E1", message: "column ORDERS.AMOUNT is gone" },
    { model: "mart", severity: "INFO", rule: "I1", message: "x".repeat(500) },
  ];
  const out = formatIssues(rows, 2);
  assert.equal(out.length, 2);
  assert.match(out[0], /^sales \[ERROR\] E1/);
  assert.match(out[1], /^sales \[WARNING\]/);
  assert.ok(formatIssues(rows, 5)[2].length <= 200);
  assert.deepEqual(formatIssues([]), []);
});
