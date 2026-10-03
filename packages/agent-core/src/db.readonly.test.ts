import { test } from "node:test";
import assert from "node:assert/strict";
import { assertReadable, assertWritable } from "./db.ts";

test("the agent's writes refuse a read-only connection", () => {
  const base = { id: "c", name: "Reporting", host: "h", port: 8563, user: "u", password: "p" };
  assert.equal(assertWritable(base, "c").name, "Reporting");
  assert.throws(() => assertWritable({ ...base, readOnly: true }, "c"), /"Reporting" is read-only/);
  assert.throws(() => assertWritable(undefined, "missing"), /No connection "missing"/);
});

test("the agent's reads take only reads on a read-only connection", () => {
  const ro = { id: "c", name: "Reporting", host: "h", port: 8563, user: "u", password: "p", readOnly: true };
  assert.equal(assertReadable(ro, "c", "SELECT * FROM t").name, "Reporting");
  assert.throws(() => assertReadable(ro, "c", "EXECUTE SCRIPT s.cleanup()"), /read-only/, "a script returning rows is still a script");
  assert.throws(() => assertReadable(ro, "c", "SELECT 1; DROP TABLE t"), /read-only/);
  assert.equal(assertReadable({ ...ro, readOnly: false }, "c", "EXECUTE SCRIPT s.x()").name, "Reporting");
});
