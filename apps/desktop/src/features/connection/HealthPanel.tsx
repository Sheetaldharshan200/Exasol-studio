import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, HardDrive, HeartPulse, Loader2, RefreshCcw } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { ipc, type StatementResult } from "@/lib/ipc";
import { ResultsGrid } from "@/components/studio/HistoryDock";

/**
 * Per-connection Health tab (issue #45): the database's vital signs in one
 * place — status KPIs up top, then load / memory / storage trends from the
 * statistics views, with a time-range filter. Replaces the old dashboard
 * entry points; deep detail (users, sessions, logs) lives in the DBA and
 * Logs tabs.
 */
type Range = { id: string; label: string; hours: number };
const RANGES: Range[] = [
  { id: "1h", label: "1h", hours: 1 },
  { id: "6h", label: "6h", hours: 6 },
  { id: "24h", label: "24h", hours: 24 },
];

type Section = "overview" | "storage" | "events";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "storage", label: "Storage" },
  { id: "events", label: "System events" },
];

type Point = Record<string, unknown>;

function rowsToPoints(set: StatementResult): Point[] {
  const cols = set.columns.map((c) => c.name.toUpperCase());
  return set.rows
    .map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])))
    .reverse(); // charts read left → right in time
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export function HealthPanel({ profileId, connectionName }: { profileId: string; connectionName: string }) {
  const [section, setSection] = useState<Section>("overview");
  const [range, setRange] = useState("6h");
  const [loading, setLoading] = useState(false);
  const [kpis, setKpis] = useState<{ sessions?: number; version?: string; nodes?: string; rawGiB?: number; memGiB?: number; lastStartup?: string }>({});
  const [monitor, setMonitor] = useState<Point[]>([]);
  const [dbSize, setDbSize] = useState<Point[]>([]);
  const [events, setEvents] = useState<StatementResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const q = useCallback(
    async (sql: string, maxRows = 1000) => {
      const res = await ipc.executeSql(profileId, connectionName, sql, maxRows, false).catch(() => null);
      const set = res?.results.find((r) => r.kind === "resultSet");
      return res?.success && set ? set : null;
    },
    [profileId, connectionName],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hours = RANGES.find((r) => r.id === range)?.hours ?? 6;
      const [sess, meta, size, mon, ev, startup] = await Promise.all([
        q("SELECT COUNT(*) FROM SYS.EXA_ALL_SESSIONS", 1),
        q("SELECT PARAM_NAME, PARAM_VALUE FROM SYS.EXA_METADATA WHERE PARAM_NAME IN ('databaseProductVersion', 'nodeCount')", 10),
        q(`SELECT * FROM EXA_STATISTICS.EXA_DB_SIZE_LAST_DAY WHERE MEASURE_TIME > ADD_HOURS(CURRENT_TIMESTAMP, -${hours}) ORDER BY MEASURE_TIME DESC`, 500),
        q(`SELECT * FROM EXA_STATISTICS.EXA_MONITOR_LAST_DAY WHERE MEASURE_TIME > ADD_HOURS(CURRENT_TIMESTAMP, -${hours}) ORDER BY MEASURE_TIME DESC`, 500),
        q("SELECT MEASURE_TIME, EVENT_TYPE, DBMS_VERSION, NODES, DB_RAM_SIZE, PARAMETERS FROM EXA_STATISTICS.EXA_SYSTEM_EVENTS ORDER BY MEASURE_TIME DESC", 200),
        q("SELECT MAX(MEASURE_TIME) FROM EXA_STATISTICS.EXA_SYSTEM_EVENTS WHERE EVENT_TYPE = 'STARTUP'", 1),
      ]);
      if (!sess && !mon && !size) {
        setError("This connection exposes no statistics views (SYS/EXA_STATISTICS access is required).");
        return;
      }
      const metaRec = meta ? Object.fromEntries(meta.rows.map((r) => [String(r[0]), String(r[1])])) : {};
      const sizePoints = size ? rowsToPoints(size) : [];
      const latestSize = sizePoints[sizePoints.length - 1];
      setKpis({
        sessions: sess ? (num(sess.rows[0]?.[0]) ?? undefined) : undefined,
        version: metaRec.databaseProductVersion,
        nodes: metaRec.nodeCount,
        rawGiB: latestSize ? (num(latestSize.RAW_OBJECT_SIZE) ?? undefined) : undefined,
        memGiB: latestSize ? (num(latestSize.MEM_OBJECT_SIZE) ?? undefined) : undefined,
        lastStartup: startup?.rows[0]?.[0] ? String(startup.rows[0][0]) : undefined,
      });
      setMonitor(mon ? rowsToPoints(mon) : []);
      setDbSize(sizePoints);
      setEvents(ev);
    } finally {
      setLoading(false);
    }
  }, [q, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const monitorKeys = useMemo(() => {
    const first = monitor[0] ?? {};
    const has = (k: string) => num(first[k]) !== null || monitor.some((p) => num(p[k]) !== null);
    return {
      load: has("LOAD") ? "LOAD" : null,
      cpu: has("CPU") ? "CPU" : null,
      tempRam: has("TEMP_DB_RAM") ? "TEMP_DB_RAM" : null,
      hddRead: has("HDD_READ") ? "HDD_READ" : null,
      hddWrite: has("HDD_WRITE") ? "HDD_WRITE" : null,
    };
  }, [monitor]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      {/* Toolbar */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
        <HeartPulse className="ml-1 h-4 w-4 text-primary" />
        <span className="mr-1 text-[13px] font-semibold">Health</span>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={cn(
              "flex h-6 items-center rounded-md px-2.5 text-[12px] font-medium transition-colors",
              section === s.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-0.5 rounded-md border border-border p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={cn(
                "h-5 rounded px-1.5 text-[11px] transition-colors",
                range === r.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => void load()}
          title="Refresh"
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4 [scrollbar-width:thin]">
        {error ? (
          <div className="flex h-full items-center justify-center px-6 text-center font-mono text-[11.5px] text-muted-foreground">{error}</div>
        ) : section === "events" ? (
          <div className="h-full min-h-[300px] overflow-hidden rounded-lg border border-border">
            <ResultsGrid result={events} error={null} hideToolbar />
          </div>
        ) : section === "storage" ? (
          <div className="space-y-4">
            <ChartCard title="Database size (GiB)" icon={HardDrive}>
              <TrendChart
                data={dbSize}
                series={[
                  { key: "RAW_OBJECT_SIZE", label: "raw", color: "var(--primary)" },
                  { key: "MEM_OBJECT_SIZE", label: "in-memory", color: "#6db3f2" },
                ]}
              />
            </ChartCard>
            <ChartCard title="Temp DB RAM (GiB)" icon={Activity}>
              <TrendChart data={dbSize} series={[{ key: "TEMP_SIZE", label: "temp", color: "#e9a94f" }]} fallbackKeys={["TEMP_DB_RAM_SIZE"]} />
            </ChartCard>
          </div>
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Kpi label="Active sessions" value={kpis.sessions?.toString() ?? "—"} />
              <Kpi label="Version" value={kpis.version ?? "—"} />
              <Kpi label="Nodes" value={kpis.nodes ?? "—"} />
              <Kpi label="Raw size" value={kpis.rawGiB !== undefined ? `${kpis.rawGiB.toFixed(1)} GiB` : "—"} />
              <Kpi label="Last startup" value={kpis.lastStartup ?? "—"} mono />
            </div>
            <div className="mt-4 space-y-4">
              {monitorKeys.load || monitorKeys.cpu ? (
                <ChartCard title="Load / CPU" icon={Activity}>
                  <TrendChart
                    data={monitor}
                    series={[
                      ...(monitorKeys.load ? [{ key: "LOAD", label: "load", color: "var(--primary)" }] : []),
                      ...(monitorKeys.cpu ? [{ key: "CPU", label: "cpu %", color: "#6db3f2" }] : []),
                    ]}
                  />
                </ChartCard>
              ) : null}
              {monitorKeys.tempRam ? (
                <ChartCard title="Temp DB RAM (GiB)" icon={Activity}>
                  <TrendChart data={monitor} series={[{ key: "TEMP_DB_RAM", label: "temp ram", color: "#e9a94f" }]} />
                </ChartCard>
              ) : null}
              {monitorKeys.hddRead || monitorKeys.hddWrite ? (
                <ChartCard title="Disk I/O (MiB/s)" icon={HardDrive}>
                  <TrendChart
                    data={monitor}
                    series={[
                      ...(monitorKeys.hddRead ? [{ key: "HDD_READ", label: "read", color: "#5fd0c0" }] : []),
                      ...(monitorKeys.hddWrite ? [{ key: "HDD_WRITE", label: "write", color: "#d8605a" }] : []),
                    ]}
                  />
                </ChartCard>
              ) : null}
              {monitor.length === 0 && !loading ? (
                <p className="text-[12px] text-muted-foreground">No monitor samples in this range yet — statistics fill in as the database runs.</p>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-panel/60 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 truncate text-[13.5px] text-foreground", mono && "font-mono text-[12px]")} title={value}>
        {value}
      </div>
    </div>
  );
}

function ChartCard({ title, icon: IconCmp, children }: { title: string; icon: typeof Activity; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-panel/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <IconCmp className="h-3.5 w-3.5 text-primary" />
        <span className="text-[12.5px] font-semibold">{title}</span>
      </div>
      {children}
    </div>
  );
}

function TrendChart({
  data,
  series,
  fallbackKeys,
}: {
  data: Point[];
  series: { key: string; label: string; color: string }[];
  fallbackKeys?: string[];
}) {
  // Column names vary slightly across versions — substitute a fallback key
  // when the primary one is absent.
  const resolved = series.map((s) => {
    if (data.some((p) => p[s.key] !== undefined)) return s;
    const alt = fallbackKeys?.find((k) => data.some((p) => p[k] !== undefined));
    return alt ? { ...s, key: alt } : s;
  });
  const points = data.map((p) => ({
    time: String(p.MEASURE_TIME ?? "").slice(11, 16) || String(p.MEASURE_TIME ?? ""),
    ...Object.fromEntries(resolved.map((s) => [s.key, num(p[s.key])])),
  }));
  if (points.length === 0) {
    return <div className="flex h-32 items-center justify-center text-[12px] text-muted-foreground">No samples in this range.</div>;
  }
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="time" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} minTickGap={40} />
          <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} width={52} />
          <Tooltip
            contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: "var(--muted-foreground)" }}
          />
          {resolved.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={1.8} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
