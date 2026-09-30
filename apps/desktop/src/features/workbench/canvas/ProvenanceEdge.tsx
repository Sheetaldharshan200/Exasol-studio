// An arrow that says where a box came from, with a marker naming the
// relationship: `SQL` for a step, a bars mark for a chart, `≡` for the rows
// behind a selection.

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { BarChart3, Rows3 } from "lucide-react";
import type { ArrowKind } from "./model.ts";

export const PROVENANCE_EDGE = "provenance";

export function ProvenanceEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }: EdgeProps) {
  const kind = (data as { kind?: ArrowKind } | undefined)?.kind ?? "sql";
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const label = { sql: "Built with SQL from this box", chart: "Drawn from this box's rows", rows: "The rows behind a selection" }[kind];
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: "var(--primary)", strokeWidth: 1.5, opacity: 0.8 }} />
      <EdgeLabelRenderer>
        <div
          title={label}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          className="pointer-events-auto absolute flex h-5 min-w-5 items-center justify-center rounded border border-primary/50 bg-panel px-1 font-mono text-[9px] font-bold text-primary shadow-sm"
        >
          {kind === "sql" ? "SQL" : kind === "chart" ? <BarChart3 className="h-3 w-3" /> : <Rows3 className="h-3 w-3" />}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
