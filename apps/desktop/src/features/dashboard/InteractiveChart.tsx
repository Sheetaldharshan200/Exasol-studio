// An INTERACTIVE dashboard chart (echarts) — the thing that turns a static
// "picture" into an explorable chart: zoom + pan (dataZoom), a rich hover
// tooltip, a toolbox (box-zoom, reset, save image), a clickable legend, and
// click-to-cross-filter (clicking a category writes a dashboard parameter, so
// the rest of the dashboard filters to it). Colors match the app's shadcn
// palette. Built on the shared buildChartOption so the data mapping is one place.

import { useEffect, useRef } from "react";
import { buildChartOption, AXISLESS, type EchartsViz } from "@/features/bi/chart-option";
import type { StatementResult } from "@/lib/ipc";

// The shadcn --chart-1..5 palette, so interactive charts match the app colors.
const MULTI = ["#5fc33b", "#3f6fbf", "#f59e0b", "#1fa08b", "#7c5cd6"];

const fmtNum = (v: unknown): string => {
  const n = Number(v);
  return Number.isFinite(n) ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(n) : String(v ?? "");
};
const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Read the app's theme colors so the chart matches Studio (light + dark). */
function themeColors() {
  const s = typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const g = (n: string, f: string) => s?.getPropertyValue(n).trim() || f;
  return { fg: g("--foreground", "#0b1730"), muted: g("--muted-foreground", "#566481"), border: g("--border", "#dce3ee") };
}

export function InteractiveChart({
  kind,
  result,
  viz,
  editing,
  onCrossFilter,
}: {
  kind: string;
  result: StatementResult;
  viz?: { xField?: string; yFields?: string[]; option?: Record<string, unknown> };
  /** In edit mode the widget shows its own top-right controls — shift the chart
   *  toolbox left so they don't overlap. */
  editing?: boolean;
  /** Clicking a category calls this with its value — used to cross-filter. */
  onCrossFilter?: (value: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cbRef = useRef(onCrossFilter);
  cbRef.current = onCrossFilter;
  // `viz` is a fresh object each render — depend on a STABLE key so the render
  // effect only fires on a real change.
  const vizKey = `${viz?.xField ?? ""}|${(viz?.yFields ?? []).join(",")}|${viz?.option ? JSON.stringify(viz.option) : ""}`;

  // The live echarts instance is created ONCE and kept alive. Data/filter changes
  // update it via setOption so echarts smoothly morphs bars/lines to the new
  // values (no dispose+re-init, which replayed the grow-from-zero flicker on
  // every cross-filter). `render` reads the latest inputs through a ref.
  const instRef = useRef<import("echarts").ECharts | null>(null);
  const stateRef = useRef({ kind, result, viz, editing });
  stateRef.current = { kind, result, viz, editing };
  const renderRef = useRef<() => void>(() => {});

  renderRef.current = () => {
    const inst = instRef.current;
    if (!inst) return;
    const { kind, result, viz, editing } = stateRef.current;
    if (result.kind !== "resultSet" || !result.rows.length) return;
    const built = buildChartOption({ type: "echarts", chart: kind, ...viz } as unknown as EchartsViz, result);
    if (!built) return;
    const axisless = AXISLESS.has(kind);

    const tooltipFormatter = axisless
      ? undefined
      : (ps: Array<{ marker?: string; seriesName?: string; name?: string; axisValueLabel?: string; value?: unknown }>) => {
          const arr = Array.isArray(ps) ? ps : [ps];
          const head = `<div style="font-weight:600;margin-bottom:5px">${escapeHtml(arr[0]?.axisValueLabel ?? arr[0]?.name ?? "")}</div>`;
          const rows = arr
            .map((p) => {
              const v = Array.isArray(p.value) ? p.value[p.value.length - 1] : p.value;
              return `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px"><span style="display:inline-flex;align-items:center;gap:6px">${p.marker ?? ""}${escapeHtml(p.seriesName ?? "")}</span><span style="font-weight:600;font-variant-numeric:tabular-nums">${fmtNum(v)}</span></div>`;
            })
            .join("");
          return head + rows;
        };

    // Themed, de-cluttered option — transparent background (so the app card shows
    // through), app text/grid colors, compact labels, small circle legend, minimal
    // toolbox, and scroll-to-zoom (no bulky slider).
    const buildOpt = (t: { fg: string; muted: string; border: string }): Record<string, unknown> => {
      const o: Record<string, unknown> = {
        ...built.primary,
        color: MULTI,
        backgroundColor: "transparent",
        textStyle: { color: t.muted, fontSize: 11 },
        tooltip: {
          trigger: axisless ? "item" : "axis",
          appendToBody: true,
          confine: false,
          textStyle: { fontSize: 11 },
          extraCssText: "max-width:300px;white-space:normal;line-height:1.5;box-shadow:0 4px 16px rgba(0,0,0,.22);border-radius:8px;padding:8px 10px;",
          formatter: tooltipFormatter,
        },
        // Legend at the BOTTOM so the top-right belongs to the toolbox alone — no
        // collision, and it reads clean. Toolbox shifts left in edit mode to clear
        // the widget's own controls.
        legend: { type: "scroll", bottom: 2, left: "center", icon: "circle", itemWidth: 8, itemHeight: 8, itemGap: 14, textStyle: { color: t.fg, fontSize: 10 }, inactiveColor: t.border, pageIconColor: t.muted, pageIconInactiveColor: t.border, pageTextStyle: { color: t.muted } },
        toolbox: {
          // Arrange mode is for layout, not exploration — and its widget controls
          // (drag grip + gear) own the top-right corner. So HIDE the chart toolbox
          // while editing and show it top-right only in view mode, where nothing
          // else sits there. Scroll-to-zoom still works in both modes.
          show: !editing,
          right: 6,
          top: 3,
          itemSize: 13,
          itemGap: 9,
          iconStyle: { borderColor: t.muted, borderWidth: 1.2 },
          emphasis: { iconStyle: { borderColor: t.fg } },
          feature: {
            // Drag a region to zoom INTO it (the "zoom there" gesture).
            dataZoom: { title: { zoom: "Zoom to selection", back: "Reset zoom" }, yAxisIndex: "none" },
            restore: { title: "Reset" },
            saveAsImage: { title: "Save", pixelRatio: 2, backgroundColor: "transparent" },
          },
        },
      };
      if (!axisless) {
        o.grid = { left: 4, right: 12, top: 22, bottom: 30, containLabel: true };
        // Zoom the X-AXIS ONLY (scroll toward the cursor, drag to pan). The y-axis
        // keeps its own auto-scale so its labels never vanish on zoom.
        o.dataZoom = [{ type: "inside", xAxisIndex: 0, throttle: 50, zoomOnMouseWheel: true, moveOnMouseMove: true, moveOnMouseWheel: false }];
        // MERGE styling onto the base axes — never replace them, or we'd drop the
        // category `type` + `data` that buildChartOption set (echarts would then
        // fall back to a numeric value X-axis and plot value-vs-value). The base
        // already knows which axis is the category (swapped for hbar); we only
        // restyle. fmtNum on a category axis is harmless — it passes text through.
        const baseX = (o.xAxis ?? {}) as Record<string, unknown>;
        const baseY = (o.yAxis ?? {}) as Record<string, unknown>;
        const isCat = (a: Record<string, unknown>) => a.type === "category";
        o.xAxis = { ...baseX, axisLabel: { color: t.muted, fontSize: 9, hideOverlap: true, ...(isCat(baseX) ? {} : { formatter: fmtNum, showMinLabel: true, showMaxLabel: true }) }, axisTick: { show: false }, axisLine: { lineStyle: { color: t.border } }, splitLine: { show: false }, ...(isCat(baseX) ? {} : { scale: false }) };
        o.yAxis = { ...baseY, axisLabel: { color: t.muted, fontSize: 9, hideOverlap: true, ...(isCat(baseY) ? {} : { formatter: fmtNum, showMinLabel: true, showMaxLabel: true }) }, axisTick: { show: false }, axisLine: { show: false }, splitLine: { lineStyle: { color: t.border, type: "dashed" } }, ...(isCat(baseY) ? {} : { scale: false }) };
      }
      return o;
    };

    // notMerge so a changed axis/series count is replaced cleanly; echarts still
    // animates the transition between the previous and new state (bars morph, no
    // re-grow-from-zero) because the instance is kept alive.
    inst.setOption(buildOpt(themeColors()), { notMerge: true });
    if (built.override) inst.setOption(built.override);
  };

  // Create the instance ONCE, wire click + resize + theme observers, first render.
  useEffect(() => {
    let ro: ResizeObserver | null = null;
    let mo: MutationObserver | null = null;
    let disposed = false;
    void import("echarts").then((echarts) => {
      if (!ref.current || disposed) return;
      const inst = echarts.init(ref.current, undefined, { renderer: "canvas" });
      instRef.current = inst;
      // Click a bar/point/slice → cross-filter the dashboard to that category.
      inst.on("click", (p: { name?: string; value?: unknown }) => {
        const v = p?.name;
        if (cbRef.current && v != null && v !== "") cbRef.current(String(v));
      });
      // Re-render (re-theme) when the app switches light/dark.
      mo = new MutationObserver(() => renderRef.current());
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
      ro = new ResizeObserver(() => inst.resize());
      ro.observe(ref.current);
      renderRef.current();
    });
    return () => {
      disposed = true;
      mo?.disconnect();
      ro?.disconnect();
      instRef.current?.dispose();
      instRef.current = null;
    };
  }, []);

  // Data / filter / mode changes → smooth setOption update, never a re-init.
  useEffect(() => {
    renderRef.current();
  }, [kind, result, vizKey, editing]);

  return <div ref={ref} className="h-full w-full" />;
}
