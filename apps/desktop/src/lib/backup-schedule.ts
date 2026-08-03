/** Backup schedule model + next-run math for the Backups tab (pure, tested). */

export type BackupSchedule = {
  id: string;
  label: string;
  frequency: "daily" | "weekly";
  /** 24h HH:MM */
  time: string;
  /** 0 (Sun) – 6 (Sat), weekly only */
  weekday: number;
  enabled: boolean;
};

/** Next occurrence of a schedule strictly after `from`. */
export function nextRun(s: BackupSchedule, from: Date): Date {
  const [h, m] = s.time.split(":").map((x) => parseInt(x, 10));
  const next = new Date(from);
  next.setHours(h || 0, m || 0, 0, 0);
  if (s.frequency === "daily") {
    if (next <= from) next.setDate(next.getDate() + 1);
    return next;
  }
  let delta = (s.weekday - next.getDay() + 7) % 7;
  if (delta === 0 && next <= from) delta = 7;
  next.setDate(next.getDate() + delta);
  return next;
}
