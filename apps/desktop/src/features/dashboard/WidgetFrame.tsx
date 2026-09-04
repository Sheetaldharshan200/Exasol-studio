// One widget node. Deliberately chrome-light — like a React-Flow node — so a
// widget is never a box inside a box: the component renders bare, and in edit
// mode a small floating toolbar (drag · settings · remove) and a resize grip sit
// over it. It hosts the widget's query via useWidgetData so the renderer stays a
// pure function of its data, and opens the WidgetEditor over the node on the gear.

import { useEffect, useRef, useState } from "react";
import { X, Settings2, GripVertical } from "lucide-react";
import type { StatementResult } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import type { DashboardDoc, Widget, WidgetPatch } from "./model";
import type { RefreshConfig } from "./store";
import { effectiveIntervalMs } from "./refresh";
import { useWidgetData, type DashConn } from "./useWidgetData";
import { widgetRegistry } from "./registry-instance";
import { WidgetEditor } from "./WidgetEditor";

export function WidgetFrame({
  widget,
  doc,
  conn,
  editing,
  contentLocked,
  seed,
  refreshConfig,
  onEdit,
  setParam,
  onRemove,
  onEditSource,
  onDragStart,
  onResizeStart,
}: {
  widget: Widget;
  doc: DashboardDoc;
  conn: DashConn;
  editing: boolean;
  /** Synced dashboards: allow drag/resize but no content (SQL/settings) editing here. */
  contentLocked?: boolean;
  seed?: StatementResult;
  refreshConfig?: RefreshConfig;
  onEdit: (patch: WidgetPatch) => void;
  setParam: (name: string, value: string | number | null) => void;
  onRemove: () => void;
  /** Synced dashboards: open the source notebook to edit this widget's content. */
  onEditSource?: () => void;
  onDragStart?: (e: React.PointerEvent) => void;
  onResizeStart?: (e: React.PointerEvent, dir: ResizeDir) => void;
}) {
  const def = widgetRegistry.resolve(widget.type);
  const dataBacked = widgetRegistry.get(widget.type)?.dataBacked ?? false;
  const isMarkdown = widget.type === "markdown";
  // Non-markdown widgets get a settings gear. When synced (contentLocked) the
  // editor shows interaction settings only (SQL stays in the notebook).
  const hasSettings = !isMarkdown;
  const [editorOpen, setEditorOpen] = useState(editing && hasSettings && dataBacked && !widget.query);
  const data = useWidgetData(widget, doc, conn, seed, refreshConfig);
  const userTitle = widget.props?.title as string | undefined;
  const onProps = (patch: Record<string, unknown>) => onEdit({ props: patch });
  const live = Boolean(refreshConfig && effectiveIntervalMs(widget.id, refreshConfig) && data.lastRefreshed);
  const contentEditing = editing && !contentLocked;

  // Text widgets AUTO-FIT their height to the content, so the box always hugs the
  // text (no empty space above/around) — the user resizes width; height follows.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isMarkdown) return;
    const el = bodyRef.current?.querySelector<HTMLElement>("[data-md-content]");
    if (!el) return;
    let raf = 0;
    // Measure AFTER paint (rAF), and never act on a zero/near-zero height — that
    // transient shows up mid-relayout (e.g. when a chart added below re-flows the
    // grid) and would otherwise collapse the text box to one row and clip it.
    const fit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = el.scrollHeight;
        if (h <= 4) return; // not painted yet — ignore
        const rows = Math.max(1, Math.ceil((h + 16 + GRID_GAP) / (GRID_ROW_H + GRID_GAP)));
        if (rows !== widget.layout.h) onEdit({ layout: { h: rows } });
      });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMarkdown, contentEditing, widget.props?.text, widget.layout.w, widget.layout.h]);

  // Drag the widget from its body — but never when the pointer is on an
  // interactive control (a textarea/input/button) or a resize/pill handle.
  const onBodyPointerDown = (e: React.PointerEvent) => {
    if (!editing) return;
    if ((e.target as HTMLElement)?.closest("input,textarea,button,select,a,[data-no-drag]")) return;
    onDragStart?.(e);
  };

  return (
    <div
      data-widget-id={widget.id}
      className={cn("group relative flex h-full w-full flex-col overflow-hidden rounded-md", editing && "cursor-grab border border-dashed border-border/50 hover:border-border active:cursor-grabbing")}
      onPointerDown={onBodyPointerDown}
    >
      {live ? (
        <span className="absolute left-1 top-1 z-10 h-1.5 w-1.5 rounded-full bg-green-500" title={`Live — ${new Date(data.lastRefreshed!).toLocaleTimeString()}`} />
      ) : null}
      {userTitle ? <div className="shrink-0 px-1.5 pt-1 text-[12px] font-semibold text-foreground">{userTitle}</div> : null}

      <div ref={bodyRef} className="relative min-h-0 flex-1">
        {editing && hasSettings && editorOpen ? <WidgetEditor widget={widget} onEdit={onEdit} onClose={() => setEditorOpen(false)} contentLocked={contentLocked} onEditSource={onEditSource} /> : null}
        <div className="h-full w-full p-1.5">{def.render({ widget, doc, data, editing: contentEditing, setParam, onProps })}</div>
      </div>

      {editing ? (
        <>
          {/* Explicit drag grip at the top-right (in addition to body-drag). */}
          <button data-no-drag className="absolute right-1 top-1 z-30 cursor-grab rounded p-0.5 text-muted-foreground/70 hover:bg-primary/15 hover:text-foreground active:cursor-grabbing" onPointerDown={onDragStart} title="Drag to move">
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          {/* Floating control pill — edit + remove. data-no-drag so it never starts a move. */}
          <div data-no-drag className="absolute right-1 top-7 z-20 flex flex-col items-center gap-0.5 rounded-md border border-border bg-background/85 p-0.5 opacity-70 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100">
            {hasSettings ? (
              <button className={cn("rounded p-0.5 text-muted-foreground hover:text-foreground", editorOpen && "text-primary")} onClick={() => setEditorOpen((v) => !v)} title={widget.type === "chart" ? "Edit chart — filters & source" : "Edit widget"}>
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {!contentLocked ? (
              <button className="rounded p-0.5 text-muted-foreground hover:text-red-500" onClick={onRemove} title="Remove widget">
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          {/* Resize handles. Text widgets resize WIDTH only (height auto-fits). */}
          {(isMarkdown ? RESIZE_HANDLES.filter((h) => h.dir === "e" || h.dir === "w") : RESIZE_HANDLES).map((hd) => (
            <div
              key={hd.dir}
              data-no-drag
              className={cn("absolute z-20 hover:bg-primary/20", hd.cls)}
              onPointerDown={(e) => onResizeStart?.(e, hd.dir)}
              title="Drag to resize"
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

// Must match DashboardCanvas grid metrics (for text auto-height row math).
const GRID_ROW_H = 72;
const GRID_GAP = 8;

type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const RESIZE_HANDLES: { dir: ResizeDir; cls: string }[] = [
  // No top ("n") edge handle — the top strip is the drag-to-move bar.
  { dir: "s", cls: "left-2 right-2 bottom-0 h-1.5 cursor-ns-resize" },
  { dir: "e", cls: "top-2 bottom-2 right-0 w-1.5 cursor-ew-resize" },
  { dir: "w", cls: "top-2 bottom-2 left-0 w-1.5 cursor-ew-resize" },
  { dir: "nw", cls: "left-0 top-0 h-2.5 w-2.5 cursor-nwse-resize" },
  { dir: "ne", cls: "right-0 top-0 h-2.5 w-2.5 cursor-nesw-resize" },
  { dir: "sw", cls: "left-0 bottom-0 h-2.5 w-2.5 cursor-nesw-resize" },
  { dir: "se", cls: "right-0 bottom-0 h-2.5 w-2.5 cursor-nwse-resize" },
];
