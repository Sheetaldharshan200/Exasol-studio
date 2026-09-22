/**
 * The schema diagram's building blocks: table nodes, beam edges, their
 * styling, and the edge-selection rule. Moved verbatim out of Visualizer.tsx;
 * no behaviour lives here that the component did not already have.
 */
import { createContext, memo, useContext } from "react";
import { EdgeLabelRenderer, Handle, Position, getBezierPath, type EdgeProps, type NodeProps } from "@xyflow/react";
import { FolderOpen, KeyRound, Plus, Table2, Waypoints } from "lucide-react";
import { ShineBorder } from "@/components/ui/shine-border";
import type { GraphTable } from "@/lib/ipc";
import { cn } from "@/lib/utils";

export const NODE_W = 232;
export const HEADER_H = 34;
export const ROW_H = 26;

export type Selection = { table: string; column?: string } | null;
export type Mode = "diagram" | "build";

/**
 * What a table node is given ONCE, at layout time. Everything that changes
 * with a click (selection, picks, search matches, mode) travels through
 * `DiagramStateContext` instead, so a click re-renders nodes without rebuilding
 * a single node object — React Flow's first performance rule.
 */
export type TableNodeData = {
  /** `id` is `SCHEMA.TABLE` — what selection, picks and links refer to. */
  table: GraphTable & { id: string; schema: string };
  sourceCols: Set<string>;
  targetCols: Set<string>;
  onSelect: (table: string, column?: string) => void;
  onPick: (table: string, column: string) => void;
};

export type DiagramState = {
  mode: Mode;
  selTable?: string;
  selColumn?: string;
  picked: Set<string>; // `${SCHEMA.TABLE}.${col}` chosen for SELECT
  matchedTables: Set<string>;
  matchedCols: Set<string>;
};
export const EMPTY_DIAGRAM_STATE: DiagramState = { mode: "diagram", picked: new Set(), matchedTables: new Set(), matchedCols: new Set() };
export const DiagramStateContext = createContext<DiagramState>(EMPTY_DIAGRAM_STATE);

export type BeamEdgeData = {
  source: string;
  target: string;
  sourceColumn: string;
  targetColumn: string;
  label: string;
  active: boolean;
  inferred: boolean;
  /** Confidence of an inferred link (undefined for declared keys). */
  score?: number;
};

export type EdgeStyle = {
  show: boolean;
  pulse: boolean;
  line: "solid" | "dashed" | "dotted";
  width: number;
  from: string;
  to: string;
  /** The travelling pulse/beam color — distinct from the static link color. */
  pulseColor: string;
};

export const DEFAULT_EDGE_STYLE: EdgeStyle = {
  show: true,
  pulse: true,
  line: "solid",
  width: 2,
  from: "#a78bfa",
  to: "#7c3aed",
  // Cyan pulse over the purple link — reads clearly as "flow" vs. the link.
  pulseColor: "#22d3ee",
};

/**
 * Style plus one performance fact the diagram derives: `dense` (many links —
 * only the selected link animates or carries a label). Panning/zooming hides
 * decoration through a CSS class on the pane, not through React state, so a
 * gesture never re-renders an edge.
 */
export type EdgeRenderContext = EdgeStyle & { dense?: boolean };
export const EdgeStyleContext = createContext<EdgeRenderContext>(DEFAULT_EDGE_STYLE);
/** Above this many links the diagram is "dense": decoration only on the selected link. */
export const DENSE_EDGES = 24;

export const COLOR_PRESETS: { label: string; from: string; to: string }[] = [
  { label: "Purple", from: "#a78bfa", to: "#7c3aed" },
  { label: "Teal", from: "#5eead4", to: "#0d9488" },
  { label: "Blue", from: "#7dd3fc", to: "#2563eb" },
  { label: "Amber", from: "#fcd34d", to: "#d97706" },
  { label: "Pink", from: "#f9a8d4", to: "#db2777" },
  { label: "Green", from: "#86efac", to: "#16a34a" },
];

export const PULSE_PRESETS: { label: string; color: string }[] = [
  { label: "Cyan", color: "#22d3ee" },
  { label: "Green", color: "#4ade80" },
  { label: "Amber", color: "#fbbf24" },
  { label: "Pink", color: "#f472b6" },
  { label: "White", color: "#f8fafc" },
  { label: "Match link", color: "" }, // empty → use the link's `to` color
];

export function dashFor(line: EdgeStyle["line"], w: number): string | undefined {
  if (line === "dashed") return `${Math.max(4, w * 3)} ${Math.max(3, w * 2)}`;
  if (line === "dotted") return `1 ${Math.max(3, w * 2.5)}`;
  return undefined;
}


export const rowY = (i: number) => HEADER_H + i * ROW_H + ROW_H / 2;
export const nodeHeight = (t: GraphTable) => HEADER_H + t.columns.length * ROW_H;
export const colKey = (table: string, col: string) => `${table}.${col}`;

/** The whole card, always — every column, at every zoom. The canvas stays
 *  bounded by the per-box pagination and the link budget, not by hiding rows. */
export const TableNode = memo(function TableNode({ data }: NodeProps) {
  const d = data as unknown as TableNodeData;
  const { table, sourceCols, targetCols, onSelect, onPick } = d;
  const state = useContext(DiagramStateContext);
  const isSel = state.selTable === table.id;
  const build = state.mode === "build";
  const tableMatched = state.matchedTables.has(table.id);
  return (
    <div
      style={{ width: NODE_W }}
      className={cn(
        "relative overflow-hidden rounded-xl border bg-panel",
        isSel ? "border-[#a78bfa] shadow-xl" : tableMatched ? "border-amber-400 ring-2 ring-amber-400/40" : "border-border",
      )}
    >
      {table.columns.map((col, i) =>
        targetCols.has(col.name) ? (
          <Handle key={`t-${col.name}`} type="target" id={`${col.name}__t`} position={Position.Left} style={{ top: rowY(i) }} className="!h-2 !w-2 !border-0 !bg-[#a78bfa]" />
        ) : null,
      )}
      {table.columns.map((col, i) =>
        sourceCols.has(col.name) ? (
          <Handle key={`s-${col.name}`} type="source" id={`${col.name}__s`} position={Position.Right} style={{ top: rowY(i) }} className="!h-2 !w-2 !border-0 !bg-[#a78bfa]" />
        ) : null,
      )}

      <button
        onClick={() => onSelect(table.id)}
        style={{ height: HEADER_H }}
        className={cn(
          "flex w-full items-center gap-1.5 border-b border-border px-3 text-left",
          isSel ? "bg-[#a78bfa]/15" : "bg-secondary/70 hover:bg-secondary",
        )}
      >
        <Table2 className={cn("h-3.5 w-3.5 shrink-0", isSel ? "text-[#a78bfa]" : "text-primary")} />
        <span className="truncate text-[13px] font-semibold text-foreground">{table.name}</span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">{table.columns.length}</span>
      </button>

      <div>
          {table.columns.map((col) => {
            const key = colKey(table.id, col.name);
            const isPicked = state.picked.has(key);
            const colSel = isSel && state.selColumn === col.name;
            const colMatched = state.matchedCols.has(key);
            return (
              <div
                key={col.name}
                onClick={() => (build ? onPick(table.id, col.name) : onSelect(table.id, col.name))}
                style={{ height: ROW_H }}
                className={cn(
                  "vs-row flex cursor-pointer items-center gap-1.5 border-b border-border/40 px-3 font-mono text-[11px] last:border-0 hover:bg-secondary/50",
                  colSel && "bg-[#a78bfa]/20",
                  isPicked && "bg-primary/10",
                  colMatched && !colSel && "bg-amber-400/15",
                )}
              >
                {build ? (
                  <span
                    className={cn(
                      "flex h-3 w-3 shrink-0 items-center justify-center rounded-[3px] border",
                      isPicked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50",
                    )}
                  >
                    {isPicked ? <span className="text-[8px] leading-none">✓</span> : null}
                  </span>
                ) : col.pk ? (
                  <KeyRound className="h-3 w-3 shrink-0 text-warning" />
                ) : (
                  <span className="w-3 shrink-0" />
                )}
                <span className={cn("truncate", colMatched ? "font-semibold text-amber-300" : col.pk ? "text-foreground" : "text-muted-foreground")}>{col.name}</span>
                {colMatched ? (
                  <span className="shrink-0 rounded bg-amber-400/20 px-1 text-[8px] font-semibold tracking-wide text-amber-300 uppercase">match</span>
                ) : null}
                <span className="ml-auto shrink-0 truncate text-syntax-type/70">{col.dataType}</span>
              </div>
            );
          })}
      </div>

      {isSel && !build ? <ShineBorder shineColor={["#A07CFE", "#FE8FB5", "#FFBE7B"]} borderWidth={2} duration={8} /> : null}
    </div>
  );
});

export function BeamEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const cfg = useContext(EdgeStyleContext);
  const d = data as unknown as BeamEdgeData;
  const active = d?.active;
  const inferred = d?.inferred;
  const gid = `beam-${id}`;
  const pathId = `beampath-${id}`;

  if (!cfg.show) return null;

  const width = active ? cfg.width + 1.25 : cfg.width;
  const dash = dashFor(cfg.line, width);
  const opacity = active ? 1 : cfg.dense ? (inferred ? 0.28 : 0.6) : inferred ? 0.55 : 0.85;
  // Decoration is for the link the user is looking at; on a small diagram every
  // declared link gets it. While the user pans or zooms, CSS hides `.vs-deco`
  // (see global.css) — no edge re-renders on a gesture.
  const decorate = active || (!cfg.dense && !inferred);
  const animate = cfg.pulse && decorate;
  const showLabel = Boolean(d?.label) && decorate;
  // Empty pulseColor means "match the link color".
  const pulse = cfg.pulseColor || cfg.to;

  return (
    <>
      {/* Always-visible line. When this link is pulsing (active/real flow) the
          WHOLE line takes the pulse color, so it reads as clearly different
          from static (non-pulsing) links; otherwise it uses the link color. */}
      <path
        id={pathId}
        d={path}
        fill="none"
        stroke={animate ? pulse : cfg.to}
        strokeWidth={width}
        strokeLinecap={cfg.line === "dotted" ? "round" : "butt"}
        strokeDasharray={dash}
        style={{ opacity }}
      />
      {animate ? (
        <g className="vs-deco">
          {/* Brighter moving highlight + travelling dot on top of the pulse line. */}
          <path d={path} fill="none" stroke={`url(#${gid})`} strokeWidth={width + 1.5} strokeLinecap="round" />
          <circle r={width + 2} fill={pulse}>
            <animateMotion dur="2.4s" repeatCount="indefinite" rotate="auto">
              <mpath xlinkHref={`#${pathId}`} href={`#${pathId}`} />
            </animateMotion>
          </circle>
          <defs>
            {/* The shimmer runs as an SVG animation — no JavaScript per frame. */}
            <linearGradient id={gid} x1="-25%" x2="0%" y1="0" y2="0">
              <animate attributeName="x1" values="-25%;100%" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="x2" values="0%;125%" dur="2.4s" repeatCount="indefinite" />
              <stop stopColor="#ffffff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.85" />
              <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
          </defs>
        </g>
      ) : null}
      {showLabel ? (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
              borderColor: `${cfg.to}66`,
              background: `${cfg.to}1f`,
              color: cfg.from,
            }}
            className="vs-deco pointer-events-none absolute rounded-md border px-1.5 py-0.5 font-mono text-[9.5px] whitespace-nowrap"
          >
            {inferred ? `≈ ${d.score !== undefined ? d.score.toFixed(1) + " " : ""}` : ""}
            {d.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export type SchemaGroupData = {
  schema: string;
  /** The federated source for a virtual schema (PostgreSQL, MySQL, …). */
  source?: string;
  /** Tables drawn now vs. tables in the schema — the box paginates. */
  shown: number;
  total: number;
  onShowMore: () => void;
  onShowAll: () => void;
};

/**
 * The dashed box a schema's tables live in. Its size comes from the layout
 * (`style.width/height`), so this only draws the frame and the title strip.
 */
export const SchemaGroupNode = memo(function SchemaGroupNode({ data }: NodeProps) {
  const d = data as unknown as SchemaGroupData;
  const more = d.total - d.shown;
  return (
    // The box is a backdrop: only its header takes pointer events, so dragging
    // and clicking the canvas work straight through it.
    <div className="vs-box pointer-events-none h-full w-full rounded-2xl border-2 border-dashed border-foreground/25">
      <div className="vs-box-handle pointer-events-auto flex h-[44px] cursor-grab items-center gap-2 px-3 active:cursor-grabbing" title="Drag to move the whole schema">
        <span className="flex items-center gap-2 rounded-lg border border-border bg-panel px-2.5 py-1">
        {d.source ? <Waypoints className="h-4 w-4 shrink-0 text-teal" /> : <FolderOpen className="h-4 w-4 shrink-0 text-primary" />}
          <span className="truncate font-heading text-[15px] font-semibold tracking-tight text-foreground">{d.schema}</span>
          {d.source ? <span className="rounded-full bg-teal/15 px-2 py-px text-[10px] font-semibold uppercase tracking-wide text-teal">{d.source}</span> : null}
        </span>
        <span className="ml-auto shrink-0 rounded-md bg-panel px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
          {more > 0 ? `${d.shown} of ${d.total} tables` : `${d.total} table${d.total === 1 ? "" : "s"}`}
        </span>
        {more > 0 ? (
          <>
            <button onClick={d.onShowMore} onPointerDown={(e) => e.stopPropagation()} className="nodrag shrink-0 rounded-md border border-border bg-panel px-2 py-0.5 text-[11px] text-foreground hover:bg-secondary">
              Show {Math.min(more, TABLE_PAGE)} more
            </button>
            <button onClick={d.onShowAll} onPointerDown={(e) => e.stopPropagation()} className="nodrag shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">
              All
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
});

/** Tables drawn per schema box before the user asks for more. */
export const TABLE_PAGE = 20;

/** The last box on the canvas: attach another database or bucket right here. */
export function AddSourceNode({ data }: NodeProps) {
  const d = data as unknown as { onClick: () => void };
  return (
    <button
      onClick={d.onClick}
      data-agent-id="visualizer.add-source-box"
      className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-teal/50 bg-teal/5 text-teal transition-colors hover:border-teal hover:bg-teal/10"
    >
      <Plus className="h-7 w-7" />
      <span className="text-[13px] font-semibold">Add data source</span>
      <span className="px-6 text-center text-[11px] text-muted-foreground">PostgreSQL, MySQL, S3, another Exasol… as a live schema here</span>
    </button>
  );
}

export const nodeTypes = { table: TableNode, schemaGroup: SchemaGroupNode, addSource: memo(AddSourceNode) };
export const edgeTypes = { beam: BeamEdge };

export function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between text-[12px] text-foreground"
    >
      <span>{label}</span>
      <span
        className={cn(
          "relative h-4 w-7 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-secondary",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform",
            checked ? "left-3.5" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

export function edgeIsActive(d: BeamEdgeData, sel: Selection): boolean {
  if (!sel) return false;
  if (d.source !== sel.table && d.target !== sel.table) return false;
  if (!sel.column) return true;
  return d.sourceColumn === sel.column || d.targetColumn === sel.column;
}


