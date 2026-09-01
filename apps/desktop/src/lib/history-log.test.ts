import assert from "node:assert/strict";
import { test } from "node:test";
import { filterEntries, keyEntries, sortEntries, verbOf } from "./history-log.ts";
import type { HistoryEntry } from "./ipc.ts";

const mk = (over: Partial<HistoryEntry>): HistoryEntry => ({
  id: "h-1",
  executedAt: "2026-09-01T12:00:00.000000+00:00",
  profileId: "p",
  connectionName: "c",
  sql: "SELECT 1",
  statementCount: 1,
  elapsedMs: 5,
  execMs: 5,
  fetchMs: 1,
  truncated: false,
  success: true,
  error: null as unknown as undefined,
  rowCount: 1,
  ...over,
} as HistoryEntry);

test("time sort is numeric — mixed Z and +00:00 ISO shapes order correctly", () => {
  const entries = [
    mk({ id: "a", executedAt: "2026-09-01T12:00:01Z" }),
    mk({ id: "b", executedAt: "2026-09-01T12:00:00.999999+00:00" }),
    mk({ id: "c", executedAt: "2026-09-01T12:00:02+00:00" }),
  ];
  const sorted = sortEntries(keyEntries(entries), "time", -1);
  // String comparison would put "…Z" after "…+00:00" regardless of instant.
  assert.deepEqual(sorted.map((x) => x.e.id), ["c", "a", "b"]);
});

test("duplicate ids get distinct stable keys", () => {
  const entries = [mk({ id: "dup" }), mk({ id: "dup" })];
  const keys = keyEntries(entries).map((x) => x.k);
  assert.equal(new Set(keys).size, 2);
});

test("ties break newest-first, never shuffling equal values", () => {
  const entries = [
    mk({ id: "old", rowCount: 0, executedAt: "2026-09-01T10:00:00Z" }),
    mk({ id: "new", rowCount: 0, executedAt: "2026-09-01T11:00:00Z" }),
    mk({ id: "mid", rowCount: 0, executedAt: "2026-09-01T10:30:00Z" }),
  ];
  const asc = sortEntries(keyEntries(entries), "rows", 1);
  const desc = sortEntries(keyEntries(entries), "rows", -1);
  assert.deepEqual(asc.map((x) => x.e.id), ["new", "mid", "old"]);
  assert.deepEqual(desc.map((x) => x.e.id), ["new", "mid", "old"]);
});

test("status and command filters combine; empty sets pass everything", () => {
  const entries = [
    mk({ id: "s-ok", sql: "SELECT 1", success: true }),
    mk({ id: "s-bad", sql: "SELECT nope", success: false }),
    mk({ id: "c-ok", sql: "CREATE TABLE t(x INT)", success: true }),
  ];
  const keyed = keyEntries(entries);
  assert.equal(filterEntries(keyed, new Set(), new Set()).length, 3);
  assert.deepEqual(
    filterEntries(keyed, new Set(["Failed"]), new Set()).map((x) => x.e.id),
    ["s-bad"],
  );
  assert.deepEqual(
    filterEntries(keyed, new Set(["Success"]), new Set(["CREATE"])).map((x) => x.e.id),
    ["c-ok"],
  );
});

test("verbOf: comment-led SQL falls back to SQL; case-folds", () => {
  assert.equal(verbOf({ sql: "-- note\nselect 1" }), "SQL");
  assert.equal(verbOf({ sql: "  select 1" }), "SELECT");
  assert.equal(verbOf({ sql: "" }), "SQL");
});

test("exec sort falls back to elapsedMs when execMs is null", () => {
  const entries = [
    mk({ id: "fast", execMs: null as unknown as undefined, elapsedMs: 2 }),
    mk({ id: "slow", execMs: 90, elapsedMs: 95 }),
  ];
  const sorted = sortEntries(keyEntries(entries), "exec", 1);
  assert.deepEqual(sorted.map((x) => x.e.id), ["fast", "slow"]);
});

test("unparseable executedAt sorts oldest instead of throwing", () => {
  const entries = [mk({ id: "bad", executedAt: "not-a-date" }), mk({ id: "good" })];
  const sorted = sortEntries(keyEntries(entries), "time", -1);
  assert.deepEqual(sorted.map((x) => x.e.id), ["good", "bad"]);
});
