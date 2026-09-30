// A chart on a box's rows. Marks can be selected; the rows behind them are
// one press away; Evidence shows how the chart came to be.

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { BarChart3, Download, FileSearch, Image, Pencil, Rows3, Table2 } from "lucide-react";
import { buildChartOption, type EchartsViz } from "@/features/bi/chart-option";
import type { CellViz } from "@/features/workbench/notebook-cell";
import { ResultsGrid } from "@/components/studio/ResultsGrid";
import { toCsv } from "@/lib/result-stats";
import type { StatementResult } from "@/lib/ipc";
import { BoxFrame } from "./BoxFrame.tsx";
import { ChartEditor } from "./ChartEditor.tsx";
import { Evidence } from "./Evidence.tsx";
import { useCanvas, useCanvasStore, useZoom, LOD } from "./context.ts";
import { downloadText, downloadUrl, fileName } from "./download.ts";
import { byId, compileSql, lineage, type ChartBox as ChartBoxModel } from "./model.ts";
import type { HaloAction } from "./Halo.tsx";
import { picksFrom, selectionValues } from "./selection.ts";

function Chart({ chart, viz, result, onSelect, chartRef }: { chart: string; viz: CellViz; result: StatementResult; onSelect: (picks: { dataIndex: number; name?: string }[]) => void; chartRef: React.MutableRefObject<import("echarts").ECharts | null> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(false);
  // The latest handler, read at event time: a selection must not rebuild the chart.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  useEffect(() => {
    if (!ref.current) return;
    let disposed = false;
    const built = buildChartOption({ type: "echarts", chart, ...viz } as EchartsViz, result);
    setEmpty(!built);
    if (!built) return;
    void import("echarts").then((echarts) => {
      if (disposed || !ref.current) return;
      const inst = echarts.init(ref.current, undefined, { renderer: "canvas" });
      chartRef.current = inst;
      inst.setOption(built.primary);
      // Marks are selectable: what the person picks is what "rows behind" reads.
      inst.setOption({ series: ((built.primary.series as unknown[]) ?? []).map(() => ({ selectedMode: "multiple" })) });
      if (built.override) inst.setOption(built.override);
      inst.on("selectchanged", (p: unknown) => {
        const sel = (p as { selected?: { seriesIndex: number; dataIndex: number[] }[] }).selected ?? [];
        const series = (inst.getOption() as { series?: { data?: unknown[] }[] }).series ?? [];
        onSelectRef.current(picksFrom(sel, series.map((s) => s.data), chart));
      });
    });
    const ro = new ResizeObserver(() => chartRef.current?.resize());
    ro.observe(ref.current);
    return () => {
      disposed = true;
      ro.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, [chart, viz, result, chartRef]);
  // The drawing surface stays mounted through an empty result, so rows that
  // arrive later have somewhere to be drawn.
  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="h-full w-full" />
      {empty ? <p className="absolute inset-0 flex items-center justify-center px-3 text-center text-[12px] text-muted-foreground">No rows to chart yet.</p> : null}
    </div>
  );
}

export const ChartBoxNode = memo(function ChartBoxNode({ id, selected }: NodeProps) {
  const box = useCanvas((s) => s.doc.boxes.find((b) => b.id === id)) as ChartBoxModel | undefined;
  const run = useCanvas((s) => s.runs[id]);
  const sel = useCanvas((s) => s.selections[id]);
  const doc = useCanvas((s) => s.doc);
  const store = useCanvasStore();
  const zoom = useZoom();
  const [pane, setPane] = useState<"chart" | "edit" | "evidence">("chart");
  const chartRef = useRef<import("echarts").ECharts | null>(null);
  const result = run?.result;
  const compiled = useMemo(() => {
    if (!box) return { sql: null, error: null };
    try {
      return { sql: compileSql(box, byId(doc)), error: null };
    } catch (e) {
      return { sql: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [box, doc]);
  const actions = useMemo<HaloAction[]>(() => {
    if (!box) return [];
    const hasRows = !!result?.rows.length;
    return [
      { id: "edit", label: pane === "edit" ? "Back to the chart" : "Edit the chart", icon: Pencil, side: "top", active: pane === "edit", onClick: () => setPane(pane === "edit" ? "chart" : "edit") },
      { id: "evidence", label: pane === "evidence" ? "Back to the chart" : "Evidence — how this chart was made", icon: FileSearch, side: "top", active: pane === "evidence", onClick: () => setPane(pane === "evidence" ? "chart" : "evidence") },
      {
        id: "png",
        label: "Export the chart as PNG",
        icon: Image,
        side: "top",
        disabled: !chartRef.current,
        onClick: () => {
          const url = chartRef.current?.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--panel").trim() || "#fff" });
          if (url) downloadUrl(fileName(box.name, "png"), url);
        },
      },
      {
        id: "csv",
        label: "Export the charted rows as CSV",
        icon: Download,
        side: "top",
        disabled: !hasRows,
        onClick: () => result && downloadText(fileName(box.name, "csv"), toCsv(result.columns, result.rows), "text/csv;charset=utf-8;"),
      },
      { id: "sql", label: "Query these rows with SQL", icon: Table2, mark: "SQL", side: "right", onClick: () => store.getState().addQuery([id]) },
      { id: "chart", label: "Another chart of the same rows", icon: BarChart3, side: "right", disabled: !hasRows, onClick: () => store.getState().addChart(box.source) },
      { id: "rows", label: sel ? `Show the ${sel.values.length} selected ${sel.values.length === 1 ? "value's" : "values'"} rows` : "Show the rows behind the selection (select marks first)", icon: Rows3, side: "right", disabled: !sel, onClick: () => store.getState().showRowsBehind(id) },
    ];
  }, [box, id, store, result, pane, sel]);
  if (!box) return null;
  const columns = result?.columns ?? [];
  const onSelect = (picks: { dataIndex: number; name?: string }[]) => result && store.getState().setSelection(id, selectionValues(result, box.viz.xField, picks));
  const editorHidden = zoom < LOD.editor;
  return (
    <BoxFrame id={id} title={box.name} icon={BarChart3} accent="#f59e0b" selected={!!selected} actions={actions} run={run} idleText="Waiting for its source's rows" onRename={(n) => store.getState().setName(id, n)}>
      {pane === "evidence" ? (
        <Evidence steps={lineage(id, byId(doc))} compiled={compiled.sql} error={compiled.error} />
      ) : (
        <div className="flex min-h-0 flex-1">
          {pane === "edit" && !editorHidden ? <ChartEditor chart={box.chart} viz={box.viz} columns={columns} onChange={(c, v) => store.getState().setViz(id, c, v)} /> : null}
          <div className="relative min-h-0 min-w-0 flex-1">
            {!result ? (
              <div className="flex h-full items-center justify-center p-4 text-center text-[11.5px] text-muted-foreground">{run?.status === "error" ? <span className="text-destructive">{run.error}</span> : run?.status === "running" ? "Drawing when the rows arrive…" : "This chart draws its source's rows once they are fetched."}</div>
            ) : box.chart === "table" ? (
              <ResultsGrid result={result} error={null} hideToolbar fontSize={11} zebra />
            ) : (
              <Chart chart={box.chart} viz={box.viz} result={result} onSelect={onSelect} chartRef={chartRef} />
            )}
            {sel ? (
              <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center gap-2 rounded-md border border-primary/40 bg-panel/90 px-2 py-1 text-[10.5px] text-foreground shadow-sm">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-mono">{sel.field}</span> = {sel.values.map((v) => String(v ?? "NULL")).join(", ")}
                </span>
                <button onClick={() => store.getState().showRowsBehind(id)} className="nodrag shrink-0 rounded bg-primary px-1.5 py-0.5 font-medium text-primary-foreground hover:bg-primary/85">
                  Show rows
                </button>
                <button
                  onClick={() => {
                    store.getState().setSelection(id, null);
                    chartRef.current?.dispatchAction({ type: "unselect", seriesIndex: 0, dataIndex: result?.rows.map((_, i) => i) ?? [] });
                  }}
                  className="nodrag shrink-0 text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </BoxFrame>
  );
});
