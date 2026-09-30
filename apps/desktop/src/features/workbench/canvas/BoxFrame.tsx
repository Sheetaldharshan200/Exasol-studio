// The chrome every box shares: the frame, a header with its identity and
// state, the halo, and the resize handles. The body is the box's own.

import { useState, type ReactNode } from "react";
import { Handle, NodeResizer, Position } from "@xyflow/react";
import { Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Halo, type HaloAction } from "./Halo.tsx";
import { useCanvasStore, useZoom, LOD } from "./context.ts";
import type { RunState } from "./store.ts";

export function statusLine(run: RunState | undefined, fallback: string): { text: string; tone: "muted" | "error" | "warn" } {
  if (!run || run.status === "idle") return { text: fallback, tone: "muted" };
  if (run.status === "running") return { text: run.loaded ? `Loading more… ${run.loaded.toLocaleString()} rows so far` : "Running…", tone: "muted" };
  if (run.status === "error") return { text: run.error ?? "Failed", tone: "error" };
  const rows = run.result?.rows.length ?? 0;
  const t = `${rows.toLocaleString()}${run.more ? "+" : ""} row${rows === 1 ? "" : "s"}${run.elapsedMs !== undefined ? ` · ${run.elapsedMs} ms` : ""}`;
  return run.stale ? { text: `${t} · a source changed`, tone: "warn" } : { text: t, tone: "muted" };
}

export function BoxFrame({
  id,
  title,
  icon: Icon,
  accent,
  selected,
  actions,
  run,
  idleText,
  children,
  onRename,
}: {
  id: string;
  title: string;
  icon: LucideIcon;
  accent: string;
  selected: boolean;
  actions: HaloAction[];
  run: RunState | undefined;
  idleText: string;
  children: ReactNode;
  onRename?: (name: string) => void;
}) {
  const store = useCanvasStore();
  const zoom = useZoom();
  const [hover, setHover] = useState(false);
  const status = statusLine(run, idleText);
  const tiny = zoom < LOD.title;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn(
        "relative flex h-full w-full flex-col overflow-visible rounded-lg border bg-panel text-foreground shadow-md transition-colors",
        selected ? "border-primary shadow-[0_0_0_2px_color-mix(in_srgb,var(--primary)_30%,transparent)]" : "border-border",
      )}
    >
      <NodeResizer isVisible={selected} minWidth={240} minHeight={160} lineClassName="!border-primary/40" handleClassName="!h-2.5 !w-2.5 !rounded-sm !border-primary !bg-panel" onResizeEnd={(_, p) => store.getState().resizeBox(id, p.width, p.height)} />
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-0 !bg-primary/70" />
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-0 !bg-primary/70" />
      <Halo actions={actions} visible={hover || selected} onClose={() => store.getState().removeBox(id)} />
      <header className={cn("flex h-8 shrink-0 items-center gap-2 rounded-t-lg border-b border-border/70 px-2.5", tiny && "h-full rounded-lg border-0")}>
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} />
        {onRename ? (
          <input
            defaultValue={title}
            key={title}
            onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== title && onRename(e.target.value.trim())}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className={cn("nodrag min-w-0 flex-1 truncate bg-transparent font-semibold text-foreground outline-none focus:text-primary", tiny ? "text-[28px]" : "text-[12.5px]")}
            aria-label="Box name"
          />
        ) : (
          <span className={cn("min-w-0 flex-1 truncate font-semibold", tiny ? "text-[28px]" : "text-[12.5px]")} title={title}>
            {title}
          </span>
        )}
        {!tiny ? (
          <span className={cn("flex shrink-0 items-center gap-1 truncate text-[10.5px]", status.tone === "error" ? "text-destructive" : status.tone === "warn" ? "text-warning" : "text-muted-foreground")} title={status.text}>
            {run?.status === "running" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            <span className="max-w-[220px] truncate">{status.text}</span>
          </span>
        ) : null}
      </header>
      {!tiny ? <div className="nodrag nowheel flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-lg">{children}</div> : <div className="flex-1 rounded-b-lg bg-muted/30" />}
    </div>
  );
}
