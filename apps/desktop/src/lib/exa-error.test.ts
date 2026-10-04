import assert from "node:assert/strict";
import { test } from "node:test";
import { errorHint, parseExaError } from "./exa-error.ts";

test("the sqlx form", () => {
  assert.deepEqual(parseExaError("error returned from database: Exasol error 42000: object NO_SUCH_T not found [line 1, column 15] (Session: 1878059520522518528)"), {
    code: "42000",
    message: "object NO_SUCH_T not found",
    line: 1,
    column: 15,
    session: "1878059520522518528",
  });
});

test("the exapump form, code at the end", () => {
  const e = parseExaError("Query execution failed: Protocol error: syntax error, unexpected UNSIGNED_INTEGER_ [line 1, column 7] (Session: 18) (SQL state: 42000)");
  assert.equal(e.code, "42000");
  assert.equal(e.message, "syntax error, unexpected UNSIGNED_INTEGER_");
  assert.deepEqual([e.line, e.column, e.session], [1, 7, "18"]);
});

test("the bracketed form", () => {
  const e = parseExaError("[22002] data exception - numeric value out of range");
  assert.equal(e.code, "22002");
  assert.equal(e.message, "data exception - numeric value out of range");
  assert.equal(e.line, null);
});

test("an error without any of the parts is kept as it is", () => {
  assert.deepEqual(parseExaError("  connection lost  "), { code: null, message: "connection lost", line: null, column: null, session: null });
  assert.equal(parseExaError("").message, "");
});

test("message text that only looks like a part stays", () => {
  assert.equal(parseExaError("Exasol error 42000: value [abc] invalid").message, "value [abc] invalid");
});

test("hints only for well-known causes", () => {
  assert.match(errorHint("40001")!, /Run the statement again/);
  assert.equal(errorHint("42000"), null);
  assert.equal(errorHint(null), null);
});
