import assert from "node:assert/strict";
import { test } from "node:test";
import { dbaSql, LOCKS_SQL, RUNNING_SQL } from "./dba-sql.ts";

test("kills take only the digits of a session id", () => {
  assert.equal(dbaSql.killStatement("1879392066563801088"), "KILL STATEMENT IN SESSION 1879392066563801088");
  assert.equal(dbaSql.killStatement("12; DROP TABLE t"), "KILL STATEMENT IN SESSION 12");
  assert.equal(dbaSql.killSession("4"), "KILL SESSION 4");
});

test("monitoring reads running statements and waiting conflicts", () => {
  assert.match(RUNNING_SQL, /STATUS NOT IN \('IDLE', 'DISCONNECTED'\)/, "prepared and batch statements count too");
  assert.match(RUNNING_SQL, /SESSION_ID <> CURRENT_SESSION/, "the monitor's own query is not listed");
  assert.match(LOCKS_SQL, /EXA_STATISTICS\.EXA_DBA_TRANSACTION_CONFLICTS/);
  assert.match(LOCKS_SQL, /STOP_TIME IS NULL/);
});
