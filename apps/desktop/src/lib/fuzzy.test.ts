import assert from "node:assert/strict";
import { test } from "node:test";
import { fuzzyRank, fuzzyScore } from "./fuzzy.ts";

test("substring beats scattered subsequence", () => {
  const sub = fuzzyScore("market", "Marketplace")!;
  const scattered = fuzzyScore("market", "my archive kit etc")!;
  assert.ok(sub.score > scattered.score);
});

test("word-boundary initials match like an IDE (qp → Query Performance)", () => {
  assert.ok(fuzzyScore("qp", "Query Performance"));
  assert.ok(fuzzyScore("nbt", "NotebookTab"));
  const boundary = fuzzyScore("qp", "Query Performance")!;
  const buried = fuzzyScore("qp", "aqap")!;
  assert.ok(boundary.score > buried.score);
});

test("non-subsequence is null; empty query matches everything at zero", () => {
  assert.equal(fuzzyScore("xyz", "abc"), null);
  assert.deepEqual(fuzzyScore("", "anything"), { score: 0, positions: [] });
});

test("positions cover the matched characters for highlighting", () => {
  const m = fuzzyScore("cat", "Catalog")!;
  assert.deepEqual(m.positions, [0, 1, 2]);
});

test("rank orders by relevance and drops non-matches", () => {
  const items = ["Settings", "SQL Editor", "Schema browser", "Sessions"];
  const ranked = fuzzyRank("se", items, (s) => s);
  // Both prefix matches outrank the scattered subsequence in "Schema browser".
  assert.ok(["Sessions", "Settings"].includes(ranked[0].item as string));
  const schemaIdx = ranked.findIndex((r) => r.item === "Schema browser");
  assert.ok(schemaIdx >= 2 || schemaIdx === -1);
  assert.equal(fuzzyRank("zzz", items, (s) => s).length, 0);
});

test("earlier match wins over later match of the same shape", () => {
  const early = fuzzyScore("con", "Connections")!;
  const late = fuzzyScore("con", "New database connection")!;
  assert.ok(early.score > late.score);
});
