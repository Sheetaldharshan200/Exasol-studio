import assert from "node:assert/strict";
import { test } from "node:test";
import { applyCrossFilters, type CrossFilters } from "./cross-filter-sql.ts";

test("no filters returns the base query untouched", () => {
  assert.equal(applyCrossFilters("SELECT * FROM t", {}, "w1"), "SELECT * FROM t");
});

test("wraps the query with WHERE for filters set by OTHER widgets", () => {
  const cf: CrossFilters = { REGION: { value: "EU", source: "w2" } };
  assert.equal(applyCrossFilters("SELECT a FROM t", cf, "w1"), `SELECT * FROM (SELECT a FROM t) "__cf" WHERE "REGION" = 'EU'`);
});

test("a chart never filters itself (its own source is excluded)", () => {
  const cf: CrossFilters = { REGION: { value: "EU", source: "w1" } };
  assert.equal(applyCrossFilters("SELECT a FROM t", cf, "w1"), "SELECT a FROM t");
});

test("single quotes in the value are escaped", () => {
  const cf: CrossFilters = { NAME: { value: "O'Brien", source: "w2" } };
  assert.match(applyCrossFilters("q", cf, "w1"), /'O''Brien'/);
});

test("multiple filters combine with AND", () => {
  const cf: CrossFilters = { A: { value: "1", source: "w2" }, B: { value: "2", source: "w3" } };
  assert.match(applyCrossFilters("q", cf, "w1"), /"A" = '1' AND "B" = '2'/);
});
