import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_STYLE_DEFAULTS, parseAiStyle, styleDirective } from "./ai-style.ts";

test("parse falls back to defaults on garbage, null, and partials", () => {
  assert.deepEqual(parseAiStyle(null), AI_STYLE_DEFAULTS);
  assert.deepEqual(parseAiStyle("not json"), AI_STYLE_DEFAULTS);
  assert.equal(parseAiStyle('{"depth":"deep"}').depth, "deep");
  assert.equal(parseAiStyle('{"depth":"wat"}').depth, "balanced");
  assert.equal(parseAiStyle('{"output":"charts","tone":"direct","emoji":"sparing"}').output, "charts");
});

test("custom instructions are capped, never unbounded", () => {
  const long = "x".repeat(5000);
  assert.equal(parseAiStyle(JSON.stringify({ custom: long })).custom.length, 600);
});

test("directive carries persona, depth, output, tone, emoji and custom", () => {
  const d = styleDirective("data-engineer", {
    ...AI_STYLE_DEFAULTS,
    depth: "concise",
    output: "charts",
    tone: "direct",
    emoji: "sparing",
    custom: "Always show row counts.",
  });
  assert.match(d, /persona is data-engineer/);
  assert.match(d, /just the result/);
  assert.match(d, /charts and dashboards/);
  assert.match(d, /maximally direct/);
  assert.match(d, /Emoji are fine/);
  assert.match(d, /Always show row counts\./);
});

test("no persona and empty custom produce a clean directive", () => {
  const d = styleDirective(null, AI_STYLE_DEFAULTS);
  assert.doesNotMatch(d, /persona/);
  assert.doesNotMatch(d, /Additional standing/);
  assert.match(d, /Never use emoji\./);
});
