// The chart editor beside a chart: what to draw, how it looks, what is
// written on it. Controls appear only where they apply.

import type { CellViz } from "@/features/workbench/notebook-cell";
import { ChartKindPicker } from "@/features/workbench/cell-viz";
import { AXISLESS } from "@/features/bi/chart-option";
import type { ColumnMeta } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { isNumericType } from "./model.ts";

export function ChartEditor({ chart, viz, columns, onChange }: { chart: string; viz: CellViz; columns: ColumnMeta[]; onChange: (chart: string, viz: CellViz) => void }) {
  const measures = columns.filter((c) => isNumericType(c.typeName));
  const axisless = AXISLESS.has(chart);
  const toggle = (name: string) => {
    const cur = viz.yFields ?? [];
    onChange(chart, { ...viz, yFields: cur.includes(name) ? cur.filter((y) => y !== name) : [...cur, name] });
  };
  return (
    <div className="flex w-56 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border/60 p-2.5 text-[11px]">
      <Section title="What to draw">
        <Row label="Chart">
          <ChartKindPicker value={chart} onChange={(k) => onChange(k, viz)} />
        </Row>
        <Row label={axisless ? "Slices" : "By"}>
          <select value={viz.xField ?? ""} onChange={(e) => onChange(chart, { ...viz, xField: e.target.value || undefined })} className="nodrag w-full rounded border border-border bg-background px-1.5 py-1 text-foreground">
            <option value="">(first column)</option>
            {columns.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label={axisless ? "Of" : "Measure"}>
          <div className="flex flex-col gap-0.5">
            {(measures.length ? measures : columns.slice(1)).map((c) => {
              const on = (viz.yFields ?? []).includes(c.name);
              return (
                <button key={c.name} onClick={() => toggle(c.name)} className={cn("nodrag flex items-center gap-1.5 rounded px-1.5 py-0.5 text-left", on ? "bg-primary/10 text-primary" : "text-foreground hover:bg-secondary")}>
                  <span className={cn("h-2.5 w-2.5 rounded-sm border", on ? "border-primary bg-primary" : "border-border")} />
                  <span className="truncate">{c.name}</span>
                </button>
              );
            })}
            {!columns.length ? <span className="text-muted-foreground">Run the source first.</span> : null}
          </div>
        </Row>
      </Section>
      {!axisless ? (
        <Section title="How it looks">
          <label className="nodrag flex items-center gap-1.5 text-foreground">
            <input type="checkbox" checked={!!viz.stacked} onChange={(e) => onChange(chart, { ...viz, stacked: e.target.checked })} /> Stack the series
          </label>
          <Row label="Direction">
            <div className="flex gap-1">
              {[
                ["bar", "Columns"],
                ["hbar", "Bars"],
              ].map(([k, label]) => (
                <button key={k} onClick={() => onChange(k, viz)} className={cn("nodrag rounded border px-2 py-0.5", chart === k ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-secondary")}>
                  {label}
                </button>
              ))}
            </div>
          </Row>
        </Section>
      ) : null}
      <Section title="Anything else">
        <textarea
          aria-label="Raw ECharts option (JSON)"
          placeholder='ECharts option JSON, merged on top, e.g. {"legend":{"show":false}}'
          defaultValue={viz.option ? JSON.stringify(viz.option, null, 1) : ""}
          onBlur={(e) => {
            const text = e.target.value.trim();
            if (!text) return onChange(chart, { ...viz, option: undefined });
            try {
              onChange(chart, { ...viz, option: JSON.parse(text) as Record<string, unknown> });
            } catch {
              e.target.setCustomValidity("Not valid JSON");
              e.target.reportValidity();
            }
          }}
          className="nodrag nowheel h-20 w-full resize-none rounded border border-border bg-background p-1.5 font-mono text-[10px] text-foreground placeholder:text-muted-foreground/60"
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
