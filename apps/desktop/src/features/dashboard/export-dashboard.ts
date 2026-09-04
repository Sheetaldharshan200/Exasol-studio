// Export a dashboard to a portable file. Gathers each data widget's current
// result (running its param-bound query once), builds the pure snapshot, and
// delivers it: HTML/Markdown via a save dialog, PDF via the print path (reusing
// the notebook exporter's print helper). The rendering is the tested pure
// buildSnapshot; this module is just the IO around it.

import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { ipc } from "@/lib/ipc";
import { printNotebookHtml } from "@/features/workbench/notebook-export";
import { buildChartOption, type EchartsViz } from "@/features/bi/chart-option";
import { bindParams } from "./params";
import { applyCrossFilters, getCrossFilters } from "./cross-filter";
import { drillSql } from "./drill-sql";
import { getDrill } from "./drill-store";
import { buildSnapshot, type SnapshotOpts } from "./snapshot";
import { captureChartPng } from "./chart-capture";
import type { CachedResult } from "./store";
import type { DashboardDoc } from "./model";
import type { DashConn } from "./useWidgetData";

export type ExportFormat = "html" | "md" | "pdf";
export type ExportResult = { ok: boolean; path?: string; error?: string };

const EXPORT_ROWS = 500;
// The shadcn --chart-1..5 palette, so exported charts match the in-app colors.
const CHART_MULTI = ["#5fc33b", "#3f6fbf", "#f59e0b", "#1fa08b", "#7c5cd6"];

/** echarts source, inlined into the artifact so interactive charts work offline.
 *  Loaded as a code-split chunk only when an artifact is built. */
let runtimeCache: string | null = null;
async function loadRuntime(): Promise<string | undefined> {
  if (runtimeCache !== null) return runtimeCache;
  try {
    const mod = await import("echarts/dist/echarts.min.js?raw");
    runtimeCache = (mod as { default: string }).default;
  } catch {
    runtimeCache = "";
  }
  return runtimeCache || undefined;
}

/** Render the dashboard's current data to a self-contained, theme-aware,
 *  INTERACTIVE HTML artifact (hover tooltips + light/dark toggle). Charts are
 *  interactive echarts (matching colors) with the captured shadcn image as the
 *  fallback, so it looks like the in-app dashboard and hovering shows the info. */
export async function renderSnapshotHtml(doc: DashboardDoc, conn: DashConn, generatedAt?: string): Promise<string> {
  const { cache, opts } = await collectForSnapshot(doc, conn);
  return buildSnapshot(doc, cache, generatedAt, opts).html;
}

/** Run each data widget's bound query once, capture the live chart image, and
 *  build the interactive echarts option — plus inline the runtime. */
async function collectForSnapshot(doc: DashboardDoc, conn: DashConn): Promise<{ cache: Record<string, CachedResult>; opts: SnapshotOpts }> {
  const cache: Record<string, CachedResult> = {};
  const chartImages: Record<string, string> = {};
  const chartOptions: Record<string, unknown> = {};

  // Capture the currently-rendered charts (SVG for shadcn, canvas for echarts).
  for (const w of doc.widgets) {
    if (w.type !== "chart") continue;
    const png = await captureChartPng(w.id);
    if (png) chartImages[w.id] = png;
  }

  if (conn) {
    for (const w of doc.widgets) {
      if (!w.query) continue;
      const { sql, missing } = bindParams(w.query, doc.params);
      if (missing.length) {
        cache[w.id] = { error: `Unknown parameter: ${missing.join(", ")}` };
        continue;
      }
      // Apply the SAME drill + cross-filters as the live dashboard, so the export
      // reflects exactly what's on screen. Fall back if the filtered query errors.
      const drill = w.props?.drill as string[] | undefined;
      const measure = w.props?.measure as string | undefined;
      const drilled = drill?.length && measure ? drillSql(sql, drill, measure, getDrill(w.id)) : sql;
      const wrapped = applyCrossFilters(drilled, getCrossFilters(), w.id);
      const runOne = async (q: string) => {
        try {
          const resp = await ipc.executeSql(conn.profileId, conn.connectionName, q, EXPORT_ROWS, false, false);
          const r = resp.results?.[0];
          return r && !r.error ? r : null;
        } catch {
          return null;
        }
      };
      const r = (await runOne(wrapped)) ?? (await runOne(drilled));
      if (r) {
        cache[w.id] = { columns: r.columns.map((c) => c.name), rows: r.rows as unknown[][], value: r.rows?.[0]?.[0] };
        if (w.type === "chart") {
          const viz = { type: "echarts", chart: (w.props?.kind as string) ?? "bar", xField: w.props?.xField, yFields: w.props?.yFields } as unknown as EchartsViz;
          const built = buildChartOption(viz, r, { fg: "#64748b", border: "#cbd5e1" });
          if (built) chartOptions[w.id] = { ...built.primary, color: CHART_MULTI };
        }
      }
    }
  }

  const runtimeJs = Object.keys(chartOptions).length ? await loadRuntime() : undefined;
  return { cache, opts: { chartImages, chartOptions, runtimeJs } };
}

const slugify = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "dashboard";

/** Export the dashboard in the chosen format; returns where it landed. */
export async function exportDashboard(doc: DashboardDoc, conn: DashConn, format: ExportFormat): Promise<ExportResult> {
  const { cache, opts } = await collectForSnapshot(doc, conn);
  const { html, md } = buildSnapshot(doc, cache, undefined, opts);

  if (format === "pdf") {
    printNotebookHtml(html);
    return { ok: true };
  }

  const ext = format;
  const content = format === "md" ? md : html;
  try {
    const path = await saveDialog({ defaultPath: `${slugify(doc.title)}.${ext}`, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (!path) return { ok: false };
    await ipc.writeTextFile(path, content);
    return { ok: true, path };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
