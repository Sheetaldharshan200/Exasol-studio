import { test } from "node:test";
import assert from "node:assert/strict";
import { describeNativeSchedule, nativeScheduleFields, parseDbInfoSchedules } from "./native-schedule.ts";

test("daily maps to */* with clamped time", () => {
  assert.deepEqual(nativeScheduleFields({ frequency: "daily", time: "02:30", weekday: 0 }), {
    minute: "30",
    hour: "2",
    day: "*",
    month: "*",
    weekday: "*",
  });
  // Clamps out-of-range and malformed time to midnight.
  assert.deepEqual(nativeScheduleFields({ frequency: "daily", time: "99:99", weekday: 0 }), {
    minute: "59",
    hour: "23",
    day: "*",
    month: "*",
    weekday: "*",
  });
  assert.equal(nativeScheduleFields({ frequency: "daily", time: "xx", weekday: 0 }).hour, "0");
});

test("weekly maps weekday 0=Sunday, clamped to 0..6", () => {
  assert.equal(nativeScheduleFields({ frequency: "weekly", time: "02:00", weekday: 0 }).weekday, "0");
  assert.equal(nativeScheduleFields({ frequency: "weekly", time: "02:00", weekday: 6 }).weekday, "6");
  assert.equal(nativeScheduleFields({ frequency: "weekly", time: "02:00", weekday: 9 }).weekday, "6");
  assert.equal(nativeScheduleFields({ frequency: "weekly", time: "02:00", weekday: 3 }).day, "*");
});

test("monthly maps day-of-month, clamped to 1..31", () => {
  const f = nativeScheduleFields({ frequency: "monthly", time: "01:15", weekday: 0, dayOfMonth: 15 });
  assert.deepEqual([f.day, f.weekday, f.hour, f.minute], ["15", "*", "1", "15"]);
  assert.equal(nativeScheduleFields({ frequency: "monthly", time: "01:15", weekday: 0, dayOfMonth: 0 }).day, "1");
  assert.equal(nativeScheduleFields({ frequency: "monthly", time: "01:15", weekday: 0 }).day, "1");
});

test("parseDbInfoSchedules reads the map shape", () => {
  const out = parseDbInfoSchedules({
    config: {
      backups: {
        nightly: { enabled: true, level: 0, expire: "1w", backup_volume_name: "ArchiveVolume1", minute: "0", hour: "2", day: "*", month: "*", weekday: "*" },
      },
    },
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "nightly");
  assert.equal(out[0].enabled, true);
  assert.equal(out[0].volume, "ArchiveVolume1");
});

test("parseDbInfoSchedules reads the array shape and defaults unknowns", () => {
  const out = parseDbInfoSchedules({ backups: [{ backup_name: "weekly_full", enabled: "true", weekday: "0" }] });
  assert.equal(out[0].name, "weekly_full");
  assert.equal(out[0].enabled, true);
  assert.equal(out[0].level, 0);
  assert.equal(out[0].day, "*");
});

test("parseDbInfoSchedules survives junk", () => {
  assert.deepEqual(parseDbInfoSchedules(null), []);
  assert.deepEqual(parseDbInfoSchedules({}), []);
  assert.deepEqual(parseDbInfoSchedules({ config: { backups: "nope" } }), []);
});

test("describeNativeSchedule renders daily/weekly/monthly", () => {
  const base = { name: "n", enabled: true, level: 0, expire: "1w", volume: "v", minute: "0", hour: "2", day: "*", month: "*", weekday: "*" };
  assert.equal(describeNativeSchedule(base), "daily 02:00 · level 0 · keep 1w");
  assert.equal(describeNativeSchedule({ ...base, weekday: "0" }), "Sun 02:00 · level 0 · keep 1w");
  assert.equal(describeNativeSchedule({ ...base, day: "15", expire: "" }), "day 15 02:00 · level 0");
});
