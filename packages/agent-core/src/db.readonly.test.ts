import { test } from "node:test";
import assert from "node:assert/strict";
import { assertWritable } from "./db.ts";

test("the agent's writes refuse a read-only connection", () => {
  const base = { id: "c", name: "Reporting", host: "h", port: 8563, user: "u", password: "p" };
  assert.equal(assertWritable(base, "c").name, "Reporting");
  assert.throws(() => assertWritable({ ...base, readOnly: true }, "c"), /"Reporting" is read-only/);
  assert.throws(() => assertWritable(undefined, "missing"), /No connection "missing"/);
});
