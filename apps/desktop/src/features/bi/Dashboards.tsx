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
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  Trash2,
  X,
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
              Ask the AI to build one — or start from scratch yourself.
            </p>
            <button
              onClick={() =>
                void dashboards
                  .save({
                    version: 1,
                    id: "",
                    title: "Untitled dashboard",
                    description: "",
                    panels: [
                      {
                        id: "p1",
                        title: "New panel",
                        grid: { x: 0, y: 0, w: 6, h: 6 },
                        query: { sql: "SELECT 1 AS VALUE" },
                        viz: { type: "kpi" },
                      },
                    ],
                  })
                  .then(setOpen)
              }
              className="mt-1 flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[12.5px] text-foreground hover:bg-secondary"
            >
              <Plus className="h-3.5 w-3.5 text-primary" /> New dashboard
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <button
              onClick={() =>
                void dashboards
                  .save({
                    version: 1,
                    id: "",
                    title: "Untitled dashboard",
                    description: "",
                    panels: [
                      {
                        id: "p1",
                        title: "New panel",
                        grid: { x: 0, y: 0, w: 6, h: 6 },
                        query: { sql: "SELECT 1 AS VALUE" },
                        viz: { type: "kpi" },
                      },
                    ],
                  })
                  .then(setOpen)
              }
              className="flex min-h-[110px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              <Plus className="h-5 w-5 text-primary" />
              <span className="text-[12.5px] font-medium">New dashboard</span>
            </button>
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
  dash: initial,
  profileId,
  connectionName,
  onBack,
}: {
  dash: Dashboard;
  profileId: string | null;
  connectionName: string;
  onBack: () => void;
}) {
  const [dash, setDash] = useState<Dashboard>(initial);
  const [editing, setEditing] = useState<DashPanel | null>(null);
  const [nonce, setNonce] = useState(0);

  async function saveDash(next: Dashboard) {
    setDash(next);
    await dashboards.save(next).catch(() => undefined);
  }

  function addPanel() {
    const maxY = Math.max(0, ...dash.panels.map((p) => p.grid.y + p.grid.h));
    const panel: DashPanel = {
      id: `p${Date.now().toString(36)}`,
      title: "New panel",
      grid: { x: 0, y: maxY, w: 6, h: 6 },
      query: { sql: "" },
      viz: { type: "table" },
    };
    void saveDash({ ...dash, panels: [...dash.panels, panel] });
    setEditing(panel);
  }
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
          onClick={addPanel}
          className="ml-auto flex h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          title="Add panel"
        >
          <Plus className="h-3.5 w-3.5" /> Panel
        </button>
        <button
          onClick={() => setNonce((n) => n + 1)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
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
            <div key={p.id} className="group/panel overflow-hidden rounded-xl border border-border bg-panel/70">
              <Panel
                panel={p}
                profileId={profileId}
                connectionName={connectionName}
                nonce={nonce}
                onEdit={() => setEditing(p)}
                onDelete={() => {
                  if (dash.panels.length <= 1) return;
                  void saveDash({ ...dash, panels: dash.panels.filter((x) => x.id !== p.id) });
                }}
              />
            </div>
          ))}
        </GridLayout>
      </div>
      {editing ? (
        <PanelEditor
          panel={editing}
          profileId={profileId}
          connectionName={connectionName}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            void saveDash({ ...dash, panels: dash.panels.map((x) => (x.id === next.id ? next : x)) });
            setEditing(null);
            setNonce((n) => n + 1);
          }}
        />
      ) : null}
    </div>
  );
}

/* ────────────────────────── Panels ────────────────────────── */

function Panel({
  panel,
  profileId,
  connectionName,
  nonce,
  onEdit,
  onDelete,
}: {
  panel: DashPanel;
  profileId: string | null;
  connectionName: string;
  nonce: number;
  onEdit: () => void;
  onDelete: () => void;
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
        <span className="ml-auto flex items-center gap-0.5">
          {loading ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : null}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="hidden h-5 w-5 items-center justify-center rounded text-muted-foreground group-hover/panel:flex hover:text-foreground"
            aria-label="Edit panel"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="hidden h-5 w-5 items-center justify-center rounded text-muted-foreground group-hover/panel:flex hover:text-destructive"
            aria-label="Delete panel"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </span>
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
    // Full-control overrides: whatever the human (or agent) put in viz.option
    // merges over the generated chart.
    if (viz.option) chart.setOption(viz.option as Parameters<typeof chart.setOption>[0]);
  }, [result, viz]);

  return <div ref={ref} className="h-full w-full" />;
}

/* ────────────────────────── Panel editor (human control) ────────────────── */

function PanelEditor({
  panel,
  profileId,
  connectionName,
  onSave,
  onClose,
}: {
  panel: DashPanel;
  profileId: string | null;
  connectionName: string;
  onSave: (p: DashPanel) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(panel.title);
  const [sql, setSql] = useState(panel.query.sql);
  const [vizType, setVizType] = useState<"echarts" | "kpi" | "table">(panel.viz.type);
  const ev = panel.viz.type === "echarts" ? panel.viz : null;
  const [chart, setChart] = useState<"bar" | "line" | "area" | "pie" | "scatter">(ev?.chart ?? "bar");
  const [xField, setXField] = useState(ev?.xField ?? "");
  const [yFields, setYFields] = useState((ev?.yFields ?? []).join(", "));
  const [stacked, setStacked] = useState(Boolean(ev?.stacked));
  const [kpiField, setKpiField] = useState(panel.viz.type === "kpi" ? (panel.viz.valueField ?? "") : "");
  const [kpiUnit, setKpiUnit] = useState(panel.viz.type === "kpi" ? (panel.viz.unit ?? "") : "");
  const [optionJson, setOptionJson] = useState(ev?.option ? JSON.stringify(ev.option, null, 2) : "");
  const [preview, setPreview] = useState<StatementResult | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [jsonErr, setJsonErr] = useState<string | null>(null);

  async function runPreview() {
    if (!profileId || !sql.trim()) return;
    setRunning(true);
    setPreviewErr(null);
    try {
      const res = await ipc.executeSql(profileId, connectionName, sql, 200, false);
      const first = res.results.find((r) => r.kind === "resultSet") ?? res.results[0];
      if (!first || first.error) setPreviewErr(first?.error ?? "no result");
      else setPreview(first);
    } catch (e) {
      setPreviewErr(errorMessage(e));
    } finally {
      setRunning(false);
    }
  }

  function save() {
    let option: Record<string, unknown> | undefined;
    if (optionJson.trim()) {
      try {
        option = JSON.parse(optionJson) as Record<string, unknown>;
        setJsonErr(null);
      } catch (e) {
        setJsonErr(`Invalid ECharts JSON: ${String(e)}`);
        return;
      }
    }
    const viz: DashPanel["viz"] =
      vizType === "kpi"
        ? { type: "kpi", valueField: kpiField || undefined, unit: kpiUnit || undefined }
        : vizType === "table"
          ? { type: "table" }
          : {
              type: "echarts",
              chart,
              xField: xField || undefined,
              yFields: yFields
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              stacked: stacked || undefined,
              option,
            };
    onSave({ ...panel, title, query: { sql }, viz });
  }

  const cols = preview?.columns.map((c) => c.name) ?? [];

  return (
    <div className="fixed inset-0 z-[9996] flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
      <div className="flex max-h-[85vh] w-[620px] flex-col rounded-2xl border border-border bg-popover shadow-2xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span className="text-[13px] font-semibold text-foreground">Edit panel</span>
          <button
            onClick={onClose}
            className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <label className="block">
            <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8 w-full rounded-lg border border-border bg-editor px-2.5 text-[12.5px] outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
            />
          </label>

          <div>
            <div className="mb-0.5 flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">SQL (the dataset)</span>
              <button
                onClick={() => void runPreview()}
                disabled={running || !profileId || !sql.trim()}
                className="flex h-6 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
              >
                {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Preview
              </button>
            </div>
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              rows={4}
              spellCheck={false}
              placeholder="SELECT region, SUM(revenue) FROM … GROUP BY region"
              className="w-full resize-y rounded-lg border border-border bg-editor px-2.5 py-2 font-mono text-[12px] leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
            />
            {previewErr ? (
              <p className="mt-1 text-[11px] text-destructive">{previewErr}</p>
            ) : preview ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                ✓ {preview.rowCount} rows · columns: {cols.join(", ")}
              </p>
            ) : null}
          </div>

          <div>
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Visualize as</span>
            <div className="flex flex-wrap gap-1.5">
              {(["bar", "line", "area", "pie", "scatter", "kpi", "table"] as const).map((t) => {
                const active = t === "kpi" || t === "table" ? vizType === t : vizType === "echarts" && chart === t;
                return (
                  <button
                    key={t}
                    onClick={() => {
                      if (t === "kpi" || t === "table") setVizType(t);
                      else {
                        setVizType("echarts");
                        setChart(t);
                      }
                    }}
                    className={cn(
                      "flex h-7 items-center rounded-md border px-2.5 text-[11.5px] capitalize transition-colors",
                      active
                        ? "border-primary/50 bg-primary/10 font-medium text-primary"
                        : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {vizType === "echarts" ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <label className="flex-1">
                  <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    X / category column
                  </span>
                  {cols.length ? (
                    <select
                      value={xField}
                      onChange={(e) => setXField(e.target.value)}
                      className="h-8 w-full rounded-lg border border-border bg-editor px-2 text-[12px] outline-none"
                    >
                      <option value="">(first column)</option>
                      {cols.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={xField}
                      onChange={(e) => setXField(e.target.value)}
                      placeholder="(first column)"
                      className="h-8 w-full rounded-lg border border-border bg-editor px-2.5 text-[12px] outline-none"
                    />
                  )}
                </label>
                <label className="flex-1">
                  <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Value columns (comma-separated)
                  </span>
                  <input
                    value={yFields}
                    onChange={(e) => setYFields(e.target.value)}
                    placeholder="(all numeric columns)"
                    className="h-8 w-full rounded-lg border border-border bg-editor px-2.5 text-[12px] outline-none"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-[12px] text-foreground">
                <input type="checkbox" checked={stacked} onChange={(e) => setStacked(e.target.checked)} /> Stacked
              </label>
              <div>
                <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Advanced — raw ECharts option (JSON, merged over the generated chart)
                </span>
                <textarea
                  value={optionJson}
                  onChange={(e) => setOptionJson(e.target.value)}
                  rows={4}
                  spellCheck={false}
                  placeholder='{"yAxis": {"type": "log"}, "series": [{"label": {"show": true}}]}'
                  className="w-full resize-y rounded-lg border border-border bg-editor px-2.5 py-2 font-mono text-[11.5px] leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
                />
                {jsonErr ? <p className="mt-1 text-[11px] text-destructive">{jsonErr}</p> : null}
              </div>
            </div>
          ) : vizType === "kpi" ? (
            <div className="flex gap-2">
              <label className="flex-1">
                <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Value column</span>
                <input
                  value={kpiField}
                  onChange={(e) => setKpiField(e.target.value)}
                  placeholder="(first cell)"
                  className="h-8 w-full rounded-lg border border-border bg-editor px-2.5 text-[12px] outline-none"
                />
              </label>
              <label className="w-32">
                <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Unit</span>
                <input
                  value={kpiUnit}
                  onChange={(e) => setKpiUnit(e.target.value)}
                  placeholder="€, rows…"
                  className="h-8 w-full rounded-lg border border-border bg-editor px-2.5 text-[12px] outline-none"
                />
              </label>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-2.5">
          <button
            onClick={onClose}
            className="flex h-8 items-center rounded-lg border border-border px-3 text-[12.5px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!sql.trim()}
            className="cta-glow flex h-8 items-center rounded-lg bg-primary px-4 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
          >
            Save panel
          </button>
        </div>
      </div>
    </div>
  );
}
