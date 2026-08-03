import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Pause, Play, RefreshCcw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorMessage, ipc, type StatementResult } from "@/lib/ipc";
import { ResultsGrid } from "@/components/studio/HistoryDock";

/**
 * Per-connection Logs tab (issue #45): everything the database recorded about
 * this connection — executed statements, live sessions, and system events —
 * with text search, error/time filters, and live auto-refresh.
 *
 * Each source lists candidate system views richest-first (DBA views need the
 * right privileges; audit views need auditing on) and remembers the first one
 * this database accepts.
 */
type Source = "statements" | "sessions" | "events";

const SOURCES: { id: Source; label: string }[] = [
  { id: "statements", label: "Statements" },
  { id: "sessions", label: "Sessions (live)" },
  { id: "events", label: "System events" },
];

const RANGES: { id: string; label: string; hours: number }[] = [
  { id: "1h", label: "Last hour", hours: 1 },
  { id: "6h", label: "Last 6 h", hours: 6 },
  { id: "24h", label: "Last 24 h", hours: 24 },
];

/** Candidate queries per source; {H} is the range in hours. */
const ATTEMPTS: Record<Source, string[]> = {
  statements: [
    `SELECT SESSION_ID, STMT_ID, COMMAND_NAME, COMMAND_CLASS, START_TIME, DURATION, SUCCESS, ERROR_TEXT, ROW_COUNT, SQL_TEXT FROM EXA_STATISTICS.EXA_DBA_AUDIT_SQL WHERE START_TIME > ADD_HOURS(CURRENT_TIMESTAMP, -{H}) ORDER BY START_TIME DESC`,
    `SELECT SESSION_ID, STMT_ID, COMMAND_NAME, COMMAND_CLASS, START_TIME, DURATION, SUCCESS, ERROR_TEXT, ROW_COUNT, SQL_TEXT FROM EXA_STATISTICS.EXA_USER_SQL_LAST_DAY WHERE START_TIME > ADD_HOURS(CURRENT_TIMESTAMP, -{H}) ORDER BY START_TIME DESC`,
    `SELECT * FROM EXA_STATISTICS.EXA_USER_SQL_LAST_DAY WHERE START_TIME > ADD_HOURS(CURRENT_TIMESTAMP, -{H}) ORDER BY START_TIME DESC`,
  ],
  sessions: [
    `SELECT SESSION_ID, USER_NAME, STATUS, COMMAND_NAME, DURATION, LOGIN_TIME, CLIENT, DRIVER, OS_USER, HOST, ACTIVITY, TEMP_DB_RAM, RESOURCES FROM SYS.EXA_ALL_SESSIONS ORDER BY LOGIN_TIME DESC`,
    `SELECT * FROM SYS.EXA_ALL_SESSIONS ORDER BY LOGIN_TIME DESC`,
  ],
  events: [
    `SELECT MEASURE_TIME, EVENT_TYPE, DBMS_VERSION, NODES, DB_RAM_SIZE, PARAMETERS FROM EXA_STATISTICS.EXA_SYSTEM_EVENTS ORDER BY MEASURE_TIME DESC`,
    `SELECT * FROM EXA_STATISTICS.EXA_SYSTEM_EVENTS ORDER BY MEASURE_TIME DESC`,
  ],
};

const REFRESH_MS = 5000;

export function LogsPanel({ profileId, connectionName }: { profileId: string; connectionName: string }) {
  const [source, setSource] = useState<Source>("statements");
  const [search, setSearch] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [range, setRange] = useState("1h");
  const [live, setLive] = useState(true);
  const [result, setResult] = useState<StatementResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  // The first candidate view this database accepted, per source.
  const workingAttempt = useRef<Partial<Record<Source, number>>>({});
  const inflight = useRef(false);

  const load = useCallback(
    async (flush: boolean) => {
      if (inflight.current) return;
      inflight.current = true;
      setLoading(true);
      try {
        if (flush) await ipc.executeSql(profileId, connectionName, "FLUSH STATISTICS", 1, false).catch(() => null);
        const hours = RANGES.find((r) => r.id === range)?.hours ?? 1;
        const attempts = ATTEMPTS[source];
        const startAt = workingAttempt.current[source] ?? 0;
        let lastErr = "";
        for (let i = startAt; i < attempts.length; i++) {
          const sql = attempts[i].replaceAll("{H}", String(hours));
          const res = await ipc.executeSql(profileId, connectionName, sql, 1000, false).catch((e) => {
            lastErr = errorMessage(e);
            return null;
          });
          const set = res?.results.find((r) => r.kind === "resultSet");
          if (res?.success && set) {
            workingAttempt.current[source] = i;
            setResult(set);
            setError(null);
            setRefreshedAt(Date.now());
            return;
          }
          if (res && !res.success) lastErr = res.results.find((r) => r.error)?.error ?? lastErr;
        }
        setError(lastErr || "No log source available on this database.");
      } finally {
        inflight.current = false;
        setLoading(false);
      }
    },
    [profileId, connectionName, source, range],
  );

  // Initial + on source/range change (manual refresh flushes statistics so
  // the freshest rows are queryable; the live poll skips the flush).
  useEffect(() => {
    setResult(null);
    void load(true);
  }, [load]);
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => void load(false), REFRESH_MS);
    return () => window.clearInterval(t);
  }, [live, load]);

  // Errors-only: keep rows whose SUCCESS column is false or ERROR_TEXT is set.
  const filtered = (() => {
    if (!result || !errorsOnly) return result;
    const cols = result.columns.map((c) => c.name.toUpperCase());
    const successIdx = cols.indexOf("SUCCESS");
    const errIdx = cols.indexOf("ERROR_TEXT");
    if (successIdx < 0 && errIdx < 0) return result;
    const rows = result.rows.filter(
      (r) =>
        (successIdx >= 0 && String(r[successIdx]).toLowerCase() === "false") ||
        (errIdx >= 0 && r[errIdx] !== null && r[errIdx] !== ""),
    );
    return { ...result, rows, rowCount: rows.length };
  })();

  const hasErrorFilter = source === "statements";

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      {/* Toolbar */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            onClick={() => setSource(s.id)}
            className={cn(
              "flex h-6 items-center rounded-md px-2.5 text-[12px] font-medium transition-colors",
              source === s.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
        <div className="mx-1 h-5 w-px bg-border" />
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs…"
            className="h-6 w-44 rounded-md border border-border bg-panel pl-6 pr-2 text-[12px] outline-none focus:border-primary/50"
          />
        </div>
        {hasErrorFilter ? (
          <button
            onClick={() => setErrorsOnly((v) => !v)}
            className={cn(
              "flex h-6 items-center gap-1 rounded-md px-2 text-[12px] transition-colors",
              errorsOnly ? "bg-destructive/15 text-destructive" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <AlertTriangle className="h-3 w-3" /> Errors
          </button>
        ) : null}
        {source !== "sessions" ? (
          <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={cn(
                  "h-5 rounded px-1.5 text-[11px] transition-colors",
                  range === r.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r.id}
              </button>
            ))}
          </div>
        ) : null}
        <div className="ml-auto flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
          {filtered ? `${filtered.rowCount} rows` : ""}
          {refreshedAt ? ` · ${new Date(refreshedAt).toLocaleTimeString([], { hour12: false })}` : ""}
        </div>
        <button
          onClick={() => setLive((v) => !v)}
          title={live ? "Pause live refresh" : "Resume live refresh (5s)"}
          className={cn(
            "flex h-6 items-center gap-1 rounded-md px-2 text-[12px] transition-colors",
            live ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {live ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />} Live
        </button>
        <button
          onClick={() => void load(true)}
          title="Refresh now (flushes statistics)"
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1">
        {error && !filtered ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
            <AlertTriangle className="h-6 w-6 opacity-40" />
            <p className="max-w-xl font-mono text-[11.5px] leading-relaxed">{error}</p>
          </div>
        ) : filtered ? (
          <ResultsGrid result={filtered} error={null} filterQuery={search} hideToolbar />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
      </div>
    </div>
  );
}
