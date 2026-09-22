/**
 * The schema diagram's building blocks: table nodes, beam edges, their
 * styling, and the edge-selection rule. Moved verbatim out of Visualizer.tsx;
 * no behaviour lives here that the component did not already have.
 */
import { createContext, useContext } from "react";
import { EdgeLabelRenderer, Handle, Position, getBezierPath, type EdgeProps, type NodeProps } from "@xyflow/react";
import { motion } from "motion/react";
import { KeyRound, Table2 } from "lucide-react";
import { ShineBorder } from "@/components/ui/shine-border";
import type { GraphTable } from "@/lib/ipc";
import { cn } from "@/lib/utils";

export const NODE_W = 232;
export const HEADER_H = 34;
export const ROW_H = 26;

export type Selection = { table: string; column?: string } | null;
export type Mode = "diagram" | "build";

export type TableNodeData = {
  table: GraphTable;
  mode: Mode;
  selTable?: string;
  selColumn?: string;
  picked: Set<string>; // `${table}.${col}` chosen for SELECT
  sourceCols: Set<string>;
  targetCols: Set<string>;
  matchedTables: Set<string>;
  matchedCols: Set<string>;
  onSelect: (table: string, column?: string) => void;
  onPick: (table: string, column: string) => void;
};

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

export const EdgeStyleContext = createContext<EdgeStyle>(DEFAULT_EDGE_STYLE);

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

export function TableNode({ data }: NodeProps) {
  const d = data as unknown as TableNodeData;
  const { table, mode, selTable, selColumn, picked, sourceCols, targetCols, matchedTables, matchedCols, onSelect, onPick } = d;
  const isSel = selTable === table.name;
  const build = mode === "build";
  const tableMatched = matchedTables?.has(table.name);
  return (
    <div
      style={{ width: NODE_W }}
      className={cn(
        "relative overflow-hidden rounded-xl border bg-panel shadow-xl transition-colors",
        isSel ? "border-[#a78bfa]" : tableMatched ? "border-amber-400 ring-2 ring-amber-400/40" : "border-border",
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
        onClick={() => onSelect(table.name)}
        style={{ height: HEADER_H }}
        className={cn(
          "flex w-full items-center gap-1.5 border-b border-border px-3 text-left transition-colors",
          isSel ? "bg-[#a78bfa]/15" : "bg-secondary/70 hover:bg-secondary",
        )}
      >
        <Table2 className={cn("h-3.5 w-3.5 shrink-0", isSel ? "text-[#a78bfa]" : "text-primary")} />
        <span className="truncate text-[13px] font-semibold text-foreground">{table.name}</span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">{table.columns.length}</span>
      </button>

      <div>
        {table.columns.map((col) => {
          const key = colKey(table.name, col.name);
          const isPicked = picked.has(key);
          const colSel = isSel && selColumn === col.name;
          const colMatched = matchedCols?.has(key);
          return (
            <div
              key={col.name}
              onClick={() => (build ? onPick(table.name, col.name) : onSelect(table.name, col.name))}
              style={{ height: ROW_H }}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 border-b border-border/40 px-3 font-mono text-[11px] transition-colors last:border-0 hover:bg-secondary/50",
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
              <span
                className={cn(
                  "truncate",
                  colMatched ? "font-semibold text-amber-300" : col.pk ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {col.name}
              </span>
              {colMatched ? (
                <span className="shrink-0 rounded bg-amber-400/20 px-1 text-[8px] font-semibold tracking-wide text-amber-300 uppercase">
                  match
                </span>
              ) : null}
              <span className="ml-auto shrink-0 truncate text-syntax-type/70">{col.dataType}</span>
            </div>
          );
        })}
      </div>

      {isSel && !build ? (
        <ShineBorder shineColor={["#A07CFE", "#FE8FB5", "#FFBE7B"]} borderWidth={2} duration={8} />
      ) : null}
    </div>
  );
}

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
  const opacity = active ? 1 : inferred ? 0.55 : 0.85;
  const animate = cfg.pulse && (active || !inferred);
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
        <>
          {/* Brighter moving highlight + travelling dot on top of the pulse line. */}
          <path d={path} fill="none" stroke={`url(#${gid})`} strokeWidth={width + 1.5} strokeLinecap="round" />
          <circle r={width + 2} fill={pulse}>
            <animateMotion dur="2.4s" repeatCount="indefinite" rotate="auto">
              <mpath xlinkHref={`#${pathId}`} href={`#${pathId}`} />
            </animateMotion>
          </circle>
          <defs>
            <motion.linearGradient
              id={gid}
              initial={{ x1: "0%", x2: "0%" }}
              animate={{ x1: ["-25%", "100%"], x2: ["0%", "125%"] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
            >
              {/* White shimmer travelling along the pulse-colored line. */}
              <stop stopColor="#ffffff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.85" />
              <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
            </motion.linearGradient>
          </defs>
        </>
      ) : null}
      {d?.label && (active || !inferred) ? (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
              borderColor: `${cfg.to}66`,
              background: `${cfg.to}1f`,
              color: cfg.from,
            }}
            className="pointer-events-none absolute rounded-md border px-1.5 py-0.5 font-mono text-[9.5px] whitespace-nowrap"
          >
            {inferred ? `≈ ${d.score !== undefined ? d.score.toFixed(1) + " " : ""}` : ""}
            {d.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const nodeTypes = { table: TableNode };
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


