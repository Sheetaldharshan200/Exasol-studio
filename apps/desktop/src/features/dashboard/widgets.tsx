// The dashboard widget renderers — a presentation layer tuned for dashboards
// (clean tiles, big KPIs, compact tables), sharing the app's chart-option and
// query logic rather than the notebook cell's chrome. Each renderer is a small
// React component; the registry wires them by type.

import { type ComponentProps } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MarkdownEditor } from "@/features/workbench/MarkdownEditor";
import { kpiValue } from "@/features/workbench/notebook-cell";
import type { StatementResult } from "@/lib/ipc";
import { InteractiveChart } from "./InteractiveChart";
import { setCrossFilter } from "./cross-filter";
import { getDrill, drillDown, drillTo, useDrill } from "./drill-store";

/** Drill path breadcrumb (Year › 2024 › Q1) — click a crumb to drill back up. */
function DrillBreadcrumb({ widgetId, drill }: { widgetId: string; drill: string[] }) {
  const st = useDrill(widgetId);
  if (!st.level) return null;
  return (
    <div className="flex shrink-0 items-center gap-0.5 px-1 pb-1 text-[10px] text-muted-foreground">
      <button onClick={() => drillTo(widgetId, 0)} className="hover:text-foreground">{drill[0] ?? "All"}</button>
      {st.path.map((p, i) => (
        <span key={i} className="flex items-center gap-0.5">
          <ChevronRight className="h-3 w-3" />
          <button onClick={() => drillTo(widgetId, i + 1)} className="font-medium text-foreground hover:text-primary">{p.value}</button>
        </span>
      ))}
    </div>
  );
}

/** The chart's category (dimension) column — for click-to-cross-filter. Returns
 *  the first NON-numeric column, or undefined when every column is a measure.
 *  Cross-filtering must never target a measure (e.g. CUSTOMER_COUNT = 2000 is
 *  meaningless as a filter), so a measure-only result has no auto filter column. */
function categoryColumn(r: StatementResult): string | undefined {
  const cols = r.columns.map((c) => c.name);
  // A column is a dimension if ANY sampled value is non-numeric (text or a date
  // like 1993-01-01, whose Number() is NaN). Sample a few rows, not just row 0,
  // so a leading NULL doesn't misread a real measure as a dimension.
  const sample = r.rows.slice(0, 20);
  const isDimension = (i: number) =>
    sample.some((row) => {
      const v = row[i];
      return v !== null && v !== "" && Number.isNaN(Number(v));
    });
  const idx = cols.findIndex((_, i) => isDimension(i));
  return idx >= 0 ? cols[idx] : undefined; // undefined ⇒ measure-only ⇒ no cross-filter
}
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { WidgetRenderContext } from "./presentation";

/** Small centered status/overlay used across data widgets. */
function WidgetStatus({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return (
    <div className={cn("flex h-full w-full items-center justify-center px-3 text-center text-[11px]", error ? "text-red-500" : "text-muted-foreground")}>
      {children}
    </div>
  );
}

export function ChartWidget({ widget, data, editing }: WidgetRenderContext) {
  const kind = (widget.props?.kind as string) ?? "bar";
  if (data.loading) return <WidgetStatus>Loading…</WidgetStatus>;
  if (data.error) return <WidgetStatus error>{data.error}</WidgetStatus>;
  if (!data.result?.rows.length) return <WidgetStatus>No data</WidgetStatus>;

  const viz = {
    xField: widget.props?.xField as string | undefined,
    yFields: widget.props?.yFields as string[] | undefined,
    option: widget.props?.option as Record<string, unknown> | undefined,
  };
  const drill = widget.props?.drill as string[] | undefined;
  const measure = widget.props?.measure as string | undefined;
  const drillActive = Boolean(drill?.length && measure);
  // Clicking: if a drill hierarchy is configured, drill one level deeper; else
  // AUTO cross-filter on this chart's category column (no configuration needed).
  const catCol = (widget.props?.crossFilter as string) || (widget.props?.xField as string) || categoryColumn(data.result);
  const clickFilter = widget.props?.clickFilter !== false; // on by default
  const onSelect = (v: string) => {
    if (drillActive && drill) {
      const st = getDrill(widget.id);
      if (st.level < drill.length - 1) return drillDown(widget.id, drill[st.level], v);
    }
    if (clickFilter && catCol) setCrossFilter(catCol, v, widget.id);
  };
  return (
    <div className="flex h-full w-full flex-col">
      {drillActive && drill ? <DrillBreadcrumb widgetId={widget.id} drill={drill} /> : null}
      <div className="min-h-0 flex-1">
        <InteractiveChart kind={kind} result={data.result} viz={viz} editing={editing} onCrossFilter={onSelect} />
      </div>
    </div>
  );
}

export function KpiWidget({ widget, data }: WidgetRenderContext) {
  if (data.loading) return <WidgetStatus>Loading…</WidgetStatus>;
  if (data.error) return <WidgetStatus error>{data.error}</WidgetStatus>;
  const kpi = data.result ? kpiValue(data.result.columns, data.result.rows) : null;
  const label = (widget.props?.label as string) ?? kpi?.label ?? "";
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-3">
      <div className="text-3xl font-semibold tabular-nums text-foreground">{kpi?.value ?? "—"}</div>
      {label ? <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div> : null}
    </div>
  );
}

export function TableWidget({ data }: WidgetRenderContext) {
  if (data.loading) return <WidgetStatus>Loading…</WidgetStatus>;
  if (data.error) return <WidgetStatus error>{data.error}</WidgetStatus>;
  const r = data.result;
  if (!r || !r.rows.length) return <WidgetStatus>No data</WidgetStatus>;
  return (
    <div className="h-full w-full overflow-auto">
      <table className="w-full border-collapse text-[11px]">
        <thead className="sticky top-0 bg-background">
          <tr>
            {r.columns.map((c) => (
              <th key={c.name} className="border-b border-border px-2 py-1 text-left font-medium text-muted-foreground">
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {r.rows.slice(0, 500).map((row, i) => (
            <tr key={i} className="odd:bg-muted/30">
              {row.map((cell, j) => (
                <td key={j} className="border-b border-border/50 px-2 py-1 tabular-nums text-foreground">
                  {cell === null ? "" : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Rich markdown rendering — the same react-markdown + GFM the rest of the app
// uses (Docs), styled to read like a notebook markdown cell: real headings,
// lists, code, tables, links. No raw HTML, so a shared/exported page is safe.
const MD_COMPONENTS: ComponentProps<typeof ReactMarkdown>["components"] = {
  h1: (p) => <h1 className="mb-1.5 mt-1 text-lg font-semibold text-foreground" {...p} />,
  h2: (p) => <h2 className="mb-1 mt-2 text-base font-semibold text-foreground" {...p} />,
  h3: (p) => <h3 className="mb-1 mt-1.5 text-[13px] font-semibold text-foreground" {...p} />,
  p: (p) => <p className="mb-1.5 leading-relaxed" {...p} />,
  ul: (p) => <ul className="mb-1.5 ml-4 list-disc space-y-0.5" {...p} />,
  ol: (p) => <ol className="mb-1.5 ml-4 list-decimal space-y-0.5" {...p} />,
  a: (p) => <a className="text-primary underline" {...p} />,
  strong: (p) => <strong className="font-semibold text-foreground" {...p} />,
  code: (p) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]" {...p} />,
  blockquote: (p) => <blockquote className="border-l-2 border-border pl-2 text-muted-foreground" {...p} />,
  table: (p) => <table className="my-1 w-full border-collapse text-[11px]" {...p} />,
  th: (p) => <th className="border border-border px-2 py-0.5 text-left font-medium" {...p} />,
  td: (p) => <td className="border border-border px-2 py-0.5" {...p} />,
};

export function MarkdownWidget({ widget, editing, onProps }: WidgetRenderContext) {
  const text = (widget.props?.text as string) ?? "";
  if (editing) {
    // The exact notebook markdown cell (WYSIWYG). data-no-drag so the body-drag
    // doesn't fight editing; data-md-content so the canvas auto-fits the height.
    return (
      <div data-no-drag data-md-content className="w-full">
        <MarkdownEditor value={text} onChange={(md) => onProps({ text: md })} placeholder="Write a note…" />
      </div>
    );
  }
  if (!text.trim()) return <div className="p-1 text-[12px] italic text-muted-foreground">Empty text — switch to Edit to write.</div>;
  // Read-only render (Done view / shared page). Content-sized wrapper (data-md-content).
  return (
    <div className="h-full w-full overflow-hidden p-1 text-[12px] text-foreground">
      <div data-md-content>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{text}</ReactMarkdown>
      </div>
    </div>
  );
}

export function FilterWidget({ widget, doc, setParam }: WidgetRenderContext) {
  const paramName = (widget.props?.param as string) ?? "";
  const param = doc.params.find((p) => p.name === paramName);
  const options = (param?.options ?? (widget.props?.options as Array<string | number>) ?? []) as Array<string | number>;
  const value = (param?.value ?? param?.default ?? "") as string | number;
  const label = value === "" ? "All" : String(value);
  return (
    <div className="flex h-full w-full flex-col justify-center gap-1 px-2">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{paramName || "filter"}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex h-7 items-center justify-between rounded-md border border-border bg-background px-2 text-[12px] text-foreground hover:bg-muted">
            <span className="truncate">{label}</span>
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => setParam(paramName, "")}>All</DropdownMenuItem>
          {options.map((o) => (
            <DropdownMenuItem key={String(o)} onClick={() => setParam(paramName, o)}>
              {String(o)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function SearchWidget({ widget, doc, setParam }: WidgetRenderContext) {
  const paramName = (widget.props?.param as string) ?? "";
  const param = doc.params.find((p) => p.name === paramName);
  const value = (param?.value ?? "") as string;
  return (
    <div className="flex h-full w-full flex-col justify-center gap-1 px-2">
      <label className="text-[10px] uppercase tracking-wide text-muted-foreground">{paramName || "search"}</label>
      <input
        value={value}
        onChange={(e) => setParam(paramName, e.target.value)}
        placeholder="Search…"
        className="h-7 rounded-md border border-border bg-background px-2 text-[12px] text-foreground outline-none"
      />
    </div>
  );
}

export function PlaceholderWidget({ widget }: WidgetRenderContext) {
  return <WidgetStatus>Unsupported widget: {widget.type}</WidgetStatus>;
}
