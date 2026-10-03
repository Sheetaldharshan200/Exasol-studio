import assert from "node:assert/strict";
import { test } from "node:test";
import { findParams, paramKey, substituteParams, textLiteral } from "./sql-params.ts";

test("placeholders are found once each, in order", () => {
  assert.deepEqual(findParams("SELECT * FROM t WHERE a = &id AND b = :status AND c = &ID"), [
    { name: "id", marker: "&" },
    { name: "status", marker: ":" },
  ]);
});

test("strings, quoted names, comments and script bodies are not placeholders", () => {
  const sql = "SELECT ':no', \"&no\" FROM t -- &no\n/* :no */ WHERE x = :yes";
  assert.deepEqual(findParams(sql).map((p) => p.name), ["yes"]);
  const script = "--/\nCREATE LUA SCRIPT s.x() AS\nlocal t = obj:method(&x)\n/\nSELECT :y FROM dual";
  assert.deepEqual(findParams(script).map((p) => p.name), ["y"]);
});

test("operators and glued colons are not placeholders", () => {
  assert.deepEqual(findParams("SELECT a::VARCHAR(10), b := 1, c && d FROM t"), []);
  assert.deepEqual(findParams("SELECT x FROM t WHERE label:value = 1"), [], "a word before the colon");
  assert.deepEqual(findParams("SELECT &1 FROM t"), [], "exaplus positional &1 needs a name here");
});

test("values replace every use; missing ones stay; literals are escaped", () => {
  assert.equal(substituteParams("SELECT * FROM t WHERE a = &id OR b = &ID", { "&id": "42" }), "SELECT * FROM t WHERE a = 42 OR b = 42");
  assert.equal(substituteParams("WHERE s = :status AND x = :other", { ":status": textLiteral("O'Brien") }), "WHERE s = 'O''Brien' AND x = :other");
  assert.equal(substituteParams("SELECT ':status' FROM t", { ":status": "1" }), "SELECT ':status' FROM t");
  assert.equal(paramKey({ name: "id", marker: "&" }), "&id");
});
