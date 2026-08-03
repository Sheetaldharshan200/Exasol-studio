/**
 * Backup schedule model + next-run math for the Backups tab (pure, tested).
 * Schedules are TIMEZONE-AWARE: "02:00 Asia/Kolkata" fires at 02:00 Kolkata
 * wall-clock regardless of where the laptop is, including across DST shifts
 * in the chosen zone.
 */

export type BackupSchedule = {
  id: string;
  label: string;
  frequency: "daily" | "weekly" | "monthly";
  /** 24h HH:MM, wall-clock in `timezone` */
  time: string;
  /** 0 (Sun) – 6 (Sat), weekly only */
  weekday: number;
  /** 1–31, monthly only (months without the day are skipped) */
  dayOfMonth?: number;
  /** IANA zone ("Asia/Kolkata"); empty/missing = the system zone. */
  timezone?: string;
  enabled: boolean;
};

export function systemZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const WEEKDAY_NUM: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** The wall-clock parts an instant reads as in a zone. */
export function zonedParts(instant: Date, zone: string): { y: number; m: number; d: number; h: number; min: number; weekday: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = Object.fromEntries(dtf.formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour) % 24, // "24" at midnight in some ICU versions
    min: Number(parts.minute),
    weekday: WEEKDAY_NUM[parts.weekday] ?? 0,
  };
}

/** The UTC instant at which `zone` reads the given wall-clock (guess + adjust,
 *  stable across DST transitions). */
export function utcFromZoned(y: number, m: number, d: number, h: number, min: number, zone: string): Date {
  let ts = Date.UTC(y, m - 1, d, h, min);
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(ts), zone);
    ts += Date.UTC(y, m - 1, d, h, min) - Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  }
  return new Date(ts);
}

/** Next occurrence of a schedule strictly after `from`, in the schedule's zone. */
export function nextRun(s: BackupSchedule, from: Date): Date {
  const zone = s.timezone || systemZone();
  const [h, m] = s.time.split(":").map((x) => parseInt(x, 10));
  // Scan day by day (covers weekly gaps, months without a 31st, DST edges).
  for (let i = 0; i <= 62; i++) {
    const probe = new Date(from.getTime() + i * 86_400_000);
    const p = zonedParts(probe, zone);
    if (s.frequency === "weekly" && p.weekday !== s.weekday) continue;
    if (s.frequency === "monthly" && p.d !== (s.dayOfMonth ?? 1)) continue;
    const candidate = utcFromZoned(p.y, p.m, p.d, h || 0, m || 0, zone);
    if (candidate > from) return candidate;
  }
  return new Date(from.getTime() + 86_400_000); // unreachable fallback
}

/** "02:00 Asia/Kolkata" rendered for the schedule list. */
export function describeSchedule(s: BackupSchedule): string {
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const when =
    s.frequency === "daily" ? `daily at ${s.time}` : s.frequency === "weekly" ? `${WEEKDAYS[s.weekday]} at ${s.time}` : `day ${s.dayOfMonth ?? 1} at ${s.time}`;
  return `${when} (${s.timezone || systemZone()})`;
}
