import { test } from "node:test";
import assert from "node:assert/strict";
import { nextRun, type BackupSchedule } from "./backup-schedule.ts";

const daily = (time: string): BackupSchedule => ({ id: "1", label: "t", frequency: "daily", time, weekday: 0, enabled: true });
const weekly = (weekday: number, time: string): BackupSchedule => ({ id: "1", label: "t", frequency: "weekly", time, weekday, enabled: true });

// Wed 2026-08-05 10:00 local
const FROM = new Date(2026, 7, 5, 10, 0, 0);

test("daily: later today when the time has not passed", () => {
  const n = nextRun(daily("14:30"), FROM);
  assert.equal(n.getDate(), 5);
  assert.equal(n.getHours(), 14);
  assert.equal(n.getMinutes(), 30);
});

test("daily: tomorrow when the time already passed (or is exactly now)", () => {
  assert.equal(nextRun(daily("02:00"), FROM).getDate(), 6);
  assert.equal(nextRun(daily("10:00"), FROM).getDate(), 6); // boundary: not in the past
});

test("weekly: same day later time stays this week; passed time jumps a week", () => {
  const wed = 3;
  assert.equal(nextRun(weekly(wed, "23:00"), FROM).getDate(), 5);
  assert.equal(nextRun(weekly(wed, "02:00"), FROM).getDate(), 12);
});

test("weekly: other weekdays land on the next occurrence", () => {
  const fri = nextRun(weekly(5, "02:00"), FROM);
  assert.equal(fri.getDay(), 5);
  assert.equal(fri.getDate(), 7);
  const sun = nextRun(weekly(0, "02:00"), FROM);
  assert.equal(sun.getDay(), 0);
  assert.equal(sun.getDate(), 9);
});

test("tolerates malformed time as midnight", () => {
  const n = nextRun(daily("xx"), FROM);
  assert.equal(n.getHours(), 0);
  assert.equal(n.getDate(), 6); // midnight already passed today
});
