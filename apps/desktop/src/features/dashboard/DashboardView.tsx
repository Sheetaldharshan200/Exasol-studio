// The dashboard surface: holds the document, turns every user gesture into an
// Op (the same primitive the assistant uses), and renders either the freeform
// canvas or the linear notebook view over that one document. Persistence is the
// parent's job via onChange — this component owns only in-memory document state.

import { useMemo, useState } from "react";
import { LayoutGrid, List, Pencil, Eye, Plus, RefreshCw, BookOpen, Link2, Move, X, Filter } from "lucide-react";
import { useCrossFilters, clearCrossFilters, setCrossFilter } from "./cross-filter";
import type { ExportFormat } from "./export-dashboard";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { StatementResult } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { applyOp, type DashboardDoc, type Layout, type Op } from "./model";
import type { RefreshConfig } from "./store";
import { DashboardCanvas } from "./DashboardCanvas";
import { WidgetFrame } from "./WidgetFrame";
import { ShareControl } from "./ShareControl";
import { widgetRegistry } from "./registry-instance";
import type { DashConn } from "./useWidgetData";

const REFRESH_INTERVALS: Array<{ label: string; sec: number }> = [
  { label: "10s", sec: 10 },
  { label: "30s", sec: 30 },
  { label: "1m", sec: 60 },
  { label: "5m", sec: 300 },
];

const COLS = 12;
const ROW_H = 72;

/** Default size per widget type — a filter/search is small (sized to its
 *  content), charts/tables are large. Users drag-resize from there. */
const WIDGET_SIZE: Record<string, { w: number; h: number }> = {
  filter: { w: 3, h: 1 },
  search: { w: 3, h: 1 },
  kpi: { w: 2, h: 2 },
  markdown: { w: 6, h: 2 },
  chart: { w: 6, h: 4 },
  table: { w: 6, h: 4 },
};
const sizeFor = (type: string) => WIDGET_SIZE[type] ?? { w: 4, h: 3 };

/** Place a new widget of the given size flowing left→right across the current
 *  row, wrapping to a new row only when the row is full. */
function nextSlot(doc: DashboardDoc, w: number, h: number): Layout {
  if (!doc.widgets.length) return { x: 0, y: 0, w, h };
  const maxY = Math.max(...doc.widgets.map((wd) => wd.layout.y));
  const rowRight = Math.max(...doc.widgets.filter((wd) => wd.layout.y === maxY).map((wd) => wd.layout.x + wd.layout.w));
  if (rowRight + w <= COLS) return { x: rowRight, y: maxY, w, h };
  const bottom = Math.max(...doc.widgets.map((wd) => wd.layout.y + wd.layout.h));
  return { x: 0, y: bottom, w, h };
}

export function DashboardView({
  doc,
  conn,
  cache,
  refreshConfig,
  onChange,
  onRefreshChange,
  onExport,
  onEditSource,
}: {
  doc: DashboardDoc;
  conn: DashConn;
  cache?: Record<string, StatementResult | undefined>;
  refreshConfig?: RefreshConfig;
  onChange?: (doc: DashboardDoc) => void;
  onRefreshChange?: (config: RefreshConfig) => void;
  onExport?: (format: ExportFormat) => void;
  /** When set, this dashboard is synced from a notebook — "Edit" opens it there. */
  onEditSource?: () => void;
}) {
  const linked = Boolean(onEditSource);
  const [view, setView] = useState<"canvas" | "notebook">("canvas");
  // A fresh (unlinked) dashboard opens ready to build; a linked one is never edited here.
  const [editing, setEditing] = useState(!linked && doc.widgets.length === 0);
  const refresh: RefreshConfig = refreshConfig ?? { enabled: false, intervalSec: 30 };

  const apply = (op: Op) => {
    const res = applyOp(doc, op);
    if (res.error) {
      console.warn("[dashboard] op rejected:", res.error);
      return;
    }
    onChange?.(res.doc);
  };

  const addWidget = (type: string) => {
    const def = widgetRegistry.get(type);
    const { w, h } = sizeFor(type);
    apply({ op: "add_widget", widget: { type, layout: nextSlot(doc, w, h), props: def?.defaultProps, query: def?.dataBacked ? "" : undefined } });
    setEditing(true);
  };

  const setParam = (name: string, value: string | number | null) => apply({ op: "set_param", param: { name, value } });

  const addable = useMemo(() => widgetRegistry.list(), []);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2">
        <input
          data-bare
          value={doc.title}
          disabled={!editing}
          onChange={(e) => apply({ op: "set_title", title: e.target.value })}
          className={cn("min-w-0 flex-1 bg-transparent text-[13px] font-semibold text-foreground outline-none", !editing && "cursor-default")}
        />
        {linked ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground" title="Content is synced from a notebook — edit it there">
            <Link2 className="h-3 w-3" /> Synced
          </span>
        ) : null}
        <SegToggle
          value={view}
          onChange={(v) => setView(v)}
          options={[
            { value: "canvas", icon: <LayoutGrid className="h-3.5 w-3.5" />, title: "Canvas" },
            { value: "notebook", icon: <List className="h-3.5 w-3.5" />, title: "Notebook" },
          ]}
        />
        <RefreshControl config={refresh} onChange={(c) => onRefreshChange?.(c)} />
        <ShareControl doc={doc} conn={conn} onExport={onExport} />
        {editing && !linked ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-foreground hover:bg-muted">
                <Plus className="h-3.5 w-3.5" /> Widget
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {addable.map((d) => (
                <DropdownMenuItem key={d.type} onClick={() => addWidget(d.type)}>
                  {d.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {linked ? (
          <>
            <button
              className={cn("flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11px] font-medium hover:bg-muted", editing ? "border-border text-foreground" : "border-border text-muted-foreground")}
              onClick={() => setEditing((v) => !v)}
              title={editing ? "Done arranging" : "Rearrange widgets (content stays synced from the notebook)"}
            >
              {editing ? <Eye className="h-3.5 w-3.5" /> : <Move className="h-3.5 w-3.5" />}
              {editing ? "Done" : "Arrange"}
            </button>
            <button
              className="flex h-7 items-center gap-1 rounded-md border border-primary/50 px-2.5 text-[11px] font-medium text-primary hover:bg-muted"
              onClick={onEditSource}
              title="Edit content in the source notebook"
            >
              <BookOpen className="h-3.5 w-3.5" /> Edit in notebook
            </button>
          </>
        ) : (
          <button
            className={cn("flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11px] font-medium hover:bg-muted", editing ? "border-border text-foreground" : "border-primary/50 text-primary")}
            onClick={() => setEditing((v) => !v)}
            title={editing ? "Done editing" : "Edit dashboard"}
          >
            {editing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {editing ? "Done" : "Edit"}
          </button>
        )}
      </div>

      <CrossFilterBar />

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {view === "canvas" ? (
          // Fixed, centered content width — the dashboard never stretches edge to
          // edge on a wide screen; the 12-col grid sizes to this width.
          <div className="mx-auto w-full max-w-[1440px]">
            <DashboardCanvas
              doc={doc}
              conn={conn}
              editing={editing}
              contentLocked={linked}
              cache={cache}
              refreshConfig={refresh}
              onLayout={(id, layout) => apply({ op: "set_layout", id, layout })}
              onEdit={(id, patch) => apply({ op: "update_widget", id, patch })}
              setParam={setParam}
              onRemove={(id) => apply({ op: "remove_widget", id })}
              onEditSource={onEditSource}
            />
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {doc.widgets.map((w, i) => (
              <div key={w.id} className="flex gap-2">
                <span className="w-6 shrink-0 pt-1 text-right text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
                {/* Text hugs its content; data widgets use their row height. */}
                <div style={{ height: w.type === "markdown" ? undefined : Math.max(2, w.layout.h) * ROW_H }} className="min-w-0 flex-1">
                  <WidgetFrame
                    widget={w}
                    doc={doc}
                    conn={conn}
                    editing={editing}
                    contentLocked={linked}
                    seed={cache?.[w.id]}
                    refreshConfig={refresh}
                    onEdit={(patch) => apply({ op: "update_widget", id: w.id, patch })}
                    setParam={setParam}
                    onRemove={() => apply({ op: "remove_widget", id: w.id })}
                    onEditSource={onEditSource}
                  />
                </div>
              </div>
            ))}
            {doc.widgets.length === 0 ? (
              <div className="py-10 text-center text-[12px] text-muted-foreground">Empty dashboard — switch to Edit to add a widget.</div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/** The active cross-filters bar — shows what's filtered (from chart clicks), with
 *  per-chip remove and Clear all. Appears only when a filter is active. */
function CrossFilterBar() {
  const filters = useCrossFilters();
  const entries = Object.entries(filters);
  if (!entries.length) return null;
  return (
    <div className="animate-in fade-in slide-in-from-top-1 fill-mode-both flex h-9 shrink-0 items-center gap-2 border-b border-border bg-muted/20 px-2.5 text-[11px] duration-200">
      {/* Fixed label group, pinned left — never clipped, reads as the bar's title. */}
      <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
        <Filter className="h-3.5 w-3.5" />
        <span className="font-medium uppercase tracking-wide text-[10px]">Filtered by</span>
      </span>
      {/* Chips scroll horizontally so the bar stays one clean row (no clipped wrap).
          Each chip fades+pops in as it's added (stable key ⇒ only new ones animate). */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {entries.map(([col, f]) => (
          <button
            key={col}
            onClick={() => setCrossFilter(col, f.value, f.source)}
            className="animate-in fade-in zoom-in-95 fill-mode-both flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-primary transition-colors duration-150 hover:bg-primary/20"
            title="Remove this filter"
          >
            <span className="font-medium">{col}</span> = {f.value}
            <X className="h-3 w-3" />
          </button>
        ))}
      </div>
      <button onClick={clearCrossFilters} className="shrink-0 rounded-md border border-border px-2 py-0.5 text-muted-foreground hover:text-foreground">
        Clear all
      </button>
    </div>
  );
}

function RefreshControl({ config, onChange }: { config: RefreshConfig; onChange: (c: RefreshConfig) => void }) {
  const label = REFRESH_INTERVALS.find((i) => i.sec === config.intervalSec)?.label ?? `${config.intervalSec}s`;
  return (
    <div className={cn("flex items-center rounded-md border border-border", config.enabled && "border-green-500/50")}>
      <button
        onClick={() => onChange({ ...config, enabled: !config.enabled })}
        title={config.enabled ? "Live refresh on — click to pause" : "Turn on live refresh"}
        className={cn("flex h-7 items-center gap-1 rounded-l-md px-2 text-[11px] hover:bg-muted", config.enabled ? "text-green-600" : "text-muted-foreground")}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", config.enabled && "animate-[spin_3s_linear_infinite]")} />
        {config.enabled ? "Live" : "Refresh"}
      </button>
      {config.enabled ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-7 border-l border-border px-1.5 text-[11px] text-foreground hover:bg-muted">{label}</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {REFRESH_INTERVALS.map((i) => (
              <DropdownMenuItem key={i.sec} onClick={() => onChange({ ...config, intervalSec: i.sec })}>
                Every {i.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

function SegToggle<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; icon: React.ReactNode; title: string }> }) {
  return (
    <div className="flex items-center rounded-md border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn("rounded p-1", value === o.value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
