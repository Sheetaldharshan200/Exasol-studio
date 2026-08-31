import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { buildChartOption, type EchartsViz } from "@/features/bi/chart-option";
import { VIZ_TILES, vizTile } from "@/features/bi/viz-tiles";
import { kpiValue } from "@/features/workbench/notebook-cell";
import type { StatementResult } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The visual chart-kind picker: a dropdown of mini-chart tiles (picture +
 * name), one per kind the notebook can render. "table" is the grid default.
 */
export function ChartKindPicker({ value, onChange }: { value: string; onChange: (kind: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = vizTile(value) ?? vizTile("table")!;
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          title="Visualization type"
          className="flex h-6 items-center gap-1.5 rounded-md border border-border bg-background/60 px-1.5 text-[10.5px] text-muted-foreground hover:text-foreground"
        >
          <svg viewBox="0 0 48 28" className="h-4 w-7">{current.art}</svg>
          <span className="capitalize">{current.key}</span>
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[340px] p-2">
        <div className="grid grid-cols-3 gap-1.5">
          {VIZ_TILES.map((t) => (
            <button
              key={t.key}
              title={t.hint}
              onClick={() => {
                onChange(t.key);
                setOpen(false);
              }}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border px-2 py-2 transition-colors",
                value === t.key ? "border-primary/60 bg-primary/10" : "border-border/70 hover:bg-secondary/60",
              )}
            >
              <svg viewBox="0 0 48 28" className="h-8 w-full text-muted-foreground">{t.art}</svg>
              <span className="text-[10.5px] font-medium capitalize text-foreground">{t.key}</span>
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One big number from the result — the KPI tile. */
export function KpiCell({ result }: { result: StatementResult }) {
  const kpi = result.kind === "resultSet" ? kpiValue(result.columns, result.rows) : null;
  if (!kpi) return <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">No value to show.</p>;
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-8">
      <span className="font-heading text-4xl font-bold tracking-tight text-primary tabular-nums">{kpi.value}</span>
      <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{kpi.label}</span>
    </div>
  );
}

/** ECharts-rendered kinds (scatter, heatmap, funnel, treemap, gauge) — lazy
 *  echarts, option from the shared pure builder. */
export function EchartsCell({ chart, result }: { chart: string; result: StatementResult }) {
  const ref = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(false);
  useEffect(() => {
    if (!ref.current || result.kind !== "resultSet") return;
    let instance: import("echarts").ECharts | null = null;
    let disposed = false;
    const built = buildChartOption({ type: "echarts", chart } as EchartsViz, result);
    setEmpty(!built);
    if (!built) return;
    void import("echarts").then((echarts) => {
      if (disposed || !ref.current) return;
      instance = echarts.init(ref.current, undefined, { renderer: "canvas" });
      instance.setOption(built.primary);
      if (built.override) instance.setOption(built.override);
    });
    const ro = new ResizeObserver(() => instance?.resize());
    ro.observe(ref.current);
    return () => {
      disposed = true;
      ro.disconnect();
      instance?.dispose();
    };
  }, [chart, result]);
  if (result.kind !== "resultSet" || empty) {
    return <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">No rows to chart.</p>;
  }
  return <div ref={ref} className="h-full w-full" />;
}
