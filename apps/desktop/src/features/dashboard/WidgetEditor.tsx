// The per-widget edit form shown (in edit mode) over a widget: write its SQL,
// set its title, pick a chart kind and color, name a filter's parameter, etc.
// Every change dispatches an update_widget patch, so the document stays the one
// source of truth and the assistant and the user edit through the same ops.

import { useState } from "react";
import Editor from "@monaco-editor/react";
import { BookOpen } from "lucide-react";
import { ChartKindPicker } from "@/features/workbench/cell-viz";
import { defineMonacoThemes } from "@/components/studio/monaco-theme";
import { registerExasolCompletion, getSharedCatalog } from "@/lib/sql-completion";
import type { Widget, WidgetPatch } from "./model";
import { widgetRegistry } from "./registry-instance";

const isDark = () =>
  typeof document !== "undefined" &&
  (document.documentElement.classList.contains("dark") ||
    document.documentElement.getAttribute("data-theme") === "dark" ||
    (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches));

const CHART_KINDS = new Set(["bar", "hbar", "line", "area", "pie", "donut", "scatter"]);

export function WidgetEditor({ widget, onEdit, onClose, contentLocked, onEditSource }: { widget: Widget; onEdit: (patch: WidgetPatch) => void; onClose: () => void; contentLocked?: boolean; onEditSource?: () => void }) {
  const dataBacked = widgetRegistry.get(widget.type)?.dataBacked ?? false;
  const props = widget.props ?? {};
  const [query, setQuery] = useState(widget.query ?? "");
  const [title, setTitle] = useState((props.title as string) ?? "");
  const [text, setText] = useState((props.text as string) ?? "");
  const [xField, setXField] = useState((props.xField as string) ?? "");
  const [yFields, setYFields] = useState(((props.yFields as string[]) ?? []).join(", "));
  const [cross, setCross] = useState((props.crossFilter as string) ?? "");
  const [drill, setDrill] = useState(((props.drill as string[]) ?? []).join(", "));
  const [measure, setMeasure] = useState((props.measure as string) ?? "");
  const [clickFilter, setClickFilter] = useState(props.clickFilter !== false);
  const [param, setParam] = useState((props.param as string) ?? "");
  const [options, setOptions] = useState(((props.options as Array<string | number>) ?? []).join(", "));
  const [label, setLabel] = useState((props.label as string) ?? "");

  const field = "w-full rounded-md border border-border bg-background px-2 py-1 text-[12px] text-foreground outline-none";
  const row = "flex flex-col gap-1";
  const lbl = "text-[10px] uppercase tracking-wide text-muted-foreground";

  return (
    <div data-no-drag className="absolute inset-0 z-20 flex flex-col gap-2 overflow-auto bg-background/98 p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold capitalize text-foreground">Edit {widget.type}</span>
        <button onClick={onClose} className="rounded-md border border-border px-2 py-0.5 text-[11px] hover:bg-muted">Done</button>
      </div>

      {onEditSource ? (
        <button
          onClick={onEditSource}
          className="flex items-center justify-center gap-1.5 rounded-md border border-primary/50 px-2 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/10"
          title="Open the source notebook to change this chart's query & type"
        >
          <BookOpen className="h-3.5 w-3.5" /> Edit chart in notebook
        </button>
      ) : null}

      <div className={row}>
        <span className={lbl}>Title</span>
        <input data-bare className={field} value={title} placeholder="(optional)" onChange={(e) => setTitle(e.target.value)} onBlur={() => onEdit({ props: { title } })} />
      </div>

      {contentLocked ? (
        <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5 text-[10.5px] text-muted-foreground">
          Synced from a notebook — the SQL & chart type live in the notebook (use “Edit chart in notebook” above). Here you set how it behaves: fields, click-to-filter, drill-down.
        </div>
      ) : null}

      {dataBacked && !contentLocked ? (
        <div className={row}>
          <span className={lbl}>SQL query</span>
          <div className="overflow-hidden rounded-md">
            <Editor
              height="120px"
              defaultLanguage="sql"
              defaultValue={query}
              theme={isDark() ? "exasol-dark" : "exasol-light"}
              beforeMount={(monaco) => { defineMonacoThemes(monaco); registerExasolCompletion(monaco, getSharedCatalog); }}
              onChange={(v) => setQuery(v ?? "")}
              onMount={(editor) => {
                editor.onDidBlurEditorText(() => onEdit({ query: editor.getValue() }));
              }}
              options={{
                minimap: { enabled: false },
                fontSize: 12,
                lineNumbers: "off",
                folding: false,
                scrollBeyondLastLine: false,
                wordWrap: "on",
                suggestOnTriggerCharacters: true,
                quickSuggestions: true,
                padding: { top: 6, bottom: 6 },
                overviewRulerLanes: 0,
              }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">Ctrl/⌘-Space for completions · reference a filter with <code>:param</code> · runs on the dashboard's connection.</span>
        </div>
      ) : null}

      {widget.type === "chart" ? (
        <>
          <div className={row}>
            <span className={lbl}>Chart type</span>
            <ChartKindPicker value={(props.kind as string) ?? "bar"} onChange={(kind) => onEdit({ props: { kind: CHART_KINDS.has(kind) ? kind : "bar" } })} />
          </div>
          <div className="flex gap-2">
            <div className={`${row} flex-1`}>
              <span className={lbl}>X field</span>
              <input className={field} value={xField} placeholder="auto" onChange={(e) => setXField(e.target.value)} onBlur={() => onEdit({ props: { xField: xField || undefined } })} />
            </div>
            <div className={`${row} flex-1`}>
              <span className={lbl}>Y fields</span>
              <input className={field} value={yFields} placeholder="auto (comma-sep)" onChange={(e) => setYFields(e.target.value)} onBlur={() => onEdit({ props: { yFields: yFields.split(",").map((s) => s.trim()).filter(Boolean) } })} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-2 py-1.5">
            <span className="text-[12px] text-foreground">Click a bar to filter the dashboard</span>
            <button
              type="button"
              onClick={() => { const nv = !clickFilter; setClickFilter(nv); onEdit({ props: { clickFilter: nv } }); }}
              className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${clickFilter ? "bg-primary" : "bg-border"}`}
              title={clickFilter ? "On — clicking cross-filters" : "Off — clicking does nothing"}
            >
              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${clickFilter ? "left-3.5" : "left-0.5"}`} />
            </button>
          </div>
          <div className={row}>
            <span className={lbl}>Cross-filter column override (defaults to the X field)</span>
            <input className={field} value={cross} placeholder="e.g. REGION" onChange={(e) => setCross(e.target.value)} onBlur={() => onEdit({ props: { crossFilter: cross || undefined } })} />
          </div>
          <div className={row}>
            <span className={lbl}>Drill-down columns (comma — the query must return these + the measure)</span>
            <input className={field} value={drill} placeholder="e.g. YEAR, QUARTER, MONTH" onChange={(e) => setDrill(e.target.value)} onBlur={() => onEdit({ props: { drill: drill.split(",").map((s) => s.trim()).filter(Boolean) } })} />
          </div>
          <div className={row}>
            <span className={lbl}>Drill measure (column to SUM at each level)</span>
            <input className={field} value={measure} placeholder="e.g. AMOUNT" onChange={(e) => setMeasure(e.target.value)} onBlur={() => onEdit({ props: { measure: measure || undefined } })} />
          </div>
        </>
      ) : null}

      {widget.type === "markdown" ? (
        <div className={row}>
          <span className={lbl}>Text (markdown)</span>
          <textarea className={`${field} min-h-[100px]`} value={text} placeholder="## Heading&#10;Some text…" onChange={(e) => setText(e.target.value)} onBlur={() => onEdit({ props: { text } })} />
        </div>
      ) : null}

      {widget.type === "kpi" ? (
        <div className={row}>
          <span className={lbl}>Label</span>
          <input className={field} value={label} placeholder="(defaults to column name)" onChange={(e) => setLabel(e.target.value)} onBlur={() => onEdit({ props: { label } })} />
        </div>
      ) : null}

      {widget.type === "filter" || widget.type === "search" ? (
        <>
          <div className={row}>
            <span className={lbl}>Parameter name</span>
            <input className={field} value={param} placeholder="e.g. region" onChange={(e) => setParam(e.target.value)} onBlur={() => onEdit({ props: { param } })} />
          </div>
          {widget.type === "filter" ? (
            <div className={row}>
              <span className={lbl}>Options (comma-separated)</span>
              <input className={field} value={options} placeholder="EU, US, APAC" onChange={(e) => setOptions(e.target.value)} onBlur={() => onEdit({ props: { options: options.split(",").map((s) => s.trim()).filter(Boolean) } })} />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
