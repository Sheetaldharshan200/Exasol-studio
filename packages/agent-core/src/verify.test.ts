import assert from "node:assert/strict";
import { test } from "node:test";
import { compareResults, planVerification, type SqlRun } from "./verify.ts";

const run = (sql: string, over: Partial<SqlRun> = {}): SqlRun => ({
  sql,
  columns: ["N"],
  rows: [[1]],
  rowCount: 1,
  truncated: false,
  ...over,
});

test("plans the LAST result-bearing read of the turn", () => {
  const plan = planVerification([
    run("SELECT COUNT(*) FROM S.EXPLORE"),
    run("CREATE TABLE S.T (X INT)"),
    run("SELECT SUM(AMOUNT) FROM S.ORDERS", { columns: ["S"], rows: [[42.5]] }),
  ]);
  assert.ok(plan);
  assert.equal(plan.sql, "SELECT SUM(AMOUNT) FROM S.ORDERS");
  assert.equal(plan.mode, "full");
});

test("write-only turns and empty turns plan nothing", () => {
  assert.equal(planVerification([]), null);
  assert.equal(planVerification([run("INSERT INTO S.T VALUES (1)"), run("DROP TABLE S.T")]), null);
});

test("non-deterministic SQL is never verified", () => {
  assert.equal(planVerification([run("SELECT RANDOM(1, 10) FROM DUAL")]), null);
  assert.equal(planVerification([run("SELECT CURRENT_TIMESTAMP")]), null);
  assert.equal(planVerification([run("SELECT NOW()")]), null);
  // ...but column names CONTAINING such words are fine.
  const plan = planVerification([run("SELECT RANDOM_SEED_COL FROM S.T")]);
  assert.ok(plan);
});

test("truncated results downgrade to count-compare", () => {
  const plan = planVerification([run("SELECT * FROM S.BIG", { truncated: true, rowCount: 120_000 })]);
  assert.ok(plan);
  assert.equal(plan.mode, "count");
  const ok = compareResults(plan, run("SELECT * FROM S.BIG", { truncated: true, rowCount: 120_000 }));
  assert.equal(ok.status, "verified");
  const bad = compareResults(plan, run("SELECT * FROM S.BIG", { truncated: true, rowCount: 119_999 }));
  assert.equal(bad.status, "mismatch");
});

test("value compare is order-insensitive and float-tolerant", () => {
  const plan = planVerification([
    run("SELECT REGION, SUM(V) FROM S.T GROUP BY REGION", {
      columns: ["REGION", "S"],
      rows: [
        ["north", 1.0000000001],
        ["south", 2],
      ],
      rowCount: 2,
    }),
  ]);
  assert.ok(plan);
  // Same rows, different order, float within tolerance.
  const actual = run("…", {
    columns: ["REGION", "S"],
    rows: [
      ["south", 2],
      ["north", 1.0000000002],
    ],
    rowCount: 2,
  });
  assert.equal(compareResults(plan, actual).status, "verified");
});

test("DECIMAL strings canonicalize losslessly; types never cross-coerce", () => {
  // Driver-returned DECIMAL strings: "2.50" and "2.5" are the same value,
  // "007" and "7" too — canonicalized textually, no float round-trip.
  const plan = planVerification([run("SELECT D FROM S.T", { rows: [["2.50"], ["007"]], rowCount: 2 })]);
  assert.ok(plan);
  assert.equal(compareResults(plan, run("…", { rows: [["2.5"], ["7"]], rowCount: 2 })).status, "verified");
  // Values beyond 2^53 must not lose precision.
  const big = planVerification([run("SELECT B FROM S.T", { rows: [["9007199254740993"]] })]);
  assert.ok(big);
  assert.equal(compareResults(big, run("…", { rows: [["9007199254740993"]] })).status, "verified");
  assert.equal(compareResults(big, run("…", { rows: [["9007199254740992"]] })).status, "mismatch");
  // Type drift IS a mismatch: VARCHAR "1" never equals numeric 1.
  const typed = planVerification([run("SELECT X FROM S.T", { rows: [["1"]] })]);
  assert.ok(typed);
  assert.equal(compareResults(typed, run("…", { rows: [[1]] })).status, "mismatch");
});

test("real differences are mismatches with honest detail", () => {
  const plan = planVerification([run("SELECT COUNT(*) FROM S.T", { rows: [[1204]], rowCount: 1 })]);
  assert.ok(plan);
  const value = compareResults(plan, run("…", { rows: [[1198]], rowCount: 1 }));
  assert.equal(value.status, "mismatch");
  assert.match(value.detail, /differ/i);
  const count = compareResults(plan, run("…", { rows: [[1204]], rowCount: 2, columns: ["N"] }));
  assert.equal(count.status, "mismatch");
  assert.match(count.detail, /Row counts differ/);
  const cols = compareResults(plan, run("…", { columns: ["OTHER"], rows: [[1204]], rowCount: 1 }));
  assert.equal(cols.status, "mismatch");
  assert.match(cols.detail, /Columns differ/);
});

test("nulls never equal zero or empty strings", () => {
  const plan = planVerification([run("SELECT X FROM S.T", { rows: [[null]] })]);
  assert.ok(plan);
  assert.equal(compareResults(plan, run("…", { rows: [[0]] })).status, "mismatch");
  assert.equal(compareResults(plan, run("…", { rows: [[""]] })).status, "mismatch");
  assert.equal(compareResults(plan, run("…", { rows: [[null]] })).status, "verified");
});
