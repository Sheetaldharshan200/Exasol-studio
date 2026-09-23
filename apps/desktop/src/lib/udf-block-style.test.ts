import assert from "node:assert/strict";
import { test } from "node:test";
import { udfBodyStart, udfCellHeading, udfLineClasses, udfLineRole } from "./udf-block-style.ts";








test("rounding closes the card at top and bottom only", () => {
  assert.equal(udfLineClasses({ first: false, last: false }), "exa-udf-block");
  assert.match(udfLineClasses({ first: true, last: true }), /exa-udf-open exa-udf-close/);
});

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

test("every line of a block knows which cell it is in", () => {
  const last = BLOCK.length - 1;
  const bodyStart = udfBodyStart(BLOCK);
  const roles = BLOCK.map((_, i) => udfLineRole(i, { last, bodyStart }));
  assert.deepEqual(roles, ["open", "header", "header", "body", "body", "body", "close"]);
});

test("with no body yet, the lines between the markers are all header", () => {
  const lines = ["--/", "CREATE OR REPLACE LUA SCALAR SCRIPT F(", "/"];
  const roles = lines.map((_, i) => udfLineRole(i, { last: 2, bodyStart: null }));
  assert.deepEqual(roles, ["open", "header", "close"]);
});

test("the cell header reads the script's language, name and kind", () => {
  assert.deepEqual(udfCellHeading("CREATE OR REPLACE LUA SCALAR SCRIPT MY_UDF (a DOUBLE) RETURNS DOUBLE AS"), {
    language: "LUA",
    name: "MY_UDF",
    kind: "SCALAR",
  });
});

test("a SET script and a qualified name read as well", () => {
  const h = udfCellHeading("CREATE PYTHON3 SET SCRIPT ANALYTICS.AGG(a INT) EMITS (b INT) AS");
  assert.equal(h.language, "PYTHON3");
  assert.equal(h.kind, "SET");
  assert.equal(h.name, "ANALYTICS.AGG");
});

test("an adapter script is named as one", () => {
  assert.equal(udfCellHeading("CREATE OR REPLACE JAVA ADAPTER SCRIPT VS.ADAPTER AS").kind, "ADAPTER");
});

test("a header wrapped over lines still reads", () => {
  const h = udfCellHeading("CREATE OR REPLACE\n  LUA SCALAR SCRIPT\n  MY_UDF (a DOUBLE)\nRETURNS DOUBLE AS");
  assert.equal(h.language, "LUA");
  assert.equal(h.name, "MY_UDF");
});

test("a header still being typed yields what is there, not nothing", () => {
  const h = udfCellHeading("CREATE OR REPLACE LUA SCALAR SCRIPT");
  assert.equal(h.language, "LUA");
  assert.equal(h.kind, "SCALAR");
  assert.equal(h.name, null);
});

test("a line that is not a script header yields nothing to show", () => {
  assert.deepEqual(udfCellHeading("SELECT * FROM T"), { language: null, name: null, kind: null });
});
