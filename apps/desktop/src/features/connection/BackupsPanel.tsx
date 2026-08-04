import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, DatabaseBackup, Loader2, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorMessage, ipc, isTauri, type BackupRunResult, type StatementResult } from "@/lib/ipc";
import { ResultsGrid } from "@/components/studio/HistoryDock";

/**
 * Per-connection Backups tab (issue #45): what the database recorded about
 * backups (EXA_SYSTEM_EVENTS BACKUP_* events — last backup, full history)
 * plus per-connection backup schedules. Schedules are stored in app settings;
 * Exasol runs backups through its admin layer (EXAoperation / c4 / confd),
 * not over the SQL websocket, so Studio keeps the plan and the evidence
 * side by side and says so.
 */
import { describeSchedule, nextRun, systemZone, type BackupSchedule } from "@/lib/backup-schedule";
import { NumberInput } from "@/components/ui/number-input";
import { NativeBackupsSection } from "./NativeBackupsSection";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const ALL_ZONES: string[] = (() => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC", "Europe/Berlin", "Asia/Kolkata", "America/New_York"];
  }
})();

const settingsKey = (profileId: string) => `backupSchedules_${profileId}`;
const runsKey = (profileId: string) => `backupRuns_${profileId}`;

export type BackupRun = BackupRunResult & { at: number };

export function BackupsPanel({ profileId, connectionName, dbHost }: { profileId: string; connectionName: string; dbHost?: string }) {
  const [history, setHistory] = useState<StatementResult | null>(null);
  const [lastBackup, setLastBackup] = useState<{ time: string; type: string } | null>(null);
  const [dbInfo, setDbInfo] = useState<{ version?: string; nodes?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<BackupSchedule[]>([]);
  const [draft, setDraft] = useState<BackupSchedule | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [progress, setProgress] = useState<{ table: string; done: number; total: number } | null>(null);
  const [runs, setRuns] = useState<BackupRun[]>([]);

  // Live per-table progress while a backup streams.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<{ table: string; done: number; total: number }>(`backup-progress:${profileId}`, (e) => setProgress(e.payload));
    })();
    return () => unlisten?.();
  }, [profileId]);

  async function backupNow() {
    if (backingUp) return;
    setBackingUp(true);
    setProgress(null);
    try {
      const res = await ipc.backupNow(profileId, connectionName);
      const run: BackupRun = { ...res, at: Date.now() };
      const next = [run, ...runs].slice(0, 10);
      setRuns(next);
      ipc.setAppSettings({ [runsKey(profileId)]: JSON.stringify(next) }).catch(() => undefined);
      window.dispatchEvent(
        new CustomEvent("studio:notice", {
          detail: {
            kind: res.skipped.length ? "warning" : "success",
            title: `Backup complete — ${connectionName}`,
            body: `${res.tables} tables, ${res.rows.toLocaleString()} rows in ${(res.elapsedMs / 1000).toFixed(1)}s → ${res.dir}${res.skipped.length ? ` (${res.skipped.length} skipped)` : ""}`,
          },
        }),
      );
    } catch (e) {
      window.dispatchEvent(
        new CustomEvent("studio:notice", {
          detail: { kind: "warning", title: `Backup failed — ${connectionName}`, body: errorMessage(e) },
        }),
      );
    } finally {
      setBackingUp(false);
      setProgress(null);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ipc
        .executeSql(
          profileId,
          connectionName,
          "SELECT MEASURE_TIME, EVENT_TYPE, DBMS_VERSION, NODES, DB_RAM_SIZE, PARAMETERS FROM EXA_STATISTICS.EXA_SYSTEM_EVENTS WHERE EVENT_TYPE LIKE 'BACKUP%' OR EVENT_TYPE LIKE 'RESTORE%' ORDER BY MEASURE_TIME DESC",
          500,
          false,
        )
        .catch((e) => {
          setError(errorMessage(e));
          return null;
        });
      const set = res?.results.find((r) => r.kind === "resultSet");
      if (res?.success && set) {
        setHistory(set);
        setError(null);
        const cols = set.columns.map((c) => c.name.toUpperCase());
        const t = cols.indexOf("MEASURE_TIME");
        const e = cols.indexOf("EVENT_TYPE");
        const done = set.rows.find((r) => String(r[e] ?? "").toUpperCase().includes("BACKUP"));
        setLastBackup(done ? { time: String(done[t] ?? ""), type: String(done[e] ?? "") } : null);
      } else if (res && !res.success) {
        setError(res.results.find((r) => r.error)?.error ?? "Could not read EXA_SYSTEM_EVENTS.");
      }
      const meta = await ipc
        .executeSql(
          profileId,
          connectionName,
          "SELECT PARAM_NAME, PARAM_VALUE FROM SYS.EXA_METADATA WHERE PARAM_NAME IN ('databaseProductVersion', 'nodeCount')",
          10,
          false,
        )
        .catch(() => null);
      const metaSet = meta?.results.find((r) => r.kind === "resultSet");
      if (metaSet) {
        const rec = Object.fromEntries(metaSet.rows.map((r) => [String(r[0]), String(r[1])]));
        setDbInfo({ version: rec.databaseProductVersion, nodes: rec.nodeCount });
      }
    } finally {
      setLoading(false);
    }
  }, [profileId, connectionName]);

  useEffect(() => {
    void load();
  }, [load]);

  // Schedules persist in app settings (per connection); the settings:changed
  // broadcast keeps the list live when the scheduler stamps lastRunAt.
  useEffect(() => {
    const read = (s: Record<string, unknown>) => {
      const raw = s[settingsKey(profileId)];
      if (typeof raw === "string") {
        try {
          setSchedules(JSON.parse(raw) as BackupSchedule[]);
        } catch {
          /* malformed blob — keep current state */
        }
      }
      const rawRuns = s[runsKey(profileId)];
      if (typeof rawRuns === "string") {
        try {
          setRuns(JSON.parse(rawRuns) as BackupRun[]);
        } catch {
          /* malformed blob — keep current state */
        }
      }
    };
    ipc.getAppSettings().then(read).catch(() => undefined);
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<Record<string, unknown>>("settings:changed", (e) => read(e.payload));
    })();
    return () => unlisten?.();
  }, [profileId]);
  function saveSchedules(next: BackupSchedule[]) {
    setSchedules(next);
    ipc.setAppSettings({ [settingsKey(profileId)]: JSON.stringify(next) }).catch(() => undefined);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-editor p-4 [scrollbar-width:thin]">
      {/* Overview cards */}
      <div className="grid shrink-0 grid-cols-3 gap-3">
        <Card title="Last backup">
          {lastBackup ? (
            <>
              <div className="font-mono text-[13px] text-foreground">{lastBackup.time}</div>
              <div className="text-[11px] text-muted-foreground">{lastBackup.type}</div>
            </>
          ) : (
            <div className="text-[12px] text-muted-foreground">No backup events recorded.</div>
          )}
        </Card>
        <Card title="Recorded events">
          <div className="font-mono text-[13px] text-foreground">{history?.rowCount ?? "—"}</div>
          <div className="text-[11px] text-muted-foreground">backup / restore events</div>
        </Card>
        <Card title="Database">
          <div className="font-mono text-[13px] text-foreground">{dbInfo?.version ?? "—"}</div>
          <div className="text-[11px] text-muted-foreground">{dbInfo?.nodes ? `${dbInfo.nodes} node(s)` : ""}</div>
        </Card>
      </div>

      {/* Cluster backups (native, via the Admin API) */}
      <NativeBackupsSection profileId={profileId} connectionName={connectionName} dbHost={dbHost ?? "localhost"} />

      {/* Studio-run logical schedules */}
      <div className="mt-4 shrink-0 rounded-lg border border-border bg-panel/60 p-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <span className="text-[13px] font-semibold">Studio backups (logical CSV)</span>
          <button
            onClick={() => void backupNow()}
            disabled={backingUp}
            title="Run a Studio logical backup now: every user table to CSV plus the reconstructed DDL, saved under ~/ExasolStudioBackups"
            className="ml-auto flex h-6 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-semibold text-primary-foreground hover:bg-primary/85 disabled:opacity-60"
          >
            {backingUp ? <Loader2 className="h-3 w-3 animate-spin" /> : <DatabaseBackup className="h-3 w-3" />}
            {backingUp
              ? progress && progress.total > 0
                ? `Backing up ${progress.done}/${progress.total}…`
                : "Backing up…"
              : "Backup now"}
          </button>
          <button
            onClick={() =>
              setDraft({ id: `sched-${Date.now()}`, label: "Nightly backup", frequency: "daily", time: "02:00", weekday: 0, dayOfMonth: 1, timezone: systemZone(), enabled: true })
            }
            className="flex h-6 items-center gap-1 rounded-md border border-border px-2 text-[12px] text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3 w-3" /> Add schedule
          </button>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Schedules apply to this connection's entire database and run a Studio logical backup — every user table to CSV
          plus the reconstructed DDL, saved under ~/ExasolStudioBackups — at the wall-clock time of the timezone you pick
          (daylight-saving shifts included). Studio checks every minute while it is running; if the computer is off or
          asleep at the scheduled time, the missed run is detected on the next launch and backed up immediately, with a
          notification either way. Exasol's native cluster backups remain in its administration layer (EXAoperation / c4)
          — their recorded events show below.
        </p>
        <div className="mt-2 space-y-1.5">
          {schedules.length === 0 && !draft ? (
            <p className="text-[12px] text-muted-foreground">No schedules yet.</p>
          ) : null}
          {schedules.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-md border border-border/60 bg-panel px-2.5 py-1.5 text-[12px]">
              <button
                role="switch"
                aria-checked={s.enabled}
                onClick={() => saveSchedules(schedules.map((x) => (x.id === s.id ? { ...x, enabled: !x.enabled } : x)))}
                className={cn("relative h-4 w-7 rounded-full transition-colors", s.enabled ? "bg-primary" : "bg-secondary")}
              >
                <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all", s.enabled ? "left-3.5" : "left-0.5")} />
              </button>
              <span className={cn("font-medium", !s.enabled && "text-muted-foreground line-through")}>{s.label}</span>
              <span className="text-muted-foreground">{describeSchedule(s)}</span>
              {s.enabled ? (
                <span
                  className="ml-auto font-mono text-[11px] text-muted-foreground"
                  title="Next run and last handled run, shown in YOUR local time"
                >
                  {s.lastRunAt ? `last: ${new Date(s.lastRunAt).toLocaleString([], { hour12: false })} · ` : ""}
                  next: {nextRun(s, new Date()).toLocaleString([], { hour12: false })} local
                </span>
              ) : (
                <span className="ml-auto" />
              )}
              <button
                aria-label={`Delete ${s.label}`}
                onClick={() => saveSchedules(schedules.filter((x) => x.id !== s.id))}
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          {draft ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-panel p-2 text-[12px]">
              <input
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                className="h-7 min-w-36 flex-1 rounded-md border border-border bg-editor px-2 outline-none focus:border-primary/50"
                aria-label="Schedule name"
              />
              <div className="flex h-7 shrink-0 items-center gap-0.5 rounded-md border border-border px-0.5">
                {(["daily", "weekly", "monthly"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setDraft({ ...draft, frequency: f })}
                    className={cn("h-5.5 rounded px-2 text-[11.5px] transition-colors", draft.frequency === f ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}
                  >
                    {f}
                  </button>
                ))}
              </div>
              {draft.frequency === "weekly" ? (
                <div className="flex h-7 shrink-0 items-center gap-0.5 rounded-md border border-border px-0.5">
                  {WEEKDAYS.map((d, i) => (
                    <button
                      key={d}
                      onClick={() => setDraft({ ...draft, weekday: i })}
                      className={cn("h-5.5 rounded px-1.5 text-[11px] transition-colors", draft.weekday === i ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              ) : null}
              {draft.frequency === "monthly" ? (
                <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                  day
                  <NumberInput
                    value={draft.dayOfMonth ?? 1}
                    min={1}
                    max={31}
                    onCommit={(n) => setDraft({ ...draft, dayOfMonth: n })}
                    className="h-7 w-12 bg-editor text-[12px]"
                    aria-label="Day of month"
                  />
                </label>
              ) : null}
              <input
                value={draft.time}
                onChange={(e) => setDraft({ ...draft, time: e.target.value.replace(/[^\d:]/g, "").slice(0, 5) })}
                className="h-7 w-16 shrink-0 rounded-md border border-border bg-editor px-2 text-center font-mono outline-none focus:border-primary/50"
                aria-label="Time (24h HH:MM)"
                placeholder="02:00"
              />
              <ZonePicker value={draft.timezone ?? systemZone()} onChange={(z) => setDraft({ ...draft, timezone: z })} />
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => {
                    if (/^\d{1,2}:\d{2}$/.test(draft.time)) {
                      saveSchedules([...schedules, draft]);
                      setDraft(null);
                    }
                  }}
                  className="flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85"
                >
                  <Check className="h-3 w-3" /> Save
                </button>
                <button onClick={() => setDraft(null)} className="h-7 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:text-foreground">
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Studio logical backups (Backup now / scheduler runs) */}
      {runs.length > 0 ? (
        <div className="mt-4 shrink-0 rounded-lg border border-border bg-panel/60 p-3">
          <div className="mb-2 flex items-center gap-2">
            <DatabaseBackup className="h-4 w-4 text-primary" />
            <span className="text-[13px] font-semibold">Studio backups</span>
            <span className="text-[11px] text-muted-foreground">CSV + DDL under ~/ExasolStudioBackups</span>
          </div>
          <div className="space-y-1">
            {runs.map((r) => (
              <div key={r.at} className="flex items-center gap-2 rounded-md border border-border/60 bg-panel px-2.5 py-1.5 text-[12px]">
                <span className="font-mono text-muted-foreground">{new Date(r.at).toLocaleString([], { hour12: false })}</span>
                <span>
                  {r.tables} tables · {r.rows.toLocaleString()} rows · {(r.elapsedMs / 1000).toFixed(1)}s
                  {r.skipped.length ? <span className="text-destructive"> · {r.skipped.length} skipped</span> : null}
                </span>
                <button
                  onClick={() => void ipc.revealPath(r.dir).catch(() => undefined)}
                  title={r.dir}
                  className="ml-auto h-5 rounded px-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  Reveal folder
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* History */}
      <div className="mt-4 flex min-h-[240px] flex-1 flex-col rounded-lg border border-border bg-panel/60">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
          <DatabaseBackup className="h-4 w-4 text-primary" />
          <span className="text-[13px] font-semibold">Backup &amp; restore history</span>
          <button
            onClick={() => void load()}
            title="Refresh"
            className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className="min-h-0 flex-1">
          {error ? (
            <div className="flex h-full items-center justify-center px-6 text-center font-mono text-[11.5px] text-muted-foreground">{error}</div>
          ) : history && history.rowCount === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-[12px] text-muted-foreground">
              This database has no recorded backup or restore events yet.
            </div>
          ) : (
            <ResultsGrid result={history} error={null} hideToolbar />
          )}
        </div>
      </div>
    </div>
  );
}

/** IANA timezone combobox: type to filter, click to pick. */
function ZonePicker({ value, onChange }: { value: string; onChange: (zone: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // The FULL IANA list — the dropdown scrolls; typing narrows it.
  const matches = query
    ? ALL_ZONES.filter((z) => z.toLowerCase().includes(query.toLowerCase()))
    : [systemZone(), "UTC", ...ALL_ZONES.filter((z) => z !== "UTC" && z !== systemZone())];
  return (
    <div className="relative">
      <input
        value={open ? query : value}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={value}
        aria-label="Timezone"
        className="h-7 w-44 rounded-md border border-border bg-editor px-2 font-mono text-[11px] outline-none focus:border-primary/50"
      />
      {open ? (
        <div className="absolute left-0 top-8 z-50 max-h-72 w-72 overflow-auto rounded-md border border-border bg-panel shadow-xl [scrollbar-width:thin]">
          {matches.length === 0 ? <div className="px-2 py-1.5 text-[11px] text-muted-foreground">No matching zone.</div> : null}
          {matches.map((z) => (
            <button
              key={z}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(z);
                setOpen(false);
              }}
              className={cn(
                "block w-full px-2 py-1.5 text-left font-mono text-[11px] hover:bg-secondary",
                z === value ? "text-primary" : "text-foreground",
              )}
            >
              {z}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-panel/60 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
