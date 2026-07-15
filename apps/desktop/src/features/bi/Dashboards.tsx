import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import { worker as pspWorker } from "@perspective-dev/client";
import "@perspective-dev/viewer";
import "@perspective-dev/viewer-datagrid";
import { PerspectiveViewer } from "@perspective-dev/react";
import "@perspective-dev/viewer/dist/css/themes.css";
import GridLayout, { type LayoutItem } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import {
  ArrowLeft,
  BarChart3,
  Loader2,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import { AgentMark } from "@/components/studio/AgentMark";
import { dashboards, type Dashboard, type DashPanel } from "@/lib/agent-client";
import { errorMessage, ipc, type StatementResult } from "@/lib/ipc";
import { cn } from "@/lib/utils";

// The Dashboards view: agent-built JSON specs rendered with ECharts on a
// 12-column grid. Panel SQL runs through the app's own query engine on the
// active connection — no external BI server.

const PALETTE = ["#5fc33b", "#4fa823", "#8ed16f", "#2f7d14", "#b5e3a1", "#1f5c0d", "#d3efc7"];

// One shared Perspective WASM worker for all table panels (lazy).
let pspClientPromise: ReturnType<typeof pspWorker> | null = null;
function pspClient() {
  return (pspClientPromise ??= pspWorker());
}

export function DashboardsTab({
  profileId,
  connectionName,
}: {
  profileId: string | null;
  connectionName: string;
}) {
  const [list, setList] = useState<Awaited<ReturnType<typeof dashboards.list>>>([]);
  const [open, setOpen] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setList(await dashboards.list());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 5000); // pick up agent-created dashboards
    return () => clearInterval(t);
  }, [refresh]);

  if (open) {
    return (
      <DashboardView
        dash={open}
        profileId={profileId}
        connectionName={connectionName}
        onBack={() => {
          setOpen(null);
          void refresh();
        }}
      />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-editor">
      <div className="mx-auto w-full max-w-[1100px] px-8 py-6">
        <div className="mb-1 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h1 className="font-heading text-[20px] font-bold text-foreground">Dashboards</h1>
        </div>
        <p className="mb-5 text-[12.5px] text-muted-foreground">
          Live dashboards on your Exasol data. Ask the AI to build one — try{" "}
          <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px]">
            “build me a revenue dashboard”
          </span>
          .
        </p>
        {error ? (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px]">{error}</div>
        ) : null}
        {list.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
            <AgentMark className="h-8 w-8 text-primary" />
            <p className="text-[13.5px] font-medium text-foreground">No dashboards yet</p>
            <p className="max-w-sm text-[12px] text-muted-foreground">
              Open the Exasol AI panel and describe the dashboard you want — the agent verifies the SQL and builds it here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.map((d) => (
              <div
                key={d.id}
                className="group cursor-pointer rounded-xl border border-border bg-panel/60 p-4 transition-colors hover:border-primary/40"
                onClick={() => void dashboards.get(d.id).then(setOpen)}
              >
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13.5px] font-semibold text-foreground">{d.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void dashboards.remove(d.id).then(refresh);
                    }}
                    className="ml-auto hidden h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground group-hover:flex hover:text-destructive"
                    aria-label="Delete dashboard"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {d.description ? (
                  <p className="mt-0.5 line-clamp-2 text-[11.5px] text-muted-foreground">{d.description}</p>
                ) : null}
                <p className="mt-2 font-mono text-[10.5px] text-muted-foreground">
                  {d.panels} panel{d.panels === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────── Dashboard view ────────────────────────── */

function DashboardView({
  dash,
  profileId,
  connectionName,
  onBack,
}: {
  dash: Dashboard;
  profileId: string | null;
  connectionName: string;
  onBack: () => void;
}) {
  const [nonce, setNonce] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1100);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const layout: LayoutItem[] = useMemo(
    () => dash.panels.map((p) => ({ i: p.id, x: p.grid.x, y: p.grid.y, w: p.grid.w, h: p.grid.h })),
    [dash],
  );

  function persistLayout(next: readonly LayoutItem[]) {
    const updated: Dashboard = {
      ...dash,
      panels: dash.panels.map((p) => {
        const l = next.find((x) => x.i === p.id);
        return l ? { ...p, grid: { x: l.x, y: l.y, w: l.w, h: l.h } } : p;
      }),
    };
    void dashboards.save(updated).catch(() => undefined);
  }

  return (
    <div className="flex h-full flex-col bg-editor">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <button
          onClick={onBack}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          aria-label="Back to dashboards"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <span className="truncate text-[13px] font-semibold text-foreground">{dash.title}</span>
        {!profileId ? (
          <span className="rounded bg-warning/15 px-1.5 py-px text-[9px] font-medium uppercase text-warning">
            not connected
          </span>
        ) : null}
        <button
          onClick={() => setNonce((n) => n + 1)}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          aria-label="Refresh all panels"
          title="Refresh"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
        </button>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto p-2">
        <GridLayout
          layout={layout}
          width={width - 8}
          gridConfig={{ cols: 12, rowHeight: 44, margin: [8, 8] }}
          dragConfig={{ handle: ".dash-panel-title" }}
          onLayoutChange={persistLayout}
        >
          {dash.panels.map((p) => (
            <div key={p.id} className="overflow-hidden rounded-xl border border-border bg-panel/70">
              <Panel panel={p} profileId={profileId} connectionName={connectionName} nonce={nonce} />
            </div>
          ))}
        </GridLayout>
      </div>
    </div>
  );
}

/* ────────────────────────── Panels ────────────────────────── */

function Panel({
  panel,
  profileId,
  connectionName,
  nonce,
}: {
  panel: DashPanel;
  profileId: string | null;
  connectionName: string;
  nonce: number;
}) {
  const [result, setResult] = useState<StatementResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    setLoading(true);
    ipc
      .executeSql(profileId, connectionName, panel.query.sql, panel.viz.type === "table" ? 50000 : 5000, false)
      .then((res) => {
        if (cancelled) return;
        const first = res.results.find((r) => r.kind === "resultSet") ?? res.results[0];
        if (!first || first.error) setError(first?.error ?? "no result");
        else {
          setResult(first);
          setError(null);
        }
      })
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [profileId, connectionName, panel.query.sql, nonce]);

  return (
    <div className="flex h-full flex-col">
      <div className="dash-panel-title flex shrink-0 cursor-move items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5">
        <span className="truncate text-[11.5px] font-medium text-foreground">{panel.title || "Panel"}</span>
        {loading ? <Loader2 className="ml-auto h-3 w-3 animate-spin text-muted-foreground" /> : null}
      </div>
      <div className="min-h-0 flex-1">
        {!profileId ? (
          <Hint text="Connect to a database to load this panel." />
        ) : error ? (
          <Hint text={error} error />
        ) : !result ? (
          <Hint text="Loading…" />
        ) : panel.viz.type === "kpi" ? (
          <KpiPanel panel={panel} result={result} />
        ) : panel.viz.type === "table" ? (
          <PerspectiveTable result={result} />
        ) : (
          <ChartPanel panel={panel} result={result} />
        )}
      </div>
    </div>
  );
}

function Hint({ text, error }: { text: string; error?: boolean }) {
  return (
    <div className="flex h-full items-center justify-center px-3 text-center">
      <p className={cn("text-[11px]", error ? "text-destructive" : "text-muted-foreground")}>{text}</p>
    </div>
  );
}

function KpiPanel({ panel, result }: { panel: DashPanel; result: StatementResult }) {
  const viz = panel.viz as Extract<DashPanel["viz"], { type: "kpi" }>;
  const field = viz.valueField?.toUpperCase();
  const idx = field ? result.columns.findIndex((c) => c.name === field) : 0;
  const raw = result.rows[0]?.[Math.max(idx, 0)];
  const num = typeof raw === "number" ? raw : Number(raw);
  const display = Number.isFinite(num)
    ? Math.abs(num) >= 1e9
      ? `${(num / 1e9).toFixed(2)}B`
      : Math.abs(num) >= 1e6
        ? `${(num / 1e6).toFixed(2)}M`
        : Math.abs(num) >= 1e3
          ? `${(num / 1e3).toFixed(1)}K`
          : `${num}`
    : String(raw ?? "—");
  return (
    <div className="flex h-full flex-col items-center justify-center gap-0.5">
      <span className="font-heading text-[28px] font-bold tabular-nums text-foreground">{display}</span>
      {viz.unit ? <span className="text-[11px] text-muted-foreground">{viz.unit}</span> : null}
    </div>
  );
}

/**
 * Big-data table: FINOS Perspective (Rust/WASM) pivots hundreds of thousands
 * of rows client-side without breaking a sweat. Falls back to the simple
 * table if the WASM engine fails to load.
 */
function PerspectiveTable({ result }: { result: StatementResult }) {
  const [table, setTable] = useState<unknown | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!result.rows.length) return; // empty → simple table below
    let cancelled = false;
    let created: { delete?: () => Promise<void> } | null = null;
    (async () => {
      try {
        const client = await pspClient();
        const rows = result.rows.map((r) =>
          Object.fromEntries(result.columns.map((c, i) => [c.name, r[i] as string | number | boolean | null])),
        );
        const t = await client.table(rows);
        created = t as unknown as { delete?: () => Promise<void> };
        if (!cancelled) setTable(t);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      void created?.delete?.()?.catch(() => undefined);
    };
  }, [result]);

  if (failed || !result.rows.length) return <TablePanel result={result} />;
  if (!table) return <Hint text="Loading table engine…" />;
  const dark = document.documentElement.classList.contains("dark");
  return (
    <PerspectiveViewer
      client={table as never}
      config={{ plugin: "Datagrid", theme: dark ? "Pro Dark" : "Pro", settings: false }}
      style={{ height: "100%", width: "100%" }}
    />
  );
}

function TablePanel({ result }: { result: StatementResult }) {
  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-panel">
          <tr>
            {result.columns.map((c) => (
              <th key={c.name} className="border-b border-border px-2 py-1 text-left font-medium text-muted-foreground">
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.slice(0, 200).map((r, i) => (
            <tr key={i} className="odd:bg-secondary/30">
              {r.map((v, j) => (
                <td key={j} className="px-2 py-1 text-foreground">
                  {v === null ? <span className="text-muted-foreground">∅</span> : String(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartPanel({ panel, result }: { panel: DashPanel; result: StatementResult }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const viz = panel.viz as Extract<DashPanel["viz"], { type: "echarts" }>;

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const cols = result.columns.map((c) => c.name);
    const xIdx = viz.xField ? Math.max(cols.indexOf(viz.xField.toUpperCase()), 0) : 0;
    const isNumCol = (i: number) => result.rows.some((r) => typeof r[i] === "number");
    const yIdxs = viz.yFields?.length
      ? viz.yFields.map((f) => cols.indexOf(f.toUpperCase())).filter((i) => i >= 0)
      : cols.map((_, i) => i).filter((i) => i !== xIdx && isNumCol(i));
    const styles = getComputedStyle(document.documentElement);
    const fg = styles.getPropertyValue("--muted-foreground").trim() || "#888";
    const border = styles.getPropertyValue("--border").trim() || "#333";

    const categories = result.rows.map((r) => String(r[xIdx] ?? ""));
    const series =
      viz.chart === "pie"
        ? [
            {
              type: "pie" as const,
              radius: ["35%", "70%"],
              itemStyle: { borderRadius: 4 },
              label: { color: fg, fontSize: 10 },
              data: result.rows.map((r) => ({ name: String(r[xIdx] ?? ""), value: Number(r[yIdxs[0] ?? 1]) || 0 })),
            },
          ]
        : yIdxs.map((yi) => ({
            name: cols[yi],
            type: (viz.chart === "area" ? "line" : viz.chart) as "line" | "bar" | "scatter",
            ...(viz.chart === "area" ? { areaStyle: { opacity: 0.25 } } : {}),
            ...(viz.stacked ? { stack: "total" } : {}),
            smooth: viz.chart !== "bar",
            symbolSize: viz.chart === "scatter" ? 8 : 4,
            data: result.rows.map((r) => Number(r[yi]) || 0),
          }));

    chart.setOption(
      {
        color: PALETTE,
        grid: { left: 44, right: 12, top: 24, bottom: 26 },
        tooltip: { trigger: viz.chart === "pie" ? "item" : "axis" },
        legend:
          series.length > 1 && viz.chart !== "pie"
            ? { top: 2, textStyle: { color: fg, fontSize: 10 }, icon: "circle" }
            : undefined,
        ...(viz.chart !== "pie"
          ? {
              xAxis: {
                type: "category",
                data: categories,
                axisLabel: { color: fg, fontSize: 10 },
                axisLine: { lineStyle: { color: border } },
              },
              yAxis: {
                type: "value",
                axisLabel: { color: fg, fontSize: 10 },
                splitLine: { lineStyle: { color: border, opacity: 0.5 } },
              },
            }
          : {}),
        series,
      },
      true,
    );
  }, [result, viz]);

  return <div ref={ref} className="h-full w-full" />;
}
