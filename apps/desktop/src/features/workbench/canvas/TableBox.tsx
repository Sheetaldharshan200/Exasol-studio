// A stored table on the canvas: its columns and types, the first rows, more
// on request. Halo: query it, chart it, export the rows fetched so far.

import { memo, useMemo } from "react";
import type { NodeProps } from "@xyflow/react";
import { BarChart3, Download, Table2 } from "lucide-react";
import { ResultsGrid } from "@/components/studio/ResultsGrid";
import { toCsv } from "@/lib/result-stats";
import { BoxFrame } from "./BoxFrame.tsx";
import { useCanvas, useCanvasStore, useZoom, LOD } from "./context.ts";
import { downloadText, fileName } from "./download.ts";
import { boxTitle, type TableBox as TableBoxModel } from "./model.ts";
import type { HaloAction } from "./Halo.tsx";

export function RowsBody({ id }: { id: string }) {
  const run = useCanvas((s) => s.runs[id]);
  const store = useCanvasStore();
  const zoom = useZoom();
  if (!run || run.status === "idle" || (run.status === "running" && !run.result)) {
    return (
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-3 rounded bg-muted/40" style={{ width: `${90 - i * 9}%` }} />
        ))}
        <p className="mt-1 text-[11px] text-muted-foreground">{run?.status === "running" ? "Fetching rows…" : "Rows arrive when this box runs."}</p>
      </div>
    );
  }
  if (run.status === "error" && !run.result) {
    return (
      <div className="flex flex-1 flex-col gap-2 p-3 text-[11.5px]">
        <p className="whitespace-pre-wrap break-words text-destructive">{run.error}</p>
        <button onClick={() => void store.getState().run(id)} className="self-start rounded-md border border-border px-2 py-1 text-foreground hover:bg-secondary">
          Run again
        </button>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        <ResultsGrid result={run.result ?? null} error={null} hideToolbar fontSize={zoom < LOD.detail ? 10 : 11.5} zebra />
      </div>
      {run.more ? (
        <div className="flex shrink-0 items-center justify-between border-t border-border/60 px-2 py-1 text-[10.5px] text-muted-foreground">
          <span>{run.result?.rows.length.toLocaleString()} rows loaded</span>
          <button disabled={run.status === "running"} onClick={() => void store.getState().loadMore(id)} className="rounded px-1.5 py-0.5 text-primary hover:bg-primary/10 disabled:opacity-50">
            Load more
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Halo entries every box with rows offers. */
export function rowActions(id: string, title: string, store: ReturnType<typeof useCanvasStore>, hasRows: boolean): HaloAction[] {
  return [
    { id: "sql", label: "Query with SQL", icon: Table2, mark: "SQL", side: "right", onClick: () => store.getState().addQuery([id]) },
    { id: "chart", label: "Chart this", icon: BarChart3, side: "right", disabled: !hasRows, onClick: () => store.getState().addChart(id) },
    {
      id: "csv",
      label: hasRows ? "Export the rows fetched so far as CSV" : "Export CSV (no rows yet)",
      icon: Download,
      side: "top",
      disabled: !hasRows,
      onClick: () => {
        const r = store.getState().runs[id]?.result;
        if (r) downloadText(fileName(title, "csv"), toCsv(r.columns, r.rows), "text/csv;charset=utf-8;");
      },
    },
  ];
}

export const TableBoxNode = memo(function TableBoxNode({ id, selected }: NodeProps) {
  const box = useCanvas((s) => s.doc.boxes.find((b) => b.id === id)) as TableBoxModel | undefined;
  const run = useCanvas((s) => s.runs[id]);
  const store = useCanvasStore();
  const title = box ? boxTitle(box) : "";
  const actions = useMemo(() => rowActions(id, title, store, !!run?.result?.rows.length), [id, title, store, run?.result]);
  if (!box) return null;
  const idle = box.rowCount != null ? `${box.rowCount.toLocaleString()} rows in the table` : "Table";
  return (
    <BoxFrame id={id} title={title} icon={Table2} accent="var(--primary)" selected={!!selected} actions={actions} run={run} idleText={idle}>
      <RowsBody id={id} />
    </BoxFrame>
  );
});
