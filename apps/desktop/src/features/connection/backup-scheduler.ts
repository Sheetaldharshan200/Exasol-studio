/**
 * Runtime for backup schedules: while Studio is open, a per-minute check
 * fires each due occurrence ONCE (lastRunAt advances in settings). Runs the
 * computer slept through are caught on the next launch/tick — dueRun returns
 * the missed wall-clock occurrence, so the notification says exactly what was
 * skipped. Exasol executes backups via its admin layer, so "firing" means a
 * clear notification plus the recorded evidence in the Backups tab.
 */
import { describeSchedule, dueRun, type BackupSchedule } from "@/lib/backup-schedule";
import { ipc } from "@/lib/ipc";

const CHECK_MS = 60_000;

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
        window.dispatchEvent(
          new CustomEvent("studio:notice", {
            detail: {
              kind: missedWhileOff ? "warning" : "info",
              title: `Backup due — ${s.label} (${conn.name})`,
              body: missedWhileOff
                ? `This run (${describeSchedule(s)}) was due ${due.toLocaleString([], { hour12: false })}, while Studio was closed or the computer was off. Start it now in your Exasol admin tool — recorded backup events appear in Backups · ${conn.name}.`
                : `${describeSchedule(s)} — start the backup in your Exasol admin tool; recorded events appear in Backups · ${conn.name}.`,
            },
          }),
        );
      }
      if (changed) await ipc.setAppSettings({ [key]: JSON.stringify(schedules) }).catch(() => undefined);
    }
  };
  void tick();
  const t = window.setInterval(() => void tick(), CHECK_MS);
  return () => window.clearInterval(t);
}
