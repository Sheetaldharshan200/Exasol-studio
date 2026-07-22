import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import { worker as pspWorker } from "@perspective-dev/client";
import "@perspective-dev/viewer";
import "@perspective-dev/viewer-datagrid";
import "@perspective-dev/viewer-d3fc";
import { PerspectiveViewer } from "@perspective-dev/react";
import "@perspective-dev/viewer/dist/css/themes.css";
import GridLayout, { type LayoutItem } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { Icon } from "@/components/ui/icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShadcnChartPanel } from "@/features/bi/ShadcnChartPanel";
import {
  ArrowLeft,
  BarChart3,
  ChevronDown,
  FileDown,
  Loader2,
  Maximize2,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  Trash2,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { AgentMark } from "@/components/studio/AgentMark";
import { dashboards, type Dashboard, type DashPanel } from "@/lib/agent-client";
import { dashboardBus } from "@/lib/dashboard-bus";
import { errorMessage, ipc, type StatementResult } from "@/lib/ipc";
import { cn } from "@/lib/utils";

// The Dashboards view: agent-built JSON specs rendered with ECharts on a
// 12-column grid. Panel SQL runs through the app's own query engine on the
// active connection — no external BI server.

const PALETTE = ["#5fc33b", "#4fa823", "#8ed16f", "#2f7d14", "#b5e3a1", "#1f5c0d", "#d3efc7"];
// Rows per page for server-side table pagination (LIMIT/OFFSET pushed to Exasol).
const TABLE_PAGE = 1000;

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
    // Agent saved/edited a dashboard → open it straight away.
    const un = dashboardBus.on((id) => {
      void dashboards.get(id).then(setOpen).catch(() => undefined);
    });
    return () => {
      clearInterval(t);
      un();
    };
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
                        query: { sql: "SELECT 1 AS TOTAL" },
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
                        query: { sql: "SELECT 1 AS TOTAL" },
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
                  <Icon name="dashboards" className="h-4 w-4 shrink-0 text-primary" />
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

/** Mini chart previews for the visual type picker (Grafana-style tiles). */
const VIZ_TILES: { key: string; hint: string; art: React.ReactNode }[] = [
  { key: "bar", hint: "Compare categories", art: (<g><rect x="6" y="12" width="6" height="12" rx="1" fill="currentColor" opacity="0.45"/><rect x="15" y="6" width="6" height="18" rx="1" fill="var(--primary)"/><rect x="24" y="15" width="6" height="9" rx="1" fill="currentColor" opacity="0.45"/><rect x="33" y="9" width="6" height="15" rx="1" fill="currentColor" opacity="0.45"/></g>) },
  { key: "line", hint: "Trends over time", art: (<polyline points="5,20 15,12 24,15 33,7 43,10" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>) },
  { key: "area", hint: "Trend with magnitude", art: (<g><polygon points="5,22 15,12 24,16 33,7 43,11 43,24 5,24" fill="var(--primary)" opacity="0.25"/><polyline points="5,22 15,12 24,16 33,7 43,11" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round"/></g>) },
  { key: "pie", hint: "Proportions of a whole", art: (<g><circle cx="24" cy="13" r="9" fill="currentColor" opacity="0.35"/><path d="M24 13 L24 4 A9 9 0 0 1 32.5 16 Z" fill="var(--primary)"/></g>) },
  { key: "scatter", hint: "Correlation between measures", art: (<g fill="currentColor" opacity="0.6"><circle cx="10" cy="18" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="25" cy="16" r="2"/><circle cx="30" cy="8" r="2" fill="var(--primary)" opacity="1"/><circle cx="38" cy="11" r="2"/></g>) },
  { key: "donut", hint: "Proportions, with a hole for a total", art: (<g><circle cx="24" cy="13" r="9" fill="none" stroke="currentColor" strokeWidth="4" opacity="0.35"/><path d="M24 4 A9 9 0 0 1 32.6 16" stroke="var(--primary)" strokeWidth="4" fill="none"/></g>) },
  { key: "hbar", hint: "Compare many categories (horizontal)", art: (<g><rect x="8" y="5" width="26" height="4" rx="1" fill="var(--primary)"/><rect x="8" y="11" width="18" height="4" rx="1" fill="currentColor" opacity="0.45"/><rect x="8" y="17" width="30" height="4" rx="1" fill="currentColor" opacity="0.45"/></g>) },
  { key: "heatmap", hint: "Density across two dimensions", art: (<g>{[0,1,2,3].map((x)=>[0,1].map((y)=>null))}<rect x="9" y="5" width="7" height="7" fill="var(--primary)" opacity="0.9"/><rect x="17" y="5" width="7" height="7" fill="currentColor" opacity="0.25"/><rect x="25" y="5" width="7" height="7" fill="currentColor" opacity="0.5"/><rect x="33" y="5" width="7" height="7" fill="currentColor" opacity="0.2"/><rect x="9" y="13" width="7" height="7" fill="currentColor" opacity="0.35"/><rect x="17" y="13" width="7" height="7" fill="var(--primary)" opacity="0.6"/><rect x="25" y="13" width="7" height="7" fill="currentColor" opacity="0.2"/><rect x="33" y="13" width="7" height="7" fill="var(--primary)" opacity="0.4"/></g>) },
  { key: "funnel", hint: "Stage-by-stage drop-off", art: (<g fill="currentColor" opacity="0.5"><path d="M10 5 h28 l-5 5 h-18 Z" fill="var(--primary)" opacity="0.9"/><path d="M16 12 h16 l-4 5 h-8 Z"/><path d="M21 19 h6 l-1.5 4 h-3 Z"/></g>) },
  { key: "radar", hint: "Compare across several axes", art: (<g stroke="currentColor" opacity="0.4" fill="none"><polygon points="24,3 40,10 35,23 13,23 8,10"/><polygon points="24,8 34,12 31,20 17,20 14,12" stroke="var(--primary)" fill="var(--primary)" fillOpacity="0.2" opacity="1"/></g>) },
  { key: "radial", hint: "Progress rings per category", art: (<g fill="none" strokeLinecap="round"><path d="M24 22 A9 9 0 1 1 33 13" stroke="currentColor" opacity="0.3" strokeWidth="3"/><path d="M24 22 A9 9 0 1 1 30 5.5" stroke="var(--primary)" strokeWidth="3"/><path d="M24 18 A5 5 0 1 1 29 13" stroke="currentColor" opacity="0.45" strokeWidth="3"/></g>) },
  { key: "treemap", hint: "Composition of many parts", art: (<g><rect x="8" y="5" width="16" height="16" rx="1" fill="var(--primary)" opacity="0.75"/><rect x="26" y="5" width="14" height="9" rx="1" fill="currentColor" opacity="0.4"/><rect x="26" y="16" width="8" height="5" rx="1" fill="currentColor" opacity="0.3"/><rect x="36" y="16" width="4" height="5" rx="1" fill="currentColor" opacity="0.25"/></g>) },
  { key: "gauge", hint: "Progress toward a target", art: (<g fill="none"><path d="M10 21 A14 14 0 0 1 38 21" stroke="currentColor" opacity="0.3" strokeWidth="4"/><path d="M10 21 A14 14 0 0 1 27 8" stroke="var(--primary)" strokeWidth="4"/><circle cx="24" cy="21" r="2" fill="currentColor"/></g>) },
  { key: "kpi", hint: "One number that matters", art: (<g><text x="24" y="15" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--primary)">42k</text><rect x="14" y="19" width="20" height="2" rx="1" fill="currentColor" opacity="0.35"/></g>) },
  { key: "table", hint: "Raw rows and columns", art: (<g stroke="currentColor" opacity="0.5" strokeWidth="1"><rect x="8" y="5" width="32" height="16" rx="1.5"/><line x1="8" y1="10" x2="40" y2="10"/><line x1="8" y1="15" x2="40" y2="15"/><line x1="21" y1="5" x2="21" y2="21"/><line x1="30" y1="5" x2="30" y2="21"/></g>) },
  { key: "explore", hint: "Interactive pivot studio", art: (<g><rect x="8" y="6" width="10" height="6" rx="1" fill="var(--primary)" opacity="0.8"/><rect x="8" y="14" width="10" height="6" rx="1" fill="currentColor" opacity="0.35"/><rect x="21" y="6" width="19" height="14" rx="1.5" stroke="currentColor" opacity="0.5" fill="none"/><path d="M25 16 l4 -4 l3 2 l4 -5" stroke="var(--primary)" strokeWidth="1.5" fill="none"/></g>) },
  { key: "text", hint: "Markdown narrative", art: (<g fill="currentColor" opacity="0.5"><rect x="8" y="6" width="24" height="2.5" rx="1"/><rect x="8" y="11" width="32" height="2" rx="1"/><rect x="8" y="15" width="28" height="2" rx="1"/><rect x="8" y="19" width="18" height="2" rx="1"/></g>) },
];

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
  const [history, setHistory] = useState<{ index: number; updatedAt: number; title: string; panels: number }[] | null>(null);
  async function toggleHistory() {
    if (history) return setHistory(null);
    setHistory(await dashboards.history(dash.id).catch(() => []));
  }
  async function restoreRevision(index: number) {
    const restored = await dashboards.rollback(dash.id, index).catch(() => null);
    if (restored) {
      setDash(restored);
      setHistory(null);
    }
  }
  const [nonce, setNonce] = useState(0);
  // Auto-refresh: re-run every panel's query on an interval (polling — Exasol
  // doesn't push row changes, so "live" means a periodic full re-query). The
  // choice is persisted on the dashboard, so it stays live across reopens.
  const autoRefreshMs = dash.refreshMs ?? 0;
  const setAutoRefresh = (ms: number) => void saveDash({ ...dash, refreshMs: ms || undefined });
  useEffect(() => {
    if (!autoRefreshMs) return;
    // Skip ticks while the window/tab is hidden so we never poll the database
    // in the background (avoids needless load when the dashboard isn't on screen).
    const t = setInterval(() => {
      if (!document.hidden) setNonce((n) => n + 1);
    }, autoRefreshMs);
    return () => clearInterval(t);
  }, [autoRefreshMs]);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);

  function note(msg: string) {
    setExportNote(msg);
    setTimeout(() => setExportNote(null), 6000);
  }

  /** Fresh data for every data panel (reading order), capped for reports. */
  async function collectPanelData(): Promise<Map<string, StatementResult | null>> {
    const out = new Map<string, StatementResult | null>();
    for (const p of dash.panels) {
      const sql = p.query?.sql?.trim();
      if (p.viz.type === "markdown" || !sql || !profileId) {
        out.set(p.id, null);
        continue;
      }
      try {
        const res = await ipc.executeSql(profileId, connectionName, sql, 500, false);
        const first = res.results.find((r) => r.kind === "resultSet") ?? res.results[0];
        out.set(p.id, first && !first.error ? first : null);
      } catch {
        out.set(p.id, null);
      }
    }
    return out;
  }

  const readingOrder = () => [...dash.panels].sort((a, b) => a.grid.y - b.grid.y || a.grid.x - b.grid.x);

  async function doExport(kind: "markdown" | "html" | "pdf") {
    setExporting(true);
    try {
      const data = await collectPanelData();
      if (kind === "markdown") {
        const md = buildMarkdownReport(dash, readingOrder(), data);
        const path = await saveDialog({
          defaultPath: `${slugify(dash.title)}.md`,
          filters: [{ name: "Markdown", extensions: ["md"] }],
        });
        if (path) {
          await ipc.writeTextFile(path, md);
          note(`Saved ${path}`);
        }
      } else {
        const html = buildHtmlReport(dash, readingOrder(), data);
        if (kind === "html") {
          const path = await saveDialog({
            defaultPath: `${slugify(dash.title)}.html`,
            filters: [{ name: "HTML", extensions: ["html"] }],
          });
          if (path) {
            await ipc.writeTextFile(path, html);
            note(`Saved ${path}`);
          }
        } else {
          printHtml(html);
          note("Print dialog opened — choose “Save as PDF”. (No dialog? Export HTML and print it from your browser.)");
        }
      }
    } catch (e) {
      note(`Export failed: ${errorMessage(e)}`);
    } finally {
      setExporting(false);
    }
  }

  async function saveDash(next: Dashboard) {
    setDash(next);
    await dashboards.save(next).catch(() => undefined);
  }

  function addPanel() {
    const W = 6, H = 6;
    const collides = (x: number, y: number) =>
      dash.panels.some((p) => x < p.grid.x + p.grid.w && p.grid.x < x + W && y < p.grid.y + p.grid.h && p.grid.y < y + H);
    const maxY = Math.max(0, ...dash.panels.map((p) => p.grid.y + p.grid.h));
    let spot = { x: 0, y: maxY };
    outer: for (let y = 0; y <= maxY; y++)
      for (let x = 0; x + W <= 12; x++)
        if (!collides(x, y)) { spot = { x, y }; break outer; }
    const p: DashPanel = {
      id: `p${Date.now().toString(36)}`,
      title: "New panel",
      grid: { x: spot.x, y: spot.y, w: W, h: H },
      query: { sql: "" },
      viz: { type: "table" },
    };
    void saveDash({ ...dash, panels: [...dash.panels, p] });
    setEditing(p);
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
    // minW/minH keep panels from being dragged down to an unreadable size.
    () => dash.panels.map((p) => ({ i: p.id, x: p.grid.x, y: p.grid.y, w: p.grid.w, h: p.grid.h, minW: 2, minH: 3 })),
    [dash],
  );

  // Fixed-size presets so a panel snaps to a tidy layout in one click.
  function setPanelSize(id: string, w: number, h: number) {
    void saveDash({ ...dash, panels: dash.panels.map((p) => (p.id === id ? { ...p, grid: { ...p.grid, w, h } } : p)) });
  }

  function persistLayout(next: readonly LayoutItem[]) {
    const changed = next.some((l) => {
      const p = dash.panels.find((x) => x.id === l.i);
      return p && (p.grid.x !== l.x || p.grid.y !== l.y || p.grid.w !== l.w || p.grid.h !== l.h);
    });
    if (!changed) return;
    const updated: Dashboard = {
      ...dash,
      panels: dash.panels.map((p) => {
        const l = next.find((x) => x.i === p.id);
        return l ? { ...p, grid: { x: l.x, y: l.y, w: l.w, h: l.h } } : p;
      }),
    };
    // Update the CONTROLLED layout too — saving only to disk made the grid
    // snap back after every drag, so panels could never be placed side by side.
    void saveDash(updated);
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
        <Icon name="dashboards" className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate text-[13px] font-semibold text-foreground">{dash.title}</span>
        <button
          onClick={() => void toggleHistory()}
          title="Revision history — restore any earlier version"
          className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          History
        </button>
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
        <div className="relative">
          <button
            onClick={() => setExportOpen((v) => !v)}
            disabled={exporting}
            className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
            title="Export as a report"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />} Export
          </button>
          {exportOpen ? (
            <div className="absolute right-0 top-7 z-30 w-44 rounded-lg border border-border bg-popover p-1 shadow-xl">
              {(
                [
                  ["markdown", "Markdown (.md)"],
                  ["html", "HTML report (.html)"],
                  ["pdf", "PDF (print…)"],
                ] as const
              ).map(([kind, label]) => (
                <button
                  key={kind}
                  onClick={() => {
                    setExportOpen(false);
                    void doExport(kind);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-foreground hover:bg-secondary"
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button
          onClick={() => setNonce((n) => n + 1)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          aria-label="Refresh all panels"
          title="Refresh now"
        >
          <RefreshCcw className={cn("h-3.5 w-3.5", autoRefreshMs && "text-primary")} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn("flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px]", autoRefreshMs ? "text-primary" : "text-muted-foreground hover:text-foreground")}
              title="Auto-refresh — re-run panel queries on an interval"
            >
              {autoRefreshMs ? `${autoRefreshMs / 1000}s` : "Live"}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Live auto-refresh</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setAutoRefresh(0)}>Off</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAutoRefresh(5_000)}>Every 5s</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAutoRefresh(10_000)}>Every 10s</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAutoRefresh(30_000)}>Every 30s</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAutoRefresh(60_000)}>Every 60s</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {exportNote ? (
        <div className="border-b border-border bg-secondary/40 px-3 py-1 text-[11px] text-muted-foreground">{exportNote}</div>
      ) : null}
      {editing ? (
        // Panel editing happens INSIDE the tab — the editor takes the grid's
        // place instead of floating over it as a dialog.
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
      ) : dash.panels.length === 0 ? (
        <div ref={containerRef} className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground">
            <Icon name="dashboard-grid" className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">No panels yet</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Add a panel to chart a query, show a KPI, or write a note.</p>
          </div>
          <button onClick={addPanel} className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/85">
            <Plus className="h-3.5 w-3.5" /> Add panel
          </button>
        </div>
      ) : (
        <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto p-2">
          <GridLayout
            layout={layout}
            width={width - 8}
            gridConfig={{ cols: 12, rowHeight: 44, margin: [8, 8] }}
            dragConfig={{ handle: ".dash-panel-title" }}
            resizeConfig={{ handles: ["e", "s", "se"] }}
            onDragStop={(l) => persistLayout(l)}
            onResizeStop={(l) => persistLayout(l)}
          >
            {dash.panels.map((p) => (
              <div
                key={p.id}
                className="group/panel transform-gpu overflow-hidden rounded-xl border border-border/70 bg-panel/70 shadow-sm transition-all duration-300 ease-out hover:border-primary/30 hover:shadow-[0_8px_30px_-12px_color-mix(in_srgb,var(--foreground)_25%,transparent)]"
              >
                <Panel
                  panel={p}
                  profileId={profileId}
                  connectionName={connectionName}
                  nonce={nonce}
                  onVizChange={(viz) => {
                    void saveDash({ ...dash, panels: dash.panels.map((x) => (x.id === p.id ? { ...x, viz } : x)) });
                  }}
                  onEdit={() => setEditing(p)}
                  onSize={(w, h) => setPanelSize(p.id, w, h)}
                  onDelete={() => {
                    void saveDash({ ...dash, panels: dash.panels.filter((x) => x.id !== p.id) });
                  }}
                />
              </div>
            ))}
          </GridLayout>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────── Panels ────────────────────────── */

/** Quick chart-type switcher — grouped parent → child so a panel's shape can
 *  change from the card itself, without opening the full editor. */
const VIZ_SWITCH: { group: string; items: { key: string; label: string }[] }[] = [
  { group: "Trend", items: [{ key: "line", label: "Line" }, { key: "area", label: "Area" }] },
  { group: "Comparison", items: [{ key: "bar", label: "Bar" }, { key: "hbar", label: "Horizontal bar" }, { key: "radar", label: "Radar" }] },
  { group: "Composition", items: [{ key: "pie", label: "Pie" }, { key: "donut", label: "Donut" }, { key: "radial", label: "Radial" }, { key: "treemap", label: "Treemap" }, { key: "funnel", label: "Funnel" }] },
  { group: "Distribution", items: [{ key: "scatter", label: "Scatter" }, { key: "heatmap", label: "Heatmap" }] },
  { group: "Single value", items: [{ key: "kpi", label: "KPI" }, { key: "gauge", label: "Gauge" }] },
  { group: "Data", items: [{ key: "table", label: "Table" }] },
];

/** Build a new viz for the panel when the quick switcher picks `key`, reusing
 *  the existing field mapping where it still applies. A quick switch drops any
 *  raw ECharts `option` override so the new type always renders visibly. */
function switchPanelViz(panel: DashPanel, key: string): DashPanel["viz"] {
  if (key === "kpi")
    return { type: "kpi", valueField: panel.viz.type === "kpi" ? panel.viz.valueField : undefined, unit: panel.viz.type === "kpi" ? panel.viz.unit : undefined };
  if (key === "table") return { type: "table" };
  const ev = panel.viz.type === "echarts" ? panel.viz : undefined;
  return { type: "echarts", chart: key as Extract<DashPanel["viz"], { type: "echarts" }>["chart"], xField: ev?.xField, yFields: ev?.yFields ?? [], stacked: ev?.stacked };
}

/** The key that identifies a panel's current viz in the switcher. */
function currentVizKey(panel: DashPanel): string {
  return panel.viz.type === "echarts" ? (panel.viz.chart ?? "bar") : panel.viz.type;
}

function Panel({
  panel,
  profileId,
  connectionName,
  nonce,
  onEdit,
  onSize,
  onDelete,
  onVizChange,
}: {
  panel: DashPanel;
  profileId: string | null;
  connectionName: string;
  nonce: number;
  onEdit: () => void;
  onSize: (w: number, h: number) => void;
  onDelete: () => void;
  onVizChange?: (viz: DashPanel["viz"]) => void;
}) {
  const [result, setResult] = useState<StatementResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sql = panel.query?.sql ?? "";
  // Guards a slow query from piling up: if a fetch for the SAME query is still
  // running when an auto-refresh tick arrives, skip the tick instead of firing
  // a second concurrent query.
  const inFlight = useRef(false);
  const queryKeyRef = useRef("");
  // Server-side pagination for flat tables: browse the FULL dataset a page at a
  // time (LIMIT/OFFSET pushed to Exasol) instead of a bounded 50k sample.
  const isTable = panel.viz.type === "table";
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  useEffect(() => setPage(0), [sql, panel.viz.type]); // new query -> first page

  useEffect(() => {
    if (!profileId || panel.viz.type === "markdown" || !sql.trim()) return;
    const base = sql.trim().replace(/;\s*$/, "");
    // One extra row tells us whether a next page exists (no COUNT round-trip).
    const effSql = isTable ? `SELECT * FROM (\n${base}\n) LIMIT ${TABLE_PAGE + 1} OFFSET ${page * TABLE_PAGE}` : base;
    const cap = isTable ? TABLE_PAGE + 1 : 5000;
    if (inFlight.current && effSql === queryKeyRef.current) return; // refresh while busy: drop tick
    queryKeyRef.current = effSql;
    inFlight.current = true;
    let cancelled = false;
    setLoading(true);
    ipc
      .executeSql(profileId, connectionName, effSql, cap, false)
      .then((res) => {
        if (cancelled) return;
        const first = res.results.find((r) => r.kind === "resultSet") ?? res.results[0];
        if (!first || first.error) setError(first?.error ?? "no result");
        else {
          if (isTable) {
            const more = first.rows.length > TABLE_PAGE;
            setHasNext(more);
            if (more) first.rows = first.rows.slice(0, TABLE_PAGE);
            first.truncated = false; // paged, not a truncated sample
          }
          setResult(first);
          setError(null);
        }
      })
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          inFlight.current = false;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, connectionName, sql, panel.viz.type, nonce, page, isTable]);

  return (
    <div className="flex h-full flex-col">
      <div className="dash-panel-title flex shrink-0 cursor-move items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5">
        <span className="truncate text-[11.5px] font-medium text-foreground">{panel.title || "Panel"}</span>
        {result?.truncated ? (
          <span
            title={`Showing the first ${result.rowCount.toLocaleString()} rows. This panel loads a bounded sample — use GROUP BY / aggregation so Exasol summarises the full dataset server-side (fast, exact) instead of streaming raw rows here.`}
            className="shrink-0 rounded bg-warning/15 px-1.5 py-px text-[9px] font-medium uppercase text-warning"
          >
            sample
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-0.5">
          {loading && !result ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : null}
          {onVizChange && panel.viz.type !== "markdown" ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="pointer-events-none flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/panel:pointer-events-auto group-hover/panel:opacity-100 hover:text-foreground data-[state=open]:pointer-events-auto data-[state=open]:bg-secondary data-[state=open]:opacity-100"
                  aria-label="Change chart type"
                  title="Change chart type"
                >
                  <BarChart3 className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuLabel>Chart type</DropdownMenuLabel>
                {VIZ_SWITCH.map((grp) => (
                  <DropdownMenuSub key={grp.group}>
                    <DropdownMenuSubTrigger>{grp.group}</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {grp.items.map((it) => {
                        const activeKey = currentVizKey(panel);
                        return (
                          <DropdownMenuItem
                            key={it.key}
                            onClick={() => onVizChange(switchPanelViz(panel, it.key))}
                            className={cn(activeKey === it.key && "text-primary")}
                          >
                            {it.label}
                            {activeKey === it.key ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" /> : null}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="pointer-events-none flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/panel:pointer-events-auto group-hover/panel:opacity-100 hover:text-foreground data-[state=open]:pointer-events-auto data-[state=open]:bg-secondary data-[state=open]:opacity-100"
                aria-label="Panel size"
                title="Resize panel"
              >
                <Maximize2 className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuLabel>Panel size</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onSize(3, 4)}>Small · ¼ width</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSize(6, 6)}>Medium · ½ width</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSize(6, 9)}>Tall · ½ width</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSize(12, 6)}>Wide · full width</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSize(12, 10)}>Large · full width</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="pointer-events-none flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/panel:pointer-events-auto group-hover/panel:opacity-100 hover:text-foreground"
            aria-label="Edit panel"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="pointer-events-none flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/panel:pointer-events-auto group-hover/panel:opacity-100 hover:text-destructive"
            aria-label="Delete panel"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </span>
      </div>
      <div className="min-h-0 flex-1">
        {panel.viz.type === "markdown" ? (
          <div className="h-full overflow-y-auto px-3.5 py-2.5 text-[12.5px] leading-relaxed text-foreground [&_a]:text-primary [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1 [&_code]:text-[11px] [&_h1]:mb-1 [&_h1]:text-[16px] [&_h1]:font-bold [&_h2]:mb-1 [&_h2]:text-[14px] [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-1.5 [&_strong]:font-semibold [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-4">
            <ReactMarkdown>{panel.viz.content}</ReactMarkdown>
          </div>
        ) : !profileId ? (
          <Hint text="Connect to a database to load this panel." />
        ) : error ? (
          <Hint text={error} error />
        ) : !result ? (
          <Hint text="Loading…" />
        ) : panel.viz.type === "kpi" ? (
          <KpiPanel panel={panel} result={result} />
        ) : panel.viz.type === "table" ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1">
              <PerspectiveTable result={result} />
            </div>
            {page > 0 || hasNext ? (
              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/60 px-2.5 py-1 text-[10.5px] text-muted-foreground">
                <span className="tabular-nums">Rows {page * TABLE_PAGE + 1}–{page * TABLE_PAGE + result.rows.length}</span>
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0 || loading}
                  className="flex h-5 w-5 items-center justify-center rounded hover:bg-secondary hover:text-foreground disabled:opacity-40"
                  aria-label="Previous page"
                ><ArrowLeft className="h-3 w-3" /></button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasNext || loading}
                  className="flex h-5 w-5 items-center justify-center rounded hover:bg-secondary hover:text-foreground disabled:opacity-40"
                  aria-label="Next page"
                ><ArrowLeft className="h-3 w-3 rotate-180" /></button>
              </div>
            ) : null}
          </div>
        ) : panel.viz.type === "explore" ? (
          <ExplorePanel panel={panel} result={result} onVizChange={onVizChange} />
        ) : (() => {
          // Common chart types render as shadcn/ui charts (Recharts) — the
          // ui.shadcn.com/charts look with draw-in animation. A custom ECharts
          // option or exotic type (heatmap, treemap, gauge, radar, funnel,
          // scatter) keeps the ECharts engine.
          const ev = panel.viz as Extract<DashPanel["viz"], { type: "echarts" }>;
          const simple = ["bar", "hbar", "line", "area", "pie", "donut", "radar", "radial"] as const;
          const isSimple = !ev.option && (simple as readonly string[]).includes(ev.chart ?? "");
          return isSimple ? (
            <ShadcnChartPanel chart={ev.chart as (typeof simple)[number]} result={result} />
          ) : (
            <ChartPanel panel={panel} result={result} />
          );
        })()}
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
          : Number.isInteger(num)
            ? String(num)
            : num.toFixed(2)
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

/**
 * The self-serve BI studio (Superset-style, Rust/WASM): full Perspective
 * viewer with the config bar on — drag columns into group-by/split-by, pick
 * any d3fc chart (bars, lines, heatmap, treemap, sunburst…). Every change
 * persists into the panel spec, so the AI can read and edit it too.
 */
function ExplorePanel({
  panel,
  result,
  onVizChange,
}: {
  panel: DashPanel;
  result: StatementResult;
  onVizChange?: (viz: DashPanel["viz"]) => void;
}) {
  const [table, setTable] = useState<unknown | null>(null);
  const [failed, setFailed] = useState(false);
  const viz = panel.viz as Extract<DashPanel["viz"], { type: "explore" }>;

  useEffect(() => {
    if (!result.rows.length) return;
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
  if (!table) return <Hint text="Loading studio…" />;
  const dark = document.documentElement.classList.contains("dark");
  return (
    <PerspectiveViewer
      client={table as never}
      config={{ theme: dark ? "Pro Dark" : "Pro", ...(viz.config ?? { plugin: "Datagrid" }) }}
      onConfigUpdate={(cfg) => onVizChange?.({ type: "explore", config: cfg as Record<string, unknown> })}
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

/**
 * Build the ECharts option(s) for a chart panel — shared by live panels and
 * export snapshots. `primary` replaces the chart; `override` (the human/agent
 * viz.option) deep-merges on top via a second setOption.
 */
function buildChartOption(
  viz: Extract<DashPanel["viz"], { type: "echarts" }>,
  result: StatementResult,
  theme?: { fg: string; border: string },
): { primary: Record<string, unknown>; override?: Record<string, unknown> } | null {
  const cols = result.columns.map((c) => c.name);
  if (!result.rows.length) return null;
  const styles = getComputedStyle(document.documentElement);
  const fg = theme?.fg ?? (styles.getPropertyValue("--muted-foreground").trim() || "#888");
  const border = theme?.border ?? (styles.getPropertyValue("--border").trim() || "#333");
  // FULL ECharts mode: a custom option with its own `series` takes over
  // completely — we inject the query result as dataset.source so any
  // series type (heatmap, funnel, gauge, radar, sankey, candlestick…)
  // can reference it. Everything ECharts can do, a panel can do.
  const custom = viz.option as { series?: unknown } | undefined;
  if (custom?.series) {
    return {
      primary: {
        color: PALETTE,
        tooltip: {},
        textStyle: { color: fg },
        dataset: { source: [cols, ...result.rows] },
        ...custom,
      },
    };
  }
  // Values come back as strings from the query layer — coerce, don't
  // typeof-check, or every series comes out empty (blank chart).
  const num = (v: unknown): number | null => {
    if (v === null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const isNumCol = (i: number) => {
    let seen = 0;
    for (const r of result.rows) {
      if (r[i] === null || r[i] === "") continue;
      if (num(r[i]) === null) return false;
      seen++;
    }
    return seen > 0;
  };
  // X axis = the explicit field, else the first NON-numeric column, else col 0.
  const xIdx = viz.xField
    ? Math.max(cols.indexOf(viz.xField.toUpperCase()), 0)
    : Math.max(cols.findIndex((_, i) => !isNumCol(i)), 0);
  const yIdxs = viz.yFields?.length
    ? viz.yFields.map((f) => cols.indexOf(f.toUpperCase())).filter((i) => i >= 0)
    : cols.map((_, i) => i).filter((i) => i !== xIdx && isNumCol(i));
  // Nothing detected numeric? Plot every non-x column so it's never blank.
  const yCols = yIdxs.length ? yIdxs : cols.map((_, i) => i).filter((i) => i !== xIdx);

  const categories = result.rows.map((r) => String(r[xIdx] ?? ""));
  const nameValue = () => result.rows.map((r) => ({ name: String(r[xIdx] ?? ""), value: num(r[yCols[0] ?? 1]) ?? 0 }));
  const AXISLESS = new Set(["pie", "donut", "funnel", "radar", "treemap", "gauge"]);
  let extraOption: Record<string, unknown> = {};
  const series =
    viz.chart === "pie" || viz.chart === "donut"
      ? [
          {
            type: "pie" as const,
            radius: viz.chart === "donut" ? ["48%", "72%"] : ["0%", "70%"],
            itemStyle: { borderRadius: 4 },
            label: { color: fg, fontSize: 10 },
            data: nameValue(),
          },
        ]
      : viz.chart === "funnel"
        ? [{ type: "funnel" as const, gap: 2, label: { color: fg, fontSize: 10 }, data: nameValue().sort((a, b) => b.value - a.value) }]
        : viz.chart === "treemap"
          ? [{ type: "treemap" as const, roam: false, breadcrumb: { show: false }, label: { color: "#fff", fontSize: 10 }, data: nameValue() }]
          : viz.chart === "gauge"
            ? (() => {
                const v = num(result.rows[0]?.[yCols[0] ?? 0]) ?? 0;
                const max = Math.max(Math.ceil((v * 1.25) / 10) * 10, 10);
                return [{ type: "gauge" as const, max, progress: { show: true }, detail: { color: fg, fontSize: 16 }, axisLabel: { color: fg, fontSize: 8 }, data: [{ value: v, name: cols[yCols[0] ?? 0] }] }];
              })()
            : viz.chart === "radar"
              ? (() => {
                  const maxV = Math.max(...result.rows.flatMap((r) => yCols.map((yi) => num(r[yi]) ?? 0)), 1);
                  extraOption = { radar: { indicator: categories.map((c) => ({ name: c, max: maxV * 1.15 })), axisName: { color: fg, fontSize: 9 } } };
                  return [{ type: "radar" as const, data: yCols.map((yi) => ({ name: cols[yi], value: result.rows.map((r) => num(r[yi]) ?? 0) })) }];
                })()
              : viz.chart === "heatmap"
                ? (() => {
                    // Expect 3 columns: x, y, value (Superset heatmap shape).
                    const yCat = cols.findIndex((_, i) => i !== xIdx && !isNumCol(i));
                    const yi = yCat >= 0 ? yCat : Math.min(1, cols.length - 1);
                    const vi = yCols.find((i) => i !== xIdx && i !== yi) ?? cols.length - 1;
                    const xs = [...new Set(result.rows.map((r) => String(r[xIdx] ?? "")))];
                    const ys = [...new Set(result.rows.map((r) => String(r[yi] ?? "")))];
                    const vals = result.rows.map((r) => num(r[vi]) ?? 0);
                    extraOption = {
                      xAxis: { type: "category", data: xs, axisLabel: { color: fg, fontSize: 9 } },
                      yAxis: { type: "category", data: ys, axisLabel: { color: fg, fontSize: 9 } },
                      visualMap: { min: Math.min(...vals, 0), max: Math.max(...vals, 1), calculable: true, orient: "horizontal", left: "center", bottom: 0, textStyle: { color: fg }, inRange: { color: ["#123", "#5fc33b"] } },
                    };
                    return [{ type: "heatmap" as const, label: { show: xs.length * ys.length <= 60, color: fg, fontSize: 9 }, data: result.rows.map((r) => [String(r[xIdx] ?? ""), String(r[yi] ?? ""), num(r[vi]) ?? 0]) }];
                  })()
                : yCols.map((yi) => ({
          name: cols[yi],
          type: (viz.chart === "area" ? "line" : viz.chart === "hbar" ? "bar" : viz.chart) as "line" | "bar" | "scatter",
          // Hover/click a series (or its legend) to spotlight it and fade the rest.
          emphasis: { focus: "series" as const },
          ...(viz.chart === "area" ? { areaStyle: { opacity: 0.22 } } : {}),
          ...(viz.stacked ? { stack: "total" } : {}),
          smooth: viz.chart !== "bar",
          showSymbol: viz.chart === "scatter",
          symbolSize: viz.chart === "scatter" ? 9 : 4,
          itemStyle: { borderRadius: viz.chart === "bar" ? [3, 3, 0, 0] : 0 },
          barMaxWidth: 40,
          data: result.rows.map((r) => num(r[yi]) ?? 0),
        }));

  const primary: Record<string, unknown> = {
    color: PALETTE,
    grid: { left: 44, right: 12, top: 24, bottom: 26 },
    tooltip: { trigger: AXISLESS.has(viz.chart) || viz.chart === "heatmap" ? "item" : "axis" },
    legend:
      series.length > 1 && !AXISLESS.has(viz.chart) && viz.chart !== "heatmap"
        ? { top: 2, textStyle: { color: fg, fontSize: 10 }, icon: "circle" }
        : undefined,
    ...(!AXISLESS.has(viz.chart) && viz.chart !== "heatmap"
      ? {
          [viz.chart === "hbar" ? "yAxis" : "xAxis"]: {
            type: "category",
            data: categories,
            axisLabel: { color: fg, fontSize: 10, hideOverlap: true, rotate: categories.length > 8 ? 30 : 0 },
            axisLine: { lineStyle: { color: border } },
            axisTick: { show: false },
          },
          [viz.chart === "hbar" ? "xAxis" : "yAxis"]: {
            type: "value",
            axisLabel: { color: fg, fontSize: 10 },
            splitLine: { lineStyle: { color: border, opacity: 0.4, type: "dashed" } },
          },
        }
      : {}),
    ...extraOption,
    series,
  };
  // Full-control overrides: whatever the human (or agent) put in viz.option
  // merges over the generated chart.
  return { primary, override: viz.option as Record<string, unknown> | undefined };
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
    // Click a series to spotlight it and fade the rest (works for any chart
    // with multiple series — bar, line, scatter, funnel…). Click it again, or
    // click empty space, to bring them all back. `emphasis.focus:'series'` on
    // the series definitions does the fading; we just make it stick on click.
    let spot = -1;
    const onClick = (p: { seriesIndex?: number }) => {
      const idx = typeof p.seriesIndex === "number" ? p.seriesIndex : -1;
      chart.dispatchAction({ type: "downplay" });
      if (idx < 0 || idx === spot) { spot = -1; return; }
      spot = idx;
      chart.dispatchAction({ type: "highlight", seriesIndex: idx });
    };
    const onEmpty = () => { spot = -1; chart.dispatchAction({ type: "downplay" }); };
    chart.on("click", onClick);
    chart.getZr().on("click", (e) => { if (!e.target) onEmpty(); });
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  const prevVizRef = useRef<string>("");
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const built = buildChartOption(viz, result);
    if (!built) {
      chart.clear();
      chart.setOption({ title: { text: "No data", left: "center", top: "center", textStyle: { color: "#888", fontSize: 12 } } });
      return;
    }
    // Only a viz change needs a full rebuild (notMerge). A data-only refresh
    // (live auto-refresh) merges, so ECharts animates values in place instead
    // of clearing + replaying the entrance animation — no flicker.
    const vizKey = JSON.stringify(viz);
    const structural = vizKey !== prevVizRef.current;
    prevVizRef.current = vizKey;
    chart.setOption(built.primary as Parameters<typeof chart.setOption>[0], { notMerge: structural, lazyUpdate: true });
    if (built.override) chart.setOption(built.override as Parameters<typeof chart.setOption>[0], { lazyUpdate: true });
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
  const [sql, setSql] = useState(panel.query?.sql ?? "");
  const [vizType, setVizType] = useState<"echarts" | "kpi" | "table" | "explore" | "markdown">(panel.viz.type);
  const [content, setContent] = useState(panel.viz.type === "markdown" ? panel.viz.content : "");
  const ev = panel.viz.type === "echarts" ? panel.viz : null;
  type ChartKind = "bar" | "line" | "area" | "pie" | "donut" | "hbar" | "scatter" | "heatmap" | "funnel" | "radar" | "treemap" | "gauge";
  const [chart, setChart] = useState<ChartKind>(ev?.chart ?? "bar");
  const [xField, setXField] = useState(ev?.xField ?? "");
  const [yFields, setYFields] = useState((ev?.yFields ?? []).join(", "));
  const [stacked, setStacked] = useState(Boolean(ev?.stacked));
  const [kpiField, setKpiField] = useState(panel.viz.type === "kpi" ? (panel.viz.valueField ?? "") : "");
  const [kpiUnit, setKpiUnit] = useState(panel.viz.type === "kpi" ? (panel.viz.unit ?? "") : "");
  const [optionJson, setOptionJson] = useState(ev?.option ? JSON.stringify(ev.option, null, 2) : "");
  const [preview, setPreview] = useState<StatementResult | null>(null);
  const [datasets, setDatasets] = useState<{ schema: string; name: string }[]>([]);
  const [dataset, setDataset] = useState("");
  const [dsOpen, setDsOpen] = useState(false);

  // Every table/view on the connection is a dataset — virtual schemas too
  // (they surface in the same catalog views).
  useEffect(() => {
    if (!profileId) return;
    ipc
      .executeSql(
        profileId,
        connectionName,
        `SELECT TABLE_SCHEMA AS S, TABLE_NAME AS N FROM SYS.EXA_ALL_TABLES
         UNION SELECT VIEW_SCHEMA, VIEW_NAME FROM SYS.EXA_ALL_VIEWS ORDER BY 1, 2`,
        2000,
        false,
      )
      .then((res) => {
        const first = res.results.find((r) => r.kind === "resultSet");
        if (first && !first.error) setDatasets(first.rows.map((r) => ({ schema: String(r[0]), name: String(r[1]) })));
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  function applyTemplate(t: (typeof TEMPLATES)[number]) {
    const ds = dataset || "SCHEMA.TABLE";
    const nextSql = t.sql(ds);
    setSql(nextSql);
    if (t.viz === "explore") setVizType("explore");
    else if (t.viz === "kpi") setVizType("kpi");
    else if (t.viz === "table") setVizType("table");
    else {
      setVizType("echarts");
      setChart(t.viz);
    }
    if (!title || title === "New panel") setTitle(t.label);
    // Auto-run so the live preview fills in immediately (only for a real dataset).
    if (dataset) void runPreview(nextSql);
    else setPreview(null);
  }
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [jsonErr, setJsonErr] = useState<string | null>(null);

  async function runPreview(sqlOverride?: string) {
    const q = (sqlOverride ?? sql).trim();
    if (!profileId || !q) return;
    setRunning(true);
    setPreviewErr(null);
    try {
      const res = await ipc.executeSql(profileId, connectionName, q, 200, false);
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
      vizType === "markdown"
        ? { type: "markdown", content: content || "*…*" }
        : vizType === "kpi"
          ? { type: "kpi", valueField: kpiField || undefined, unit: kpiUnit || undefined }
          : vizType === "table"
            ? { type: "table" }
            : vizType === "explore"
              ? { type: "explore", config: panel.viz.type === "explore" ? panel.viz.config : undefined }
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
    onSave({ ...panel, title, query: vizType === "markdown" ? undefined : { sql }, viz });
  }

  // The panel as currently configured — drives the live preview pane. Lenient
  // about invalid raw-option JSON (the strict check lives in save()).
  const previewViz = useMemo<DashPanel["viz"]>(() => {
    if (vizType === "markdown") return { type: "markdown", content: content || "*…*" };
    if (vizType === "kpi") return { type: "kpi", valueField: kpiField || undefined, unit: kpiUnit || undefined };
    if (vizType === "table") return { type: "table" };
    if (vizType === "explore") return { type: "explore", config: panel.viz.type === "explore" ? panel.viz.config : undefined };
    let option: Record<string, unknown> | undefined;
    try { option = optionJson.trim() ? (JSON.parse(optionJson) as Record<string, unknown>) : undefined; } catch { option = undefined; }
    return { type: "echarts", chart, xField: xField || undefined, yFields: yFields.split(",").map((s) => s.trim()).filter(Boolean), stacked: stacked || undefined, option };
  }, [vizType, content, kpiField, kpiUnit, chart, xField, yFields, stacked, optionJson, panel]);
  const livePanel: DashPanel = { ...panel, title, viz: previewViz };

  const cols = preview?.columns.map((c) => c.name) ?? [];
  // Data-shape suggestions (Superset heuristics): temporal → line/area;
  // few categories → pie; many → bar/treemap; 2 measures → scatter;
  // 2 dims + measure → heatmap; single number → kpi/gauge.
  const suggested = useMemo(() => {
    const s = new Set<string>();
    if (!preview || !preview.columns.length) return s;
    const isNum = (i: number) => /DECIMAL|DOUBLE|INT|NUMBER|FLOAT/i.test(preview.columns[i].typeName ?? "");
    const isTime = (i: number) => /DATE|TIMESTAMP/i.test(preview.columns[i].typeName ?? "");
    const numIdx = preview.columns.map((_, i) => i).filter(isNum);
    const catIdx = preview.columns.map((_, i) => i).filter((i) => !isNum(i) && !isTime(i));
    const rows = preview.rows.length;
    if (rows === 1 && numIdx.length >= 1) { s.add("kpi"); s.add("gauge"); }
    if (preview.columns.some((_, i) => isTime(i)) && numIdx.length) { s.add("line"); s.add("area"); }
    if (catIdx.length >= 1 && numIdx.length >= 1) {
      const cats = new Set(preview.rows.map((r) => String(r[catIdx[0]]))).size;
      if (cats < 6) { s.add("pie"); s.add("donut"); s.add("radial"); }
      else if (cats <= 15) s.add("bar");
      else { s.add("treemap"); s.add("hbar"); }
    }
    if (numIdx.length >= 2) s.add("scatter");
    if (catIdx.length >= 2 && numIdx.length >= 1) s.add("heatmap");
    if (rows > 1) s.add("table");
    return s;
  }, [preview]);

  return (
    // Inline editing surface — takes the grid's place inside the dashboard
    // tab (no floating dialog).
    <div className="flex min-h-0 flex-1 flex-col bg-editor">
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

      <div className="flex min-h-0 flex-1">
        {/* Left: configuration form (bounded width). */}
        <div className="flex min-h-0 w-full max-w-[600px] flex-col border-r border-border">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <label className="block">
            <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8 w-full rounded-lg border border-border bg-editor px-2.5 text-[12.5px] outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
            />
          </label>

          {vizType === "markdown" ? (
            <div>
              <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Text (markdown)
              </span>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                spellCheck
                placeholder={"## Summary\n\nRevenue grew **12%** month over month, driven by…"}
                className="w-full resize-y rounded-lg border border-border bg-editor px-2.5 py-2 text-[12.5px] leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
              />
              {content.trim() ? (
                <div className="mt-2 rounded-lg border border-border/60 bg-panel/50 px-3 py-2 text-[12px] leading-relaxed text-foreground [&_a]:text-primary [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1 [&_h1]:font-bold [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-4">
                  <ReactMarkdown>{content}</ReactMarkdown>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className={vizType === "markdown" ? "hidden" : undefined}>
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Start from a template
            </span>
            <div className="relative mb-1.5">
              <button
                type="button"
                onClick={() => setDsOpen((v) => !v)}
                className="flex h-7 w-full items-center gap-1.5 rounded-lg border border-border bg-editor px-2 text-left text-[11.5px] outline-none hover:border-primary/40"
              >
                <span className={cn("min-w-0 flex-1 truncate", !dataset && "text-muted-foreground")}>
                  {dataset || "Pick a dataset (table / view / virtual schema)…"}
                </span>
                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
              </button>
              {dsOpen ? (
                <>
                  {/* click-away */}
                  <div className="fixed inset-0 z-40" onClick={() => setDsOpen(false)} />
                  <div className="absolute inset-x-0 top-8 z-50 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                    <Command loop>
                      <CommandInput autoFocus placeholder="Search tables & views…" className="h-8 text-[12px]" />
                      <CommandList className="max-h-64">
                        <CommandEmpty>No matching table or view.</CommandEmpty>
                        <div className="border-b border-border/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {connectionName || "Database"}
                        </div>
                        {[...new Set(datasets.map((d) => d.schema))].map((schema) => (
                          <CommandGroup key={schema} heading={schema}>
                            {datasets.filter((d) => d.schema === schema).map((d) => {
                              const full = `${d.schema}.${d.name}`;
                              return (
                                <CommandItem
                                  key={full}
                                  value={full}
                                  onSelect={() => { setDataset(full); setDsOpen(false); }}
                                  className="text-[11.5px]"
                                >
                                  <span className="min-w-0 flex-1 truncate">{d.name}</span>
                                  {dataset === full ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        ))}
                      </CommandList>
                    </Command>
                  </div>
                </>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  onClick={() => applyTemplate(t)}
                  title={t.hint}
                  className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className={vizType === "markdown" ? "hidden" : undefined}>
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
              <div className="mt-1 text-[11px]">
                <p className="text-destructive">{previewErr}</p>
                {/not found/i.test(previewErr) ? (
                  <p className="mt-0.5 text-muted-foreground">
                    Tip: pick a dataset from the list above — it fills the SQL with a real table name (SCHEMA.TABLE is just a placeholder).
                  </p>
                ) : null}
              </div>
            ) : preview ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                ✓ {preview.rowCount} rows · columns: {cols.join(", ")}
              </p>
            ) : null}
          </div>

          <div>
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground" title="Pick how this panel shows the query result — run Preview first and green dots mark the types that suit your data">
              Visualize as
            </span>
            {suggested.size ? (
              <p className="mb-1.5 text-[11px] text-muted-foreground">
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" /> Suggested for your data:{" "}
                {[...suggested].slice(0, 4).join(", ")}
              </p>
            ) : null}
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {VIZ_TILES.map((tile) => {
                const direct = tile.key === "kpi" || tile.key === "table" || tile.key === "explore";
                const active =
                  tile.key === "text"
                    ? vizType === "markdown"
                    : direct
                      ? vizType === tile.key
                      : vizType === "echarts" && chart === tile.key;
                return (
                  <button
                    key={tile.key}
                    title={tile.hint}
                    onClick={() => {
                      if (tile.key === "text") setVizType("markdown");
                      else if (direct) setVizType(tile.key as "kpi" | "table" | "explore");
                      else {
                        setVizType("echarts");
                        setChart(tile.key as ChartKind);
                      }
                    }}
                    className={cn(
                      "relative flex flex-col items-center gap-1 rounded-lg border p-1.5 transition-colors",
                      active
                        ? "border-primary/60 bg-primary/10 text-primary ring-1 ring-primary/30"
                        : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:bg-secondary/60 hover:text-foreground",
                    )}
                  >
                    <svg viewBox="0 0 48 26" className="h-[26px] w-full" fill="none" aria-hidden>
                      {tile.art}
                    </svg>
                    <span className="text-[10px] font-medium capitalize">{tile.key}</span>
                    {suggested.has(tile.key) ? (
                      <span
                        title="Suits the shape of your previewed data"
                        className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary"
                      />
                    ) : null}
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
                    <Select value={xField || "__first__"} onValueChange={(v) => setXField(v === "__first__" ? "" : v)}>
                      <SelectTrigger className="h-8 w-full text-[12px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__first__">(first column)</SelectItem>
                        {cols.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
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
                  <span
                    className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                    title="Which numeric columns become series — click the chips after Preview, or type names comma-separated. Empty = every numeric column"
                  >
                    Value columns
                  </span>
                  <input
                    value={yFields}
                    onChange={(e) => setYFields(e.target.value)}
                    placeholder="(all numeric columns)"
                    className="h-8 w-full rounded-lg border border-border bg-editor px-2.5 text-[12px] outline-none"
                  />
                  {cols.length ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {cols.map((c) => {
                        const list = yFields.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
                        const on = list.includes(c.toUpperCase());
                        return (
                          <button
                            key={c}
                            type="button"
                            title={on ? `Remove ${c} from the series` : `Add ${c} as a series`}
                            onClick={() =>
                              setYFields((on ? list.filter((x) => x !== c.toUpperCase()) : [...list, c]).join(", "))
                            }
                            className={cn(
                              "rounded-full border px-1.5 py-px text-[10px]",
                              on ? "border-primary/60 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {c}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </label>
              </div>
              <label
                className="flex items-center gap-2 text-[12px] text-foreground"
                title="Stack series on top of each other — composition instead of side-by-side comparison"
              >
                <input type="checkbox" checked={stacked} onChange={(e) => setStacked(e.target.checked)} /> Stacked
              </label>
              <details className="group">
                <summary
                  className="cursor-pointer list-none text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
                  title="For developers: any ECharts option JSON here merges OVER the generated chart — full control of every series, axis, and label"
                >
                  ▸ Advanced — raw ECharts option (JSON)
                </summary>
                <textarea
                  value={optionJson}
                  onChange={(e) => setOptionJson(e.target.value)}
                  rows={4}
                  spellCheck={false}
                  placeholder='{"yAxis": {"type": "log"}, "series": [{"label": {"show": true}}]}'
                  className="w-full resize-y rounded-lg border border-border bg-editor px-2.5 py-2 font-mono text-[11.5px] leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
                />
                {jsonErr ? <p className="mt-1 text-[11px] text-destructive">{jsonErr}</p> : null}
              </details>
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
        </div>

        {/* Right: live preview of the panel as it will look on the dashboard. */}
        <div className="flex min-h-0 flex-1 flex-col bg-panel/20">
          <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Live preview</span>
            {preview ? <span className="text-[10px] text-muted-foreground">· {preview.rowCount} rows</span> : null}
          </div>
          <div className="min-h-0 flex-1 p-3">
            <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border/70 bg-panel/60">
              <div className="shrink-0 truncate border-b border-border/50 px-3 py-1.5 text-[12px] font-medium text-foreground">{title || "New panel"}</div>
              <div className="min-h-0 flex-1">
                {vizType === "markdown" ? (
                  <div className="h-full overflow-y-auto px-3.5 py-2.5 text-[12.5px] leading-relaxed text-foreground [&_a]:text-primary [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1 [&_h1]:mb-1 [&_h1]:text-[16px] [&_h1]:font-bold [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-4">
                    <ReactMarkdown>{content || "*Nothing to preview yet.*"}</ReactMarkdown>
                  </div>
                ) : !profileId ? (
                  <Hint text="Connect to a database to preview." />
                ) : previewErr ? (
                  <Hint text={previewErr} error />
                ) : !preview ? (
                  <Hint text="Run Preview to see this panel live." />
                ) : vizType === "kpi" ? (
                  <KpiPanel panel={livePanel} result={preview} />
                ) : vizType === "table" ? (
                  <PerspectiveTable result={preview} />
                ) : vizType === "explore" ? (
                  <Hint text="Explore mode is configured directly on the panel." />
                ) : (() => {
                  const ev = previewViz as Extract<DashPanel["viz"], { type: "echarts" }>;
                  const simple = ["bar", "hbar", "line", "area", "pie", "donut", "radar", "radial"] as const;
                  const isSimple = !ev.option && (simple as readonly string[]).includes(ev.chart ?? "");
                  return isSimple ? (
                    <ShadcnChartPanel chart={ev.chart as (typeof simple)[number]} result={preview} />
                  ) : (
                    <ChartPanel panel={livePanel} result={preview} />
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
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
  );
}


/** Prebuilt chart starters — pick a dataset, tap one, adjust, done. */
const TEMPLATES: { label: string; hint: string; viz: "bar" | "line" | "area" | "pie" | "scatter" | "kpi" | "table" | "explore"; sql: (ds: string) => string }[] = [
  { label: "Breakdown bar", hint: "Count by a category", viz: "bar", sql: (ds) => `SELECT <category_column>, COUNT(*) AS CNT\nFROM ${ds}\nGROUP BY 1 ORDER BY 2 DESC LIMIT 20` },
  { label: "Time series", hint: "Metric over time", viz: "line", sql: (ds) => `SELECT TRUNC(<date_column>, 'MM') AS MONTH, SUM(<value_column>) AS TOTAL\nFROM ${ds}\nGROUP BY 1 ORDER BY 1` },
  { label: "Stacked area", hint: "Composition over time", viz: "area", sql: (ds) => `SELECT TRUNC(<date_column>, 'MM') AS MONTH, <category_column>, SUM(<value_column>) AS TOTAL\nFROM ${ds}\nGROUP BY 1, 2 ORDER BY 1` },
  { label: "Share donut", hint: "Proportions of a whole", viz: "pie", sql: (ds) => `SELECT <category_column>, SUM(<value_column>) AS TOTAL\nFROM ${ds}\nGROUP BY 1 ORDER BY 2 DESC LIMIT 10` },
  { label: "Correlation", hint: "Two measures, scattered", viz: "scatter", sql: (ds) => `SELECT <x_column>, <y_column>\nFROM ${ds}\nLIMIT 2000` },
  { label: "KPI total", hint: "One number that matters", viz: "kpi", sql: (ds) => `SELECT SUM(<value_column>) AS TOTAL\nFROM ${ds}` },
  { label: "Top-N table", hint: "Ranked records", viz: "table", sql: (ds) => `SELECT *\nFROM ${ds}\nORDER BY <value_column> DESC LIMIT 100` },
  { label: "Pivot studio", hint: "Drag-drop explore (Perspective)", viz: "explore", sql: (ds) => `SELECT *\nFROM ${ds}\nLIMIT 20000` },
];

/* ────────────────────────── Report export (md / html / pdf) ─────────────── */

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "dashboard";
}

function fmtNumber(raw: unknown): string {
  const num = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(num)) return String(raw ?? "—");
  if (Math.abs(num) >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (Math.abs(num) >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (Math.abs(num) >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
}

function kpiText(panel: DashPanel, result: StatementResult): string {
  const viz = panel.viz as Extract<DashPanel["viz"], { type: "kpi" }>;
  const field = viz.valueField?.toUpperCase();
  const idx = field ? result.columns.findIndex((c) => c.name === field) : 0;
  const value = fmtNumber(result.rows[0]?.[Math.max(idx, 0)]);
  return viz.unit ? `${value} ${viz.unit}` : value;
}

const MD_ROW_CAP = 50;

function mdTable(result: StatementResult): string {
  const esc = (v: unknown) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const cols = result.columns.map((c) => c.name);
  const rows = result.rows.slice(0, MD_ROW_CAP);
  const lines = [
    `| ${cols.join(" | ")} |`,
    `| ${cols.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`),
  ];
  if (result.rows.length > MD_ROW_CAP) lines.push("", `_…${result.rows.length - MD_ROW_CAP} more rows not shown._`);
  return lines.join("\n");
}

function buildMarkdownReport(dash: Dashboard, panels: DashPanel[], data: Map<string, StatementResult | null>): string {
  const parts: string[] = [`# ${dash.title}`, ""];
  if (dash.description) parts.push(dash.description, "");
  parts.push(`_Exported from Exasol Studio · ${new Date().toLocaleString()}_`, "");
  for (const p of panels) {
    if (p.viz.type === "markdown") {
      parts.push(p.viz.content, "");
      continue;
    }
    parts.push(`## ${p.title || "Panel"}`, "");
    const r = data.get(p.id);
    if (!r) {
      parts.push("_No data (not connected or the query failed)._", "");
      continue;
    }
    if (p.viz.type === "kpi") parts.push(`**${kpiText(p, r)}**`, "");
    else parts.push(mdTable(r), "");
    if (p.query?.sql) parts.push("```sql", p.query.sql.trim(), "```", "");
  }
  return parts.join("\n");
}

/** Render one chart offscreen and snapshot it as a PNG data URL. */
function chartPng(viz: Extract<DashPanel["viz"], { type: "echarts" }>, result: StatementResult): string | null {
  const built = buildChartOption(viz, result, { fg: "#555", border: "#ddd" });
  if (!built) return null;
  const div = document.createElement("div");
  div.style.cssText = "position:fixed;left:-10000px;top:0;width:840px;height:420px";
  document.body.appendChild(div);
  try {
    const chart = echarts.init(div, undefined, { renderer: "canvas" });
    chart.setOption({ ...built.primary, animation: false } as Parameters<typeof chart.setOption>[0], true);
    if (built.override) chart.setOption(built.override as Parameters<typeof chart.setOption>[0]);
    const url = chart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#ffffff" });
    chart.dispose();
    return url;
  } catch {
    return null;
  } finally {
    div.remove();
  }
}

/** Minimal markdown→HTML for narrative panels in exported reports. */
function mdToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  const out: string[] = [];
  let inList = false;
  for (const line of md.split("\n")) {
    const h = line.match(/^(#{1,4})\s+(.*)/);
    const li = line.match(/^\s*[-*]\s+(.*)/);
    if (li) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    if (h) out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

function buildHtmlReport(dash: Dashboard, panels: DashPanel[], data: Map<string, StatementResult | null>): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const sections: string[] = [];
  for (const p of panels) {
    if (p.viz.type === "markdown") {
      sections.push(`<section class="md">${mdToHtml(p.viz.content)}</section>`);
      continue;
    }
    const r = data.get(p.id);
    let body: string;
    if (!r) body = `<p class="muted">No data (not connected or the query failed).</p>`;
    else if (p.viz.type === "kpi") body = `<p class="kpi">${esc(kpiText(p, r))}</p>`;
    else if (p.viz.type === "echarts") {
      const png = chartPng(p.viz, r);
      body = png ? `<img src="${png}" alt="${esc(p.title)}" />` : `<p class="muted">No data.</p>`;
    } else {
      const cols = r.columns.map((c) => `<th>${esc(c.name)}</th>`).join("");
      const rows = r.rows
        .slice(0, MD_ROW_CAP)
        .map((row) => `<tr>${row.map((v) => `<td>${esc(String(v ?? ""))}</td>`).join("")}</tr>`)
        .join("\n");
      const more = r.rows.length > MD_ROW_CAP ? `<p class="muted">…${r.rows.length - MD_ROW_CAP} more rows not shown.</p>` : "";
      body = `<table><thead><tr>${cols}</tr></thead><tbody>${rows}</tbody></table>${more}`;
    }
    sections.push(`<section><h2>${esc(p.title || "Panel")}</h2>${body}</section>`);
  }
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(dash.title)}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1c1c1e;max-width:880px;margin:32px auto;padding:0 24px;line-height:1.5}
  h1{font-size:26px;margin-bottom:2px} h2{font-size:16px;margin:26px 0 8px;border-bottom:1px solid #e5e5ea;padding-bottom:4px}
  .sub{color:#6e6e73;font-size:12px;margin-bottom:24px}
  .kpi{font-size:30px;font-weight:700;margin:6px 0}
  img{max-width:100%;border:1px solid #e5e5ea;border-radius:8px}
  table{border-collapse:collapse;width:100%;font-size:12px} th,td{border:1px solid #e5e5ea;padding:5px 8px;text-align:left}
  th{background:#f5f5f7} .muted{color:#6e6e73;font-size:12px}
  code{background:#f5f5f7;border-radius:4px;padding:1px 4px;font-size:12px}
  section.md{margin:18px 0}
  @media print { body{margin:0 auto} section{break-inside:avoid} }
</style></head>
<body>
<h1>${esc(dash.title)}</h1>
<p class="sub">${esc(dash.description || "")}${dash.description ? " · " : ""}Exported from Exasol Studio · ${new Date().toLocaleString()}</p>
${sections.join("\n")}
</body></html>`;
}

/** Print an HTML report via a hidden iframe (macOS print dialog → Save as PDF). */
function printHtml(html: string) {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      /* surfaced via the export note */
    }
    setTimeout(() => frame.remove(), 120_000);
  };
  frame.srcdoc = html;
}
