import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion } from "motion/react";
import { KeyRound, Link2, Loader2, Search, Table2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShineBorder } from "@/components/ui/shine-border";
import { errorMessage, ipc, type GraphTable, type SchemaGraph } from "@/lib/ipc";
import { cn } from "@/lib/utils";

const PURPLE_FROM = "#a78bfa";
const PURPLE_TO = "#7c3aed";
const NODE_W = 232;
const HEADER_H = 34;
const ROW_H = 26;

// Module-level caches so switching tabs and coming back doesn't refetch.
const graphCache = new Map<string, SchemaGraph>();
const schemaCache = new Map<string, string[]>();
const lastSchema = new Map<string, string>();

type Selection = { table: string; column?: string } | null;

type TableNodeData = {
  table: GraphTable;
  selTable?: string;
  selColumn?: string;
  sourceCols: Set<string>;
  targetCols: Set<string>;
  onSelect: (table: string, column?: string) => void;
};

type BeamEdgeData = {
  source: string;
  target: string;
  sourceColumn: string;
  targetColumn: string;
  label: string;
  active: boolean;
};

const rowY = (i: number) => HEADER_H + i * ROW_H + ROW_H / 2;
const nodeHeight = (t: GraphTable) => HEADER_H + t.columns.length * ROW_H;

/** Table card. Connection points sit on the exact key columns; the animated
 * shine border shows only when the table is selected. */
function TableNode({ data }: NodeProps) {
  const d = data as unknown as TableNodeData;
  const { table, selTable, selColumn, sourceCols, targetCols, onSelect } = d;
  const isSel = selTable === table.name;
  return (
    <div
      style={{ width: NODE_W }}
      className={cn(
        "relative overflow-hidden rounded-xl border bg-panel shadow-xl transition-colors",
        isSel ? "border-[#a78bfa]" : "border-border",
      )}
    >
      {/* Per-column connection handles — only on columns that link somewhere. */}
      {table.columns.map((col, i) =>
        targetCols.has(col.name) ? (
          <Handle
            key={`t-${col.name}`}
            type="target"
            id={`${col.name}__t`}
            position={Position.Left}
            style={{ top: rowY(i) }}
            className="!h-2 !w-2 !border-0 !bg-[#a78bfa]"
          />
        ) : null,
      )}
      {table.columns.map((col, i) =>
        sourceCols.has(col.name) ? (
          <Handle
            key={`s-${col.name}`}
            type="source"
            id={`${col.name}__s`}
            position={Position.Right}
            style={{ top: rowY(i) }}
            className="!h-2 !w-2 !border-0 !bg-[#a78bfa]"
          />
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
        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
          {table.columns.length}
        </span>
      </button>

      <div>
        {table.columns.map((col) => {
          const colSel = isSel && selColumn === col.name;
          const linked = sourceCols.has(col.name) || targetCols.has(col.name);
          return (
            <div
              key={col.name}
              onClick={() => onSelect(table.name, col.name)}
              style={{ height: ROW_H }}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 border-b border-border/40 px-3 font-mono text-[11px] transition-colors last:border-0 hover:bg-secondary/50",
                colSel && "bg-[#a78bfa]/20",
              )}
            >
              {col.pk ? (
                <KeyRound className="h-3 w-3 shrink-0 text-warning" />
              ) : linked ? (
                <Link2 className="h-3 w-3 shrink-0 text-[#a78bfa]" />
              ) : (
                <span className="w-3 shrink-0" />
              )}
              <span className={cn("truncate", col.pk || linked ? "text-foreground" : "text-muted-foreground")}>
                {col.name}
              </span>
              <span className="ml-auto shrink-0 truncate text-syntax-type/70">{col.dataType}</span>
            </div>
          );
        })}
      </div>

      {isSel ? (
        <ShineBorder shineColor={["#A07CFE", "#FE8FB5", "#FFBE7B"]} borderWidth={2} duration={8} />
      ) : null}
    </div>
  );
}

/** Foreign-key edge — subtle by default; a purple animated beam with a pulse
 * and tag when connected to the selected table/column. */
function BeamEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const d = data as unknown as BeamEdgeData;
  const active = d?.active;
  const gid = `beam-${id}`;
  const pathId = `beampath-${id}`;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{ stroke: "var(--border)", strokeWidth: active ? 2 : 1.25, opacity: active ? 0.5 : 0.35 }}
      />
      {active ? (
        <>
          <path id={pathId} d={path} fill="none" stroke={`url(#${gid})`} strokeWidth={2.75} strokeLinecap="round" />
          <circle r="3.5" fill={PURPLE_TO}>
            <animateMotion dur="2.4s" repeatCount="indefinite">
              <mpath href={`#${pathId}`} />
            </animateMotion>
          </circle>
          <defs>
            <motion.linearGradient
              id={gid}
              initial={{ x1: "0%", x2: "0%" }}
              animate={{ x1: ["-25%", "100%"], x2: ["0%", "125%"] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "linear" }}
            >
              <stop stopColor={PURPLE_FROM} stopOpacity="0" />
              <stop offset="0.5" stopColor={PURPLE_FROM} />
              <stop offset="1" stopColor={PURPLE_TO} stopOpacity="0" />
            </motion.linearGradient>
          </defs>
        </>
      ) : null}
      {active && d?.label ? (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)` }}
            className="pointer-events-none absolute rounded-md border border-[#a78bfa]/60 bg-[#a78bfa]/15 px-1.5 py-0.5 font-mono text-[9.5px] whitespace-nowrap text-[#c4b5fd]"
          >
            {d.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const nodeTypes = { table: TableNode };
const edgeTypes = { beam: BeamEdge };

function edgeIsActive(d: BeamEdgeData, sel: Selection): boolean {
  if (!sel) return false;
  if (d.source !== sel.table && d.target !== sel.table) return false;
  if (!sel.column) return true;
  return d.sourceColumn === sel.column || d.targetColumn === sel.column;
}

export function Visualizer({
  profileId,
  connectionName,
}: {
  profileId: string;
  connectionName: string;
}) {
  const [schemas, setSchemas] = useState<string[]>(() => schemaCache.get(profileId) ?? []);
  const [schema, setSchema] = useState<string>(() => lastSchema.get(profileId) ?? "");
  const [graph, setGraph] = useState<SchemaGraph | null>(
    () => graphCache.get(`${profileId}:${lastSchema.get(profileId) ?? ""}`) ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState<Selection>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const onSelect = useCallback((table: string, column?: string) => {
    setSel((prev) =>
      prev && prev.table === table && prev.column === column ? null : { table, column },
    );
  }, []);

  useEffect(() => {
    const cached = schemaCache.get(profileId);
    if (cached) {
      setSchemas(cached);
      setSchema((cur) => cur || lastSchema.get(profileId) || cached[0] || "");
      return;
    }
    ipc
      .getDatabaseOverview(profileId)
      .then((o) => {
        const names = o.schemas.map((s) => s.name);
        schemaCache.set(profileId, names);
        setSchemas(names);
        setSchema((cur) => cur || names[0] || "");
      })
      .catch((e) => setError(errorMessage(e)));
  }, [profileId]);

  useEffect(() => {
    if (!schema) return;
    lastSchema.set(profileId, schema);
    const key = `${profileId}:${schema}`;
    const cached = graphCache.get(key);
    if (cached) {
      setGraph(cached);
      setError(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    setSel(null);
    ipc
      .getSchemaGraph(profileId, schema)
      .then((g) => {
        graphCache.set(key, g);
        if (alive) setGraph(g);
      })
      .catch((e) => alive && setError(errorMessage(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [profileId, schema]);

  const needle = search.trim().toLowerCase();

  // Rebuild layout when the graph or filter changes.
  useEffect(() => {
    if (!graph) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const visible = graph.tables.filter((t) => !needle || t.name.toLowerCase().includes(needle));
    const names = new Set(visible.map((t) => t.name));
    const links = graph.links.filter(
      (l) => names.has(l.source) && names.has(l.target) && l.source !== l.target,
    );

    // Which columns are link endpoints (so we only draw handles there).
    const sourceCols = new Map<string, Set<string>>();
    const targetCols = new Map<string, Set<string>>();
    for (const l of links) {
      if (!sourceCols.has(l.source)) sourceCols.set(l.source, new Set());
      sourceCols.get(l.source)!.add(l.sourceColumn);
      if (!targetCols.has(l.target)) targetCols.set(l.target, new Set());
      targetCols.get(l.target)!.add(l.targetColumn);
    }

    // Grid layout with per-row height so tall tables never overlap.
    const cols = Math.max(1, Math.ceil(Math.sqrt(visible.length)));
    const gapX = 96;
    const gapY = 72;
    const rowMax: number[] = [];
    visible.forEach((t, i) => {
      const r = Math.floor(i / cols);
      rowMax[r] = Math.max(rowMax[r] ?? 0, nodeHeight(t));
    });
    const rowTop: number[] = [];
    let acc = 0;
    for (let r = 0; r < rowMax.length; r++) {
      rowTop[r] = acc;
      acc += rowMax[r] + gapY;
    }

    setNodes(
      visible.map((table, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        return {
          id: table.name,
          type: "table",
          position: { x: c * (NODE_W + gapX), y: rowTop[r] },
          data: {
            table,
            onSelect,
            sourceCols: sourceCols.get(table.name) ?? new Set(),
            targetCols: targetCols.get(table.name) ?? new Set(),
          } as unknown as Record<string, unknown>,
        };
      }),
    );
    setEdges(
      links.map((l, i) => ({
        id: `${l.source}.${l.sourceColumn}->${l.target}.${l.targetColumn}-${i}`,
        source: l.source,
        target: l.target,
        sourceHandle: `${l.sourceColumn}__s`,
        targetHandle: `${l.targetColumn}__t`,
        type: "beam",
        data: {
          source: l.source,
          target: l.target,
          sourceColumn: l.sourceColumn,
          targetColumn: l.targetColumn,
          label: `${l.sourceColumn} → ${l.targetColumn}`,
          active: false,
        } as unknown as Record<string, unknown>,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, needle]);

  // Reflect selection into node/edge data without touching positions.
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        selected: n.id === sel?.table,
        data: { ...n.data, selTable: sel?.table, selColumn: sel?.column },
      })),
    );
    setEdges((eds) =>
      eds.map((e) => {
        const d = e.data as unknown as BeamEdgeData;
        return { ...e, data: { ...e.data, active: edgeIsActive(d, sel) } };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  const counts = useMemo(() => ({ nodes: nodes.length, edges: edges.length }), [nodes, edges]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-3">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-[#a78bfa]" />
          <span className="font-heading text-[14px] font-bold text-foreground">Visualizer</span>
          <span className="text-xs text-muted-foreground">{connectionName}</span>
        </div>
        <div className="ml-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>Schema</span>
          <Select value={schema} onValueChange={setSchema} disabled={schemas.length === 0}>
            <SelectTrigger className="h-7 min-w-[140px] text-xs" size="sm">
              <SelectValue placeholder="schema" />
            </SelectTrigger>
            <SelectContent>
              {schemas.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="relative ml-auto w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          {search ? (
            <button
              aria-label="Clear"
              onClick={() => setSearch("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 pr-8 pl-8 text-xs"
            placeholder="Filter tables…"
          />
        </div>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {counts.nodes} tables · {counts.edges} links
        </span>
      </header>

      <div className="relative min-h-0 flex-1">
        {loading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-editor/60 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Building graph…
          </div>
        ) : null}
        {error ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
            <div className="max-w-md rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-muted-foreground">
              {error}
            </div>
          </div>
        ) : null}
        {!loading && !error && nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No tables to visualize in this schema.
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onPaneClick={() => setSel(null)}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            minZoom={0.15}
            proOptions={{ hideAttribution: true }}
            className="bg-editor"
          >
            <Background color="var(--border)" gap={22} />
            <Controls className="!bottom-3 !left-3" showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              className="!right-3 !bottom-3"
              maskColor="rgba(0,0,0,0.4)"
              nodeColor={PURPLE_FROM}
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
