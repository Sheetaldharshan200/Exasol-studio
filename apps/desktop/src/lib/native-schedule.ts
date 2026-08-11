/**
 * Mapping between Studio's schedule model and ConfD's cron fields
 * (db_backup_add_schedule / db_backup_modify_schedule use minute, hour, day,
 * month, weekday — cluster-clock cron, weekday 0 = Sunday). Pure; tested in
 * native-schedule.test.ts.
 */
import type { BackupSchedule } from "@/lib/backup-schedule";

export type NativeCronFields = {
  minute: string;
  hour: string;
  day: string;
  month: string;
  weekday: string;
};

/** Studio daily/weekly/monthly + HH:MM → ConfD cron fields. NOTE: native
 *  schedules run on the CLUSTER's clock — the schedule's timezone field does
 *  not apply and callers must label that honestly. */
export function nativeScheduleFields(s: Pick<BackupSchedule, "frequency" | "time" | "weekday" | "dayOfMonth">): NativeCronFields {
  const [hRaw, mRaw] = s.time.split(":");
  const hour = String(Math.min(23, Math.max(0, parseInt(hRaw, 10) || 0)));
  const minute = String(Math.min(59, Math.max(0, parseInt(mRaw ?? "0", 10) || 0)));
  if (s.frequency === "weekly") {
    return { minute, hour, day: "*", month: "*", weekday: String(Math.min(6, Math.max(0, s.weekday))) };
  }
  if (s.frequency === "monthly") {
    return { minute, hour, day: String(Math.min(31, Math.max(1, s.dayOfMonth ?? 1))), month: "*", weekday: "*" };
  }
  return { minute, hour, day: "*", month: "*", weekday: "*" };
}

export type NativeSchedule = {
  name: string;
  enabled: boolean;
  level: number;
  expire: string;
  volume: string;
  minute: string;
  hour: string;
  day: string;
  month: string;
  weekday: string;
};

/**
 * Defensive reader for db_info's `config.backups` section — shapes vary by
 * version (map of name→config or array). Unknown fields default rather than
 * throw; a missing section yields [].
 */
export function parseDbInfoSchedules(dbInfo: unknown): NativeSchedule[] {
  const info = dbInfo as Record<string, unknown> | null;
  const config = (info?.config ?? info) as Record<string, unknown> | null;
  const backups = config?.backups;
  if (!backups || typeof backups !== "object") return [];
  const entries: [string, Record<string, unknown>][] = Array.isArray(backups)
    ? (backups as Record<string, unknown>[]).map((b, i) => [String(b.backup_name ?? b.name ?? `backup_${i}`), b])
    : Object.entries(backups as Record<string, Record<string, unknown>>);
  return entries.map(([name, b]) => ({
    name,
    enabled: b.enabled === true || String(b.enabled).toLowerCase() === "true",
    level: Number(b.level ?? 0) || 0,
    expire: String(b.expire ?? ""),
    volume: String(b.backup_volume_name ?? b.volume ?? b.backup_volume_id ?? ""),
    minute: String(b.minute ?? "0"),
    hour: String(b.hour ?? "0"),
    day: String(b.day ?? "*"),
    month: String(b.month ?? "*"),
    weekday: String(b.weekday ?? "*"),
  }));
}

/** "02:00 · Sun · level 0 · keep 1w" for the native schedule rows. */
export function describeNativeSchedule(s: NativeSchedule): string {
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const time = `${s.hour.padStart(2, "0")}:${s.minute.padStart(2, "0")}`;
  const when =
    s.weekday !== "*" ? `${WEEKDAYS[Number(s.weekday)] ?? s.weekday} ${time}` : s.day !== "*" ? `day ${s.day} ${time}` : `daily ${time}`;
  return `${when} · level ${s.level}${s.expire ? ` · keep ${s.expire}` : ""}`;
}
