// The freeform canvas: widgets placed on a 12-column grid, dragged and resized
// by pointer in edit mode, snapping to grid cells. Layout math is deliberately
// simple (fixed columns, fixed row height) so it is predictable and the model
// stays the source of truth — every drag/resize ends in a set_layout op.

import { useLayoutEffect, useRef, useState } from "react";
import type { StatementResult } from "@/lib/ipc";
import type { DashboardDoc, Layout, Widget, WidgetPatch } from "./model";
import type { RefreshConfig } from "./store";
import type { DashConn } from "./useWidgetData";
import { WidgetFrame } from "./WidgetFrame";

const COLS = 12;
const ROW_H = 72; // px per grid row
const GAP = 8; // px

type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const cssEscape = (s: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&"));

export function DashboardCanvas({
  doc,
  conn,
  editing,
  contentLocked,
  cache,
  refreshConfig,
  onLayout,
  onEdit,
  setParam,
  onRemove,
  onEditSource,
}: {
  doc: DashboardDoc;
  conn: DashConn;
  editing: boolean;
  contentLocked?: boolean;
  cache?: Record<string, StatementResult | undefined>;
  refreshConfig?: RefreshConfig;
  onLayout: (id: string, layout: Partial<Layout>) => void;
  onEdit: (id: string, patch: WidgetPatch) => void;
  setParam: (name: string, value: string | number | null) => void;
  onRemove: (id: string) => void;
  /** Synced dashboards: open the source notebook to edit a widget's content. */
  onEditSource?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [colW, setColW] = useState(80);
  // Live pixel geometry of the widget being dragged/resized — updated smoothly on
  // every pointer move, snapped to the grid only on release.
  const [preview, setPreview] = useState<{ id: string; left: number; top: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const w = ref.current?.clientWidth ?? 960;
      setColW((w - GAP * (COLS - 1)) / COLS);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const rows = Math.max(6, ...doc.widgets.map((w) => w.layout.y + w.layout.h)) + 1;

  const cellX = (x: number) => x * (colW + GAP);
  const cellY = (y: number) => y * (ROW_H + GAP);

  const cellW = () => colW + GAP;
  const cellH = () => ROW_H + GAP;
  const pxWidth = (w: number) => w * colW + (w - 1) * GAP;
  const pxHeight = (h: number) => h * ROW_H + (h - 1) * GAP;

  const begin = (id: string, mode: "move" | "resize", dir: ResizeDir = "se") => (e: React.PointerEvent) => {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();
    const wgt = doc.widgets.find((x) => x.id === id);
    if (!wgt) return;
    const s = { ...wgt.layout };
    // Starting pixel geometry.
    const p0 = { left: cellX(s.x), top: cellY(s.y), width: pxWidth(s.w), height: pxHeight(s.h) };
    const sx = e.clientX, sy = e.clientY;
    const minW = colW;
    // Text widgets can't shrink below their content: measure the markdown's
    // natural height and floor the resize there.
    let minH = ROW_H;
    if (wgt.type === "markdown") {
      const host = ref.current?.querySelector(`[data-widget-id="${cssEscape(wgt.id)}"]`);
      const content = host?.querySelector<HTMLElement>("[data-md-content]");
      if (content) minH = Math.max(ROW_H, content.scrollHeight + 24);
    }

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      let { left, top, width, height } = p0;
      if (mode === "move") {
        left = Math.max(0, p0.left + dx);
        top = Math.max(0, p0.top + dy);
      } else {
        if (dir.includes("e")) width = Math.max(minW, p0.width + dx);
        if (dir.includes("s")) height = Math.max(minH, p0.height + dy);
        if (dir.includes("w")) {
          left = p0.left + dx;
          width = p0.width - dx;
          if (width < minW) { left = p0.left + p0.width - minW; width = minW; }
          if (left < 0) { width += left; left = 0; }
        }
        if (dir.includes("n")) {
          top = p0.top + dy;
          height = p0.height - dy;
          if (height < minH) { top = p0.top + p0.height - minH; height = minH; }
          if (top < 0) { height += top; top = 0; }
        }
      }
      setPreview({ id, left, top, width, height });
    };

    const onUp = () => {
      setPreview((cur) => {
        if (cur && cur.id === id) {
          // Snap the pixel geometry to the nearest grid cell and commit.
          const gx = Math.max(0, Math.round(cur.left / cellW()));
          const gy = Math.max(0, Math.round(cur.top / cellH()));
          const gw = Math.max(1, Math.round((cur.width + GAP) / cellW()));
          const gh = Math.max(1, Math.round((cur.height + GAP) / cellH()));
          const x = Math.min(gx, Math.max(0, COLS - gw));
          const w2 = Math.min(gw, COLS - x);
          onLayout(id, { x, y: gy, w: w2, h: gh });
        }
        return null;
      });
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      ref={ref}
      className="relative w-full"
      style={{ height: cellY(rows) + 96, backgroundColor: "var(--background)" }}
    >
      {doc.widgets.map((w) => {
        const dragging = preview?.id === w.id;
        // Text hugs its content: leave its height auto (undefined) so a one-line
        // note is one line tall, not a full 72px row. layout.h is still tracked
        // (auto-fit keeps it ≥ content), so widgets below never overlap it.
        const isMd = w.type === "markdown";
        const geo = dragging
          ? { left: preview!.left, top: preview!.top, width: preview!.width, height: preview!.height }
          : { left: cellX(w.layout.x), top: cellY(w.layout.y), width: pxWidth(w.layout.w), height: isMd ? undefined : pxHeight(w.layout.h) };
        return (
        <div
          key={w.id}
          className="absolute"
          style={{ ...geo, zIndex: dragging ? 40 : undefined }}
        >
          <WidgetFrame
            widget={w}
            doc={doc}
            conn={conn}
            editing={editing}
            contentLocked={contentLocked}
            seed={cache?.[w.id]}
            refreshConfig={refreshConfig}
            onEdit={(patch) => onEdit(w.id, patch)}
            setParam={setParam}
            onRemove={() => onRemove(w.id)}
            onEditSource={onEditSource}
            onDragStart={begin(w.id, "move")}
            onResizeStart={(e, dir) => begin(w.id, "resize", dir)(e)}
          />
        </div>
        );
      })}
      {doc.widgets.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-[12px] text-muted-foreground">
          Empty dashboard — add a widget to get started.
        </div>
      ) : null}
    </div>
  );
}
