import { test } from "node:test";
import assert from "node:assert/strict";
import { languageChoice } from "./sql-completion.ts";

test("the choice list is whatever the server offers", () => {
  assert.equal(languageChoice(["LUA", "PYTHON3", "JAVA"]), "${1|LUA,PYTHON3,JAVA|}");
  // A language the server gains needs no edit here.
  assert.equal(languageChoice(["LUA", "JULIA"]), "${1|LUA,JULIA|}");
});

test("aliases are upper-cased and de-duplicated, keeping first-seen order", () => {
  assert.equal(languageChoice(["lua", "LUA", " Python3 "]), "${1|LUA,PYTHON3|}");
});

test("an alias that would break the snippet syntax is dropped, not inserted", () => {
  assert.equal(languageChoice(["LUA", "A,B", "C|D", "E$F", "G}H"]), "${1|LUA|}");
});

test("no languages means a plain placeholder rather than a guess", () => {
  assert.equal(languageChoice([]), "${1:LUA}");
  assert.equal(languageChoice(undefined), "${1:LUA}");
  assert.equal(languageChoice(["", "  "]), "${1:LUA}");
});
