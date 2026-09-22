import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeSpans, ToolSpanPairer, type TraceSpan } from "./trace.ts";

test("tool spans pair by call id and never fabricate durations", () => {
  const pairer = new ToolSpanPairer();
  pairer.start("c1", "run_sql", 1000);
  pairer.start("c2", "import_csv", 1100);
  const s1 = pairer.end("c1", true, 1450);
  assert.ok(s1);
  assert.equal(s1.name, "run_sql");
  assert.equal(s1.durationMs, 450);
  assert.equal(s1.ok, true);
  // An unmatched end (no start seen) yields nothing.
  assert.equal(pairer.end("ghost", true), null);
  // Ending twice yields nothing the second time.
  const s2 = pairer.end("c2", false, 1200);
  assert.ok(s2);
  assert.equal(pairer.end("c2", false), null);
  // A clock that ran backwards never produces a negative duration.
  pairer.start("c3", "x", 5000);
  assert.equal(pairer.end("c3", true, 4000)?.durationMs, 0);
});

test("summaries aggregate turns, tools, tokens, providers, days", () => {
  const now = Date.now();
  const spans: TraceSpan[] = [
    { kind: "turn", name: "claude", provider: "anthropic", startedAt: now, durationMs: 900, ok: true, tokens: { input: 1000, output: 200 } },
    { kind: "turn", name: "gpt", provider: "openai", startedAt: now - 1000, durationMs: 700, ok: true, tokens: { input: 500, output: 100 } },
    { kind: "tool", name: "run_sql", startedAt: now, durationMs: 300, ok: true },
    { kind: "tool", name: "import_csv", startedAt: now, durationMs: 700, ok: false },
    { kind: "gateway", name: "run_query", startedAt: now, durationMs: 120, ok: true },
    // Outside the window — must not count.
    { kind: "turn", name: "old", provider: "anthropic", startedAt: now - 10 * 24 * 3600 * 1000, durationMs: 1, ok: true, tokens: { input: 999999, output: 999999 } },
  ];
  const s = summarizeSpans(spans, 7);
  assert.equal(s.turns, 2);
  assert.equal(s.toolCalls, 2);
  assert.equal(s.gatewayCalls, 1);
  assert.equal(s.failures, 1);
  assert.equal(s.tokensIn, 1500);
  assert.equal(s.tokensOut, 300);
  assert.equal(s.avgToolMs, 500);
  assert.equal(s.byProvider.anthropic.tokensIn, 1000);
  assert.equal(s.byProvider.openai.turns, 1);
  const today = new Date(now).toISOString().slice(0, 10);
  assert.equal(s.byDay[today].toolCalls, 2);
});

test("empty input summarizes to zeros without division blowups", () => {
  const s = summarizeSpans([], 7);
  assert.equal(s.turns, 0);
  assert.equal(s.avgToolMs, 0);
  assert.deepEqual(s.byProvider, {});
});
