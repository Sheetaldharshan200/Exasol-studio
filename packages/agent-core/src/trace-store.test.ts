import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TraceStore } from "./trace-store.ts";
import type { TraceSpan } from "./trace.ts";

function span(overrides: Partial<TraceSpan> = {}): TraceSpan {
  return { kind: "tool", name: "run_sql", startedAt: Date.now(), durationMs: 5, ok: true, ...overrides };
}

function dayFile(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10) + ".jsonl";
}

test("append + read roundtrip, oldest first", () => {
  const store = new TraceStore(mkdtempSync(join(tmpdir(), "traces-")));
  store.append(span({ name: "a" }));
  store.append(span({ name: "b" }));
  const back = store.read(1);
  assert.deepEqual(back.map((s) => s.name), ["a", "b"]);
});

test("read window is calendar days, not file count", () => {
  const dir = mkdtempSync(join(tmpdir(), "traces-"));
  const store = new TraceStore(dir);
  // A sparse history: one file 10 days old, one today. read(2) must NOT
  // pull the old file in just because only two files exist.
  writeFileSync(join(dir, "traces", dayFile(10)), JSON.stringify(span({ name: "old" })) + "\n");
  store.append(span({ name: "new" }));
  assert.deepEqual(store.read(2).map((s) => s.name), ["new"]);
  // A wide enough window sees both, oldest first.
  assert.deepEqual(store.read(15).map((s) => s.name), ["old", "new"]);
});

test("torn lines and blank lines are skipped, not fatal", () => {
  const dir = mkdtempSync(join(tmpdir(), "traces-"));
  const store = new TraceStore(dir);
  writeFileSync(join(dir, "traces", dayFile(0)), `${JSON.stringify(span({ name: "ok" }))}\n{"torn\n\n`);
  assert.deepEqual(store.read(1).map((s) => s.name), ["ok"]);
});

test("prune removes files older than 30 calendar days, keeps the rest", () => {
  const dir = mkdtempSync(join(tmpdir(), "traces-"));
  const store = new TraceStore(dir);
  writeFileSync(join(dir, "traces", dayFile(45)), JSON.stringify(span()) + "\n");
  writeFileSync(join(dir, "traces", dayFile(29)), JSON.stringify(span()) + "\n");
  store.append(span());
  store.summary(7); // summary() prunes
  const left = readdirSync(join(dir, "traces")).sort();
  assert.equal(left.length, 2);
  assert.ok(!left.includes(dayFile(45)));
  assert.ok(left.includes(dayFile(29)));
});

test("recent returns newest first and honors the limit", () => {
  const store = new TraceStore(mkdtempSync(join(tmpdir(), "traces-")));
  for (const n of ["a", "b", "c"]) store.append(span({ name: n }));
  assert.deepEqual(store.recent(2).map((s) => s.name), ["c", "b"]);
});
