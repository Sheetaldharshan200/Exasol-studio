import { test } from "node:test";
import assert from "node:assert/strict";
import { describeSchedule, dueRun, nextRun, utcFromZoned, zonedParts, type BackupSchedule } from "./backup-schedule.ts";

const sched = (over: Partial<BackupSchedule>): BackupSchedule => ({
  id: "1",
  label: "t",
  frequency: "daily",
  time: "02:00",
  weekday: 0,
  timezone: "UTC",
  enabled: true,
  ...over,
});

// Wed 2026-08-05 10:00:00 UTC
const FROM = new Date(Date.UTC(2026, 7, 5, 10, 0, 0));

test("zonedParts reads wall-clock in the zone", () => {
  const p = zonedParts(FROM, "Asia/Kolkata"); // UTC+05:30 fixed
  assert.deepEqual([p.y, p.m, p.d, p.h, p.min], [2026, 8, 5, 15, 30]);
  assert.equal(p.weekday, 3); // Wednesday
});

test("utcFromZoned inverts zonedParts", () => {
  const utc = utcFromZoned(2026, 8, 5, 15, 30, "Asia/Kolkata");
  assert.equal(utc.getTime(), FROM.getTime());
  assert.equal(utcFromZoned(2026, 8, 5, 10, 0, "UTC").getTime(), FROM.getTime());
});

test("daily: later today in the zone, else tomorrow", () => {
  assert.equal(nextRun(sched({ time: "14:30" }), FROM).getTime(), Date.UTC(2026, 7, 5, 14, 30));
  assert.equal(nextRun(sched({ time: "02:00" }), FROM).getTime(), Date.UTC(2026, 7, 6, 2, 0));
});

test("daily respects the schedule's zone, not the viewer's", () => {
  // 20:00 Kolkata on Aug 5 = 14:30 UTC — still ahead of FROM (10:00 UTC).
  const n = nextRun(sched({ time: "20:00", timezone: "Asia/Kolkata" }), FROM);
  assert.equal(n.getTime(), Date.UTC(2026, 7, 5, 14, 30));
  // 08:00 Kolkata = 02:30 UTC — already past, so tomorrow.
  const n2 = nextRun(sched({ time: "08:00", timezone: "Asia/Kolkata" }), FROM);
  assert.equal(n2.getTime(), Date.UTC(2026, 7, 6, 2, 30));
});

test("weekly lands on the zone's weekday", () => {
  // Friday 02:00 UTC — Aug 7.
  const n = nextRun(sched({ frequency: "weekly", weekday: 5 }), FROM);
  assert.equal(n.getTime(), Date.UTC(2026, 7, 7, 2, 0));
  // Wednesday but the time already passed → next Wednesday.
  const n2 = nextRun(sched({ frequency: "weekly", weekday: 3, time: "02:00" }), FROM);
  assert.equal(n2.getTime(), Date.UTC(2026, 7, 12, 2, 0));
});

test("monthly: this month when ahead, next month when passed; short months skip", () => {
  const n = nextRun(sched({ frequency: "monthly", dayOfMonth: 20 }), FROM);
  assert.equal(n.getTime(), Date.UTC(2026, 7, 20, 2, 0));
  const passed = nextRun(sched({ frequency: "monthly", dayOfMonth: 3 }), FROM);
  assert.equal(passed.getTime(), Date.UTC(2026, 8, 3, 2, 0));
  // Day 31: September has none → October 31.
  const d31 = nextRun(sched({ frequency: "monthly", dayOfMonth: 31 }), FROM);
  assert.equal(d31.getTime(), Date.UTC(2026, 7, 31, 2, 0));
  const after = nextRun(sched({ frequency: "monthly", dayOfMonth: 31 }), new Date(Date.UTC(2026, 8, 1)));
  assert.equal(after.getTime(), Date.UTC(2026, 9, 31, 2, 0));
});

test("DST: New York wall-clock time holds across the November fall-back", () => {
  // 02:30 America/New_York. Before DST ends (EDT, UTC-4) → 06:30 UTC;
  // after Nov 1 2026 (EST, UTC-5) → 07:30 UTC.
  const before = nextRun(sched({ time: "02:30", timezone: "America/New_York" }), new Date(Date.UTC(2026, 9, 30, 12, 0)));
  assert.equal(before.getTime(), Date.UTC(2026, 9, 31, 6, 30));
  const after = nextRun(sched({ time: "02:30", timezone: "America/New_York" }), new Date(Date.UTC(2026, 10, 2, 12, 0)));
  assert.equal(after.getTime(), Date.UTC(2026, 10, 3, 7, 30));
});

test("describeSchedule names the zone", () => {
  assert.equal(describeSchedule(sched({})), "daily at 02:00 (UTC)");
  assert.equal(describeSchedule(sched({ frequency: "weekly", weekday: 5, timezone: "Asia/Kolkata" })), "Fri at 02:00 (Asia/Kolkata)");
  assert.equal(describeSchedule(sched({ frequency: "monthly", dayOfMonth: 15 })), "day 15 at 02:00 (UTC)");
});

test("tolerates malformed time as midnight", () => {
  const n = nextRun(sched({ time: "xx" }), FROM);
  assert.equal(n.getTime(), Date.UTC(2026, 7, 6, 0, 0));
});

test("dueRun: nothing due before the first occurrence; the missed one after", () => {
  const created = Date.UTC(2026, 7, 5, 9, 0); // Wed 09:00 UTC
  const s: BackupSchedule = { id: `sched-${created}`, label: "n", frequency: "daily", time: "02:00", weekday: 0, timezone: "UTC", enabled: true };
  // Before tonight's 02:00 → nothing due.
  assert.equal(dueRun(s, new Date(Date.UTC(2026, 7, 5, 12, 0))), null);
  // The machine was off overnight; at 09:00 next day the 02:00 run is due.
  const due = dueRun(s, new Date(Date.UTC(2026, 7, 6, 9, 0)));
  assert.equal(due?.getTime(), Date.UTC(2026, 7, 6, 2, 0));
});

test("dueRun: lastRunAt advances the baseline; disabled schedules never fire", () => {
  const s: BackupSchedule = {
    id: "sched-1", label: "n", frequency: "daily", time: "02:00", weekday: 0, timezone: "UTC", enabled: true,
    lastRunAt: Date.UTC(2026, 7, 6, 2, 0),
  };
  assert.equal(dueRun(s, new Date(Date.UTC(2026, 7, 6, 9, 0))), null); // already handled
  assert.equal(dueRun(s, new Date(Date.UTC(2026, 7, 7, 9, 0)))?.getTime(), Date.UTC(2026, 7, 7, 2, 0));
  assert.equal(dueRun({ ...s, enabled: false }, new Date(Date.UTC(2026, 7, 9, 9, 0))), null);
});
