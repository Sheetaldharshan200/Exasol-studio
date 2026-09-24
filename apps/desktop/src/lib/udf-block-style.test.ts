import assert from "node:assert/strict";
import { test } from "node:test";
import { udfBodyStart } from "./udf-block-style.ts";

const BLOCK = [
  "--/",
  "CREATE OR REPLACE LUA SCALAR SCRIPT MY_UDF (a DOUBLE)",
  "RETURNS DOUBLE AS",
  "function run(ctx)",
  "    return ctx.a",
  "end",
  "/",
];

test("the language's code starts after the line the header's AS ends on", () => {
  assert.equal(udfBodyStart(BLOCK), 3);
});

test("a one-line header is handled as readily as a wrapped one", () => {
  assert.equal(udfBodyStart(["--/", "CREATE LUA SCALAR SCRIPT F() RETURNS INT AS", "return 1", "/"]), 2);
});

test("a header still being typed has no body to frame yet", () => {
  assert.equal(udfBodyStart(["--/", "CREATE OR REPLACE LUA SCALAR SCRIPT F("]), null);
});

test("an AS inside a trailing comment does not open the body", () => {
  assert.equal(udfBodyStart(["--/", "CREATE LUA SCRIPT F() -- returns AS", "RETURNS INT AS", "x", "/"]), 3);
});


test("a dash inside a quoted identifier is not a comment", () => {
  // `--` inside the quoted name used to swallow the rest of the line, so the
  // header's AS went missing and the body was never found.
  assert.equal(udfBodyStart(["--/", 'CREATE LUA SCRIPT "load--daily" AS', "return 1", "/"]), 2);
  assert.equal(udfBodyStart(["--/", "CREATE LUA SCRIPT F('a--b') AS", "return 1", "/"]), 2);
});

test("a block comment after AS does not hide it", () => {
  assert.equal(udfBodyStart(["--/", "CREATE LUA SCRIPT F() AS /* the body follows */", "return 1", "/"]), 2);
});
