import { useCallback, useEffect, useRef, useState } from "react";
import { Check, DatabaseBackup, HardDrive, Loader2, Plus, RefreshCcw, Square, Trash2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorMessage, ipc } from "@/lib/ipc";
import { describeNativeSchedule, nativeScheduleFields, parseDbInfoSchedules, type NativeSchedule } from "@/lib/native-schedule";
import { AdminApiConnect, useAdminApi } from "./AdminApiConnect";

/**
 * "Cluster backups (native)" — the Admin UI's backup screens inside Studio
 * (admin-api-parity spec): archive volumes, the cluster's backup list,
 * Backup now with progress/abort, cluster cron schedules, guarded restore.
 * Everything here runs through allowlisted ConfD jobs; without an Admin API
 * session it collapses to the connect form.
 */
type NativeBackup = Record<string, unknown>;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const notify = (kind: string, title: string, body: string) =>
  window.dispatchEvent(new CustomEvent("studio:notice", { detail: { kind, title, body } }));

export function NativeBackupsSection({ profileId, connectionName, dbHost }: { profileId: string; connectionName: string; dbHost: string }) {
  const { status, refresh: refreshStatus } = useAdminApi(profileId);
  const [dbName, setDbName] = useState<string | null>(null);
  const [volumes, setVolumes] = useState<string[]>([]);
  const [backups, setBackups] = useState<NativeBackup[]>([]);
  const [schedules, setSchedules] = useState<NativeSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const pollTimer = useRef<number | undefined>(undefined);
  // Backup-now form
  const [volume, setVolume] = useState("");
  const [level, setLevel] = useState("0");
  const [expire, setExpire] = useState("1w");
  // Schedule draft
  const [schedDraft, setSchedDraft] = useState<{ name: string; frequency: "daily" | "weekly" | "monthly"; time: string; weekday: number; dayOfMonth: number; level: string; expire: string } | null>(null);
  // Restore guard
  const [restoreFor, setRestoreFor] = useState<NativeBackup | null>(null);
  const [restoreTyped, setRestoreTyped] = useState("");

  const job = useCallback(
    (name: string, params: Record<string, unknown>) => ipc.confdJob(profileId, name, params),
    [profileId],
  );

  const load = useCallback(async () => {
    if (!status.connected) return;
    setLoading(true);
    setError(null);
    try {
      const dbs = (await job("db_list", {})) as unknown;
      const list = Array.isArray(dbs) ? dbs.map(String) : [];
      const db = list[0] ?? null;
      setDbName(db);
      if (!db) {
        setError("No database found on this cluster.");
        return;
      }
      const [vols, bks, info] = await Promise.all([
        job("st_volume_list", {}).catch(() => null),
        job("db_backup_list", { db_name: db }).catch((e) => {
          setError(errorMessage(e));
          return null;
        }),
        job("db_info", { db_name: db }).catch(() => null),
      ]);
      // Volume list shapes vary: array of names, or array/map of structs.
      const volNames: string[] = [];
      const pushVol = (v: unknown) => {
        if (typeof v === "string") volNames.push(v);
        else if (v && typeof v === "object") {
          const o = v as Record<string, unknown>;
          const name = o.name ?? o.volume_name ?? o.id;
          if (name !== undefined) volNames.push(String(name));
        }
      };
      if (Array.isArray(vols)) vols.forEach(pushVol);
      else if (vols && typeof vols === "object") Object.keys(vols).forEach((k) => volNames.push(k));
      // Archive volumes only when the shape tells us; otherwise show all.
      setVolumes(volNames);
      if (!volume && volNames.length > 0) setVolume(volNames[0]);
      const bkList = Array.isArray(bks) ? (bks as NativeBackup[]) : bks && typeof bks === "object" && Array.isArray((bks as Record<string, unknown>).backups) ? ((bks as Record<string, unknown>).backups as NativeBackup[]) : [];
      setBackups(bkList);
      setSchedules(parseDbInfoSchedules(info));
    } finally {
      setLoading(false);
    }
  }, [status.connected, job, volume]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => () => window.clearTimeout(pollTimer.current), []);

  async function startNative() {
    if (!dbName || !volume) return;
    setRunning(true);
    setProgressText("starting…");
    notify("info", `Native backup starting — ${connectionName}`, `db_backup_start level ${level} → ${volume}`);
    try {
      await job("db_backup_start", { db_name: dbName, backup_volume_name: volume, level: parseInt(level, 10) || 0, ...(expire.trim() ? { expire: expire.trim() } : {}) });
      // Poll progress until the cluster reports no running backup.
      const poll = async () => {
        try {
          const p = (await job("db_backup_progress", { db_name: dbName })) as Record<string, unknown> | null;
          const text = p && typeof p === "object" ? JSON.stringify(p) : String(p ?? "");
          const active = text && !/no.*(backup|running)|^\s*(\{\}|\[\]|null|)\s*$/i.test(text);
          if (active) {
            setProgressText(text.slice(0, 120));
            pollTimer.current = window.setTimeout(() => void poll(), 2000);
          } else {
            setRunning(false);
            setProgressText(null);
            notify("success", `Native backup complete — ${connectionName}`, `Level ${level} backup to ${volume} finished.`);
            void load();
          }
        } catch {
          setRunning(false);
          setProgressText(null);
          void load();
        }
      };
      pollTimer.current = window.setTimeout(() => void poll(), 1500);
    } catch (e) {
      setRunning(false);
      setProgressText(null);
      notify("warning", `Native backup failed — ${connectionName}`, errorMessage(e));
    }
  }

  async function abortNative() {
    if (!dbName) return;
    try {
      await job("db_backup_abort", { db_name: dbName });
      notify("info", `Native backup aborted — ${connectionName}`, "db_backup_abort acknowledged.");
    } catch (e) {
      notify("warning", "Abort failed", errorMessage(e));
    }
    setRunning(false);
    setProgressText(null);
    void load();
  }

  async function saveSchedule() {
    if (!dbName || !schedDraft || !volume) return;
    const fields = nativeScheduleFields({ frequency: schedDraft.frequency, time: schedDraft.time, weekday: schedDraft.weekday, dayOfMonth: schedDraft.dayOfMonth });
    try {
      await job("db_backup_add_schedule", {
        db_name: dbName,
        backup_name: schedDraft.name,
        backup_volume_name: volume,
        enabled: true,
        level: parseInt(schedDraft.level, 10) || 0,
        ...(schedDraft.expire.trim() ? { expire: schedDraft.expire.trim() } : {}),
        ...fields,
      });
      setSchedDraft(null);
      notify("success", "Cluster schedule added", `${schedDraft.name} — the cluster runs it even when Studio is closed.`);
      void load();
    } catch (e) {
      notify("warning", "Adding the cluster schedule failed", errorMessage(e));
    }
  }

  async function toggleSchedule(s: NativeSchedule) {
    if (!dbName) return;
    try {
      await job("db_backup_modify_schedule", { db_name: dbName, backup_name: s.name, enabled: !s.enabled });
      void load();
    } catch (e) {
      notify("warning", "Modifying the schedule failed", errorMessage(e));
    }
  }

  async function removeSchedule(s: NativeSchedule) {
    if (!dbName) return;
    try {
      await job("db_backup_remove_schedule", { db_name: dbName, backup_name: s.name });
      void load();
    } catch (e) {
      notify("warning", "Removing the schedule failed", errorMessage(e));
    }
  }

  async function deleteBackup(b: NativeBackup) {
    if (!dbName) return;
    const id = b.id ?? b.bid ?? b.backup_id;
    if (id === undefined) return;
    try {
      await job("db_backups_delete", { db_name: dbName, backup_ids: [Number(id)] });
      notify("info", "Backup deleted", `Backup ${id} removed from the archive volume.`);
      void load();
    } catch (e) {
      notify("warning", "Deleting the backup failed", errorMessage(e));
    }
  }

  async function confirmRestore() {
    if (!dbName || !restoreFor || restoreTyped !== dbName) return;
    const id = restoreFor.id ?? restoreFor.bid ?? restoreFor.backup_id;
    setRestoreFor(null);
    setRestoreTyped("");
    notify("info", `Restore starting — ${connectionName}`, `db_restore from backup ${id}. The database will be replaced.`);
    try {
      await job("db_restore", { db_name: dbName, backup_id: Number(id) });
      notify("success", `Restore finished — ${connectionName}`, `Database ${dbName} restored from backup ${id}.`);
      void load();
    } catch (e) {
      notify("warning", `Restore failed — ${connectionName}`, errorMessage(e));
    }
  }

  const bkField = (b: NativeBackup, keys: string[]) => {
    for (const k of keys) if (b[k] !== undefined && b[k] !== null) return String(b[k]);
    return "—";
  };

  return (
    <div className="mt-4 shrink-0 rounded-lg border border-border bg-panel/60 p-3">
      <div className="flex items-center gap-2">
        <HardDrive className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-semibold">Cluster backups (native)</span>
        <span className="text-[11px] text-muted-foreground">Exasol's own backups on archive volumes — the Admin UI's Backups &amp; Schedules, in Studio</span>
        {status.connected ? (
          <button onClick={() => void load()} title="Refresh" className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
          </button>
        ) : null}
      </div>

      <div className="mt-2">
        <AdminApiConnect profileId={profileId} defaultHost={dbHost} status={status} onChanged={refreshStatus} />
      </div>

      {status.connected ? (
        <>
          {error ? <p className="mt-2 font-mono text-[11px] text-destructive">{error}</p> : null}

          {/* Backup now (native) */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-md border border-border/60 bg-panel px-2.5 py-2 text-[12px]">
            <span className="font-medium">Backup now</span>
            <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
              {volumes.length === 0 ? <span className="px-1.5 text-[11px] text-muted-foreground">no volumes found</span> : null}
              {volumes.slice(0, 4).map((v) => (
                <button key={v} onClick={() => setVolume(v)} className={cn("h-5.5 rounded px-1.5 text-[11px]", volume === v ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
                  {v}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              level
              <input value={level} onChange={(e) => setLevel(e.target.value.replace(/\D/g, "").slice(0, 1))} className="h-6 w-8 rounded border border-border bg-editor px-1 text-center font-mono outline-none focus:border-primary/50" aria-label="Backup level" />
            </label>
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              keep
              <input value={expire} onChange={(e) => setExpire(e.target.value)} placeholder="1w" className="h-6 w-14 rounded border border-border bg-editor px-1 text-center font-mono outline-none focus:border-primary/50" aria-label="Expiration" />
            </label>
            {running ? (
              <>
                <span className="font-mono text-[11px] text-muted-foreground">{progressText ?? "running…"}</span>
                <button onClick={() => void abortNative()} className="ml-auto flex h-6 items-center gap-1 rounded-md border border-destructive/40 px-2 text-[12px] text-destructive hover:bg-destructive/10">
                  <Square className="h-3 w-3" /> Abort
                </button>
              </>
            ) : (
              <button onClick={() => void startNative()} disabled={!volume} className="ml-auto flex h-6 items-center gap-1 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50">
                <DatabaseBackup className="h-3 w-3" /> Backup now
              </button>
            )}
          </div>

          {/* Cluster schedules */}
          <div className="mt-3">
            <div className="flex items-center gap-2 text-[12px] font-medium">
              Cluster schedules
              <span className="text-[11px] font-normal text-muted-foreground">run on the cluster clock, even when Studio is closed</span>
              <button
                onClick={() => setSchedDraft({ name: "nightly_full", frequency: "daily", time: "02:00", weekday: 0, dayOfMonth: 1, level: "0", expire: "1w" })}
                className="ml-auto flex h-6 items-center gap-1 rounded-md border border-border px-2 text-[12px] text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
            <div className="mt-1.5 space-y-1">
              {schedules.length === 0 && !schedDraft ? <p className="text-[12px] text-muted-foreground">No cluster schedules.</p> : null}
              {schedules.map((s) => (
                <div key={s.name} className="flex items-center gap-2 rounded-md border border-border/60 bg-panel px-2.5 py-1.5 text-[12px]">
                  <button
                    role="switch"
                    aria-checked={s.enabled}
                    onClick={() => void toggleSchedule(s)}
                    className={cn("relative h-4 w-7 rounded-full transition-colors", s.enabled ? "bg-primary" : "bg-secondary")}
                  >
                    <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all", s.enabled ? "left-3.5" : "left-0.5")} />
                  </button>
                  <span className={cn("font-medium", !s.enabled && "text-muted-foreground line-through")}>{s.name}</span>
                  <span className="text-muted-foreground">{describeNativeSchedule(s)}</span>
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">{s.volume}</span>
                  <button aria-label={`Remove ${s.name}`} onClick={() => void removeSchedule(s)} className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {schedDraft ? (
                <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-primary/40 bg-panel p-2 text-[12px]">
                  <input value={schedDraft.name} onChange={(e) => setSchedDraft({ ...schedDraft, name: e.target.value.replace(/[^\w-]/g, "_") })} aria-label="Schedule name"
                    className="h-7 w-36 rounded-md border border-border bg-editor px-2 font-mono outline-none focus:border-primary/50" />
                  <div className="flex h-7 items-center gap-0.5 rounded-md border border-border px-0.5">
                    {(["daily", "weekly", "monthly"] as const).map((f) => (
                      <button key={f} onClick={() => setSchedDraft({ ...schedDraft, frequency: f })} className={cn("h-5.5 rounded px-2 text-[11.5px]", schedDraft.frequency === f ? "bg-primary/15 text-primary" : "text-muted-foreground")}>
                        {f}
                      </button>
                    ))}
                  </div>
                  {schedDraft.frequency === "weekly" ? (
                    <div className="flex h-7 items-center gap-0.5 rounded-md border border-border px-0.5">
                      {WEEKDAYS.map((d, i) => (
                        <button key={d} onClick={() => setSchedDraft({ ...schedDraft, weekday: i })} className={cn("h-5.5 rounded px-1.5 text-[11px]", schedDraft.weekday === i ? "bg-primary/15 text-primary" : "text-muted-foreground")}>
                          {d}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {schedDraft.frequency === "monthly" ? (
                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      day
                      <input value={String(schedDraft.dayOfMonth)} onChange={(e) => setSchedDraft({ ...schedDraft, dayOfMonth: Math.min(31, Math.max(1, parseInt(e.target.value.replace(/\D/g, ""), 10) || 1)) })}
                        className="h-7 w-10 rounded-md border border-border bg-editor px-1 text-center font-mono outline-none focus:border-primary/50" aria-label="Day of month" />
                    </label>
                  ) : null}
                  <input value={schedDraft.time} onChange={(e) => setSchedDraft({ ...schedDraft, time: e.target.value.replace(/[^\d:]/g, "").slice(0, 5) })} placeholder="02:00" aria-label="Time (cluster clock)"
                    className="h-7 w-16 rounded-md border border-border bg-editor px-2 text-center font-mono outline-none focus:border-primary/50" />
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    level
                    <input value={schedDraft.level} onChange={(e) => setSchedDraft({ ...schedDraft, level: e.target.value.replace(/\D/g, "").slice(0, 1) })} className="h-7 w-8 rounded-md border border-border bg-editor px-1 text-center font-mono outline-none focus:border-primary/50" aria-label="Level" />
                  </label>
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    keep
                    <input value={schedDraft.expire} onChange={(e) => setSchedDraft({ ...schedDraft, expire: e.target.value })} placeholder="1w" className="h-7 w-14 rounded-md border border-border bg-editor px-1 text-center font-mono outline-none focus:border-primary/50" aria-label="Expiration" />
                  </label>
                  <div className="ml-auto flex items-center gap-1.5">
                    <button onClick={() => void saveSchedule()} disabled={!schedDraft.name || !/^\d{1,2}:\d{2}$/.test(schedDraft.time) || !volume}
                      className="flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50">
                      <Check className="h-3 w-3" /> Save
                    </button>
                    <button onClick={() => setSchedDraft(null)} className="h-7 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:text-foreground">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Backup list */}
          <div className="mt-3">
            <div className="text-[12px] font-medium">Backups on archive volumes</div>
            <div className="mt-1.5 overflow-x-auto">
              {backups.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">The cluster reports no backups for {dbName ?? "this database"}.</p>
              ) : (
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="pb-1 pr-3">ID</th>
                      <th className="pb-1 pr-3">Volume</th>
                      <th className="pb-1 pr-3">Level</th>
                      <th className="pb-1 pr-3">Timestamp</th>
                      <th className="pb-1 pr-3">Expires</th>
                      <th className="pb-1 pr-3">Usable</th>
                      <th className="pb-1" />
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {backups.map((b, i) => (
                      <tr key={i} className="border-t border-border/60">
                        <td className="py-1 pr-3">{bkField(b, ["id", "bid", "backup_id"])}</td>
                        <td className="py-1 pr-3">{bkField(b, ["volume", "backup_volume_name", "volume_name"])}</td>
                        <td className="py-1 pr-3">{bkField(b, ["level"])}</td>
                        <td className="py-1 pr-3">{bkField(b, ["timestamp", "ts", "date"])}</td>
                        <td className="py-1 pr-3">{bkField(b, ["expire", "expiration", "expire_date"])}</td>
                        <td className="py-1 pr-3">{bkField(b, ["usable", "usage"])}</td>
                        <td className="py-1 text-right">
                          <button onClick={() => { setRestoreFor(b); setRestoreTyped(""); }} title="Restore from this backup"
                            className="mr-1 h-5 rounded px-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground">
                            <Undo2 className="inline h-3 w-3" /> Restore
                          </button>
                          <button onClick={() => void deleteBackup(b)} title="Delete this backup" aria-label="Delete backup"
                            className="h-5 rounded px-1 text-muted-foreground hover:text-destructive">
                            <Trash2 className="inline h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Restore guard: type the database name */}
          {restoreFor ? (
            <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-[12px]">
              <p className="font-medium text-destructive">
                Restore database {dbName} from backup {bkField(restoreFor, ["id", "bid", "backup_id"])}?
              </p>
              <p className="mt-0.5 text-muted-foreground">
                The database's CURRENT data will be replaced by this backup. Type the database name to confirm.
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                <input value={restoreTyped} onChange={(e) => setRestoreTyped(e.target.value)} placeholder={dbName ?? ""} aria-label="Type the database name to confirm"
                  className="h-7 w-44 rounded-md border border-border bg-editor px-2 font-mono outline-none focus:border-destructive/60" />
                <button onClick={() => void confirmRestore()} disabled={restoreTyped !== dbName}
                  className="h-7 rounded-md bg-destructive px-2.5 text-[12px] font-medium text-white hover:bg-destructive/85 disabled:opacity-40">
                  Restore
                </button>
                <button onClick={() => { setRestoreFor(null); setRestoreTyped(""); }} className="h-7 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:text-foreground">
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
