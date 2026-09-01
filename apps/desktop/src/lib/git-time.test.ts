import assert from "node:assert/strict";
import { test } from "node:test";
import { formatRelativeTime, parseableDate } from "./git-time.ts";

const NOW = Date.parse("2026-09-01T12:00:00Z");
const at = (iso: string) => formatRelativeTime(iso, NOW);

test("sub-minute reads as just now", () => {
  assert.equal(at("2026-09-01T11:59:30Z"), "just now");
  assert.equal(at("2026-09-01T12:00:00Z"), "just now");
});

test("each unit fires at its threshold", () => {
  assert.equal(at("2026-09-01T11:58:00Z"), "2 minutes ago");
  assert.equal(at("2026-09-01T09:00:00Z"), "3 hours ago");
  assert.equal(at("2026-08-30T12:00:00Z"), "2 days ago");
  assert.equal(at("2026-08-11T12:00:00Z"), "3 weeks ago");
  assert.equal(at("2026-05-01T12:00:00Z"), "4 months ago");
  assert.equal(at("2024-09-01T12:00:00Z"), "2 years ago");
});

test("rounding rolls up instead of emitting 24 hours / 60 minutes", () => {
  // 23.6h rounds to 24h → must read as a day, never "24 hours ago".
  assert.equal(at("2026-08-31T12:24:00Z"), "1 day ago");
  // 59.6m rounds to 60m → "1 hour ago".
  assert.equal(at("2026-09-01T11:00:24Z"), "1 hour ago");
});

test("future dates format forward", () => {
  assert.equal(formatRelativeTime("2026-09-01T15:00:00Z", NOW), "in 3 hours");
});

test("parseableDate rejects garbage and accepts ISO", () => {
  assert.equal(parseableDate("2026-09-01T12:00:00Z"), true);
  assert.equal(parseableDate("not a date"), false);
  assert.equal(parseableDate(""), false);
});
