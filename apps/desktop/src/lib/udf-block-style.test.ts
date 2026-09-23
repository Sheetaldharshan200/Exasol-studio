import assert from "node:assert/strict";
import { test } from "node:test";
import { udfAccentClass, udfAccentColor, udfAccentRule, udfBodyStart, udfChipLabel, udfLineClasses, udfLineRole } from "./udf-block-style.ts";

test("any language gets an accent, including ones this app has never heard of", () => {
  for (const lang of ["lua", "python3", "java", "r", "scala", "wasm", "julia"]) {
    assert.match(udfAccentColor(lang) ?? "", /^hsl\(\d+ 70% 62%\)$/, lang);
  }
});

test("the same language always gets the same accent, however it was written", () => {
  assert.equal(udfAccentColor("LUA"), udfAccentColor("lua"));
  assert.equal(udfAccentColor("  Python3 "), udfAccentColor("python3"));
});

test("different languages get different accents", () => {
  const seen = new Set(["lua", "python3", "java", "r"].map((l) => udfAccentColor(l)));
  assert.equal(seen.size, 4, "four languages should not collide");
});

test("no language means no accent to draw", () => {
  assert.equal(udfAccentColor(null), null);
  assert.equal(udfAccentColor("   "), null);
});

test("the chip names the language, and says nothing when there is none", () => {
  assert.equal(udfChipLabel("lua"), "LUA SCRIPT");
  assert.equal(udfChipLabel("Python3"), "PYTHON3 SCRIPT");
  assert.equal(udfChipLabel(null), null);
});

test("a class name is safe for any language a database might report", () => {
  assert.equal(udfAccentClass("LUA"), "exa-udf-lang-lua");
  assert.equal(udfAccentClass("python3"), "exa-udf-lang-python3");
  // Punctuation or a non-Latin name must still yield a usable selector.
  const odd = udfAccentClass("c++")!;
  assert.match(odd, /^exa-udf-lang-[a-z0-9]+$/);
  assert.equal(udfAccentClass(null), null);
});

test("the generated rule carries the accent to the line", () => {
  const cls = udfAccentClass("lua")!;
  assert.equal(udfAccentRule("lua", cls), `.${cls}{--exa-udf-accent:${udfAccentColor("lua")}}`);
  assert.equal(udfAccentRule("", "x"), "");
});

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
