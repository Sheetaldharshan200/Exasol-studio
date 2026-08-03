/**
 * Runtime for backup schedules: while Studio is open, a per-minute check
 * fires each due occurrence ONCE (lastRunAt advances in settings) by RUNNING
 * a Studio logical backup (backup_now: per-table CSV + DDL). Runs the
 * computer slept through are caught on the next launch/tick — dueRun returns
 * the missed wall-clock occurrence, so the notification says exactly what was
 * skipped and that it is being caught up now.
 */
import { describeSchedule, dueRun, type BackupSchedule } from "@/lib/backup-schedule";
import { ipc } from "@/lib/ipc";

const CHECK_MS = 60_000;
const notify = (kind: string, title: string, body: string) =>
  window.dispatchEvent(new CustomEvent("studio:notice", { detail: { kind, title, body } }));

export function startBackupScheduler(getProfiles: () => { id: string; name: string }[]): () => void {
  const tick = async () => {
    const now = new Date();
    let settings: Record<string, unknown>;
    try {
      settings = await ipc.getAppSettings();
    } catch {
      return; // settings unavailable — retry next tick
    }
    for (const conn of getProfiles()) {
      const key = `backupSchedules_${conn.id}`;
      const raw = settings[key];
      if (typeof raw !== "string") continue;
      let schedules: BackupSchedule[];
      try {
        schedules = JSON.parse(raw) as BackupSchedule[];
      } catch {
        continue;
      }
      let changed = false;
      for (const s of schedules) {
        const due = dueRun(s, now);
        if (!due) continue;
        changed = true;
        s.lastRunAt = now.getTime();
        const missedWhileOff = now.getTime() - due.getTime() > 2 * CHECK_MS;
        notify(
          "info",
          `Scheduled backup starting — ${s.label} (${conn.name})`,
          missedWhileOff
            ? `The ${describeSchedule(s)} run was due ${due.toLocaleString([], { hour12: false })} while Studio was closed or the computer was off — catching it up now.`
            : `${describeSchedule(s)} — running a Studio logical backup (CSV + DDL).`,
        );
        try {
          const res = await ipc.backupNow(conn.id, conn.name);
          // Record the run where the Backups tab lists Studio backups.
          const runsRaw = settings[`backupRuns_${conn.id}`];
          const prev = typeof runsRaw === "string" ? (JSON.parse(runsRaw) as unknown[]) : [];
          await ipc
            .setAppSettings({ [`backupRuns_${conn.id}`]: JSON.stringify([{ ...res, at: Date.now() }, ...prev].slice(0, 10)) })
            .catch(() => undefined);
          notify(
            res.skipped.length ? "warning" : "success",
            `Scheduled backup complete — ${s.label} (${conn.name})`,
            `${res.tables} tables, ${res.rows.toLocaleString()} rows in ${(res.elapsedMs / 1000).toFixed(1)}s → ${res.dir}${res.skipped.length ? ` (${res.skipped.length} skipped)` : ""}`,
          );
        } catch (e) {
          notify(
            "warning",
            `Scheduled backup failed — ${s.label} (${conn.name})`,
            `${e instanceof Error ? e.message : String(e)} — it will NOT retry until the next scheduled occurrence; run it manually from Backups · ${conn.name}.`,
          );
        }
      }
      if (changed) await ipc.setAppSettings({ [key]: JSON.stringify(schedules) }).catch(() => undefined);
    }
  };
  void tick();
  const t = window.setInterval(() => void tick(), CHECK_MS);
  return () => window.clearInterval(t);
}
