import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  QueryBuilder,
  formatQuery,
  type Classnames,
  type Field,
  type RuleGroupType,
} from "react-querybuilder";
import { motion } from "motion/react";
import {
  Check,
  Columns3,
  Copy,
  Filter,
  KeyRound,
  Link2,
  Loader2,
  RotateCw,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Waypoints,
  SquarePen,
  Table2,
  Workflow,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShineBorder } from "@/components/ui/shine-border";
import { errorMessage, ipc, type GraphLink, type GraphTable, type SchemaGraph } from "@/lib/ipc";
import { cn } from "@/lib/utils";

const NODE_W = 232;
const HEADER_H = 34;
const ROW_H = 26;

const graphCache = new Map<string, SchemaGraph>();
const schemaCache = new Map<string, string[]>();
const lastSchema = new Map<string, string>();

type Selection = { table: string; column?: string } | null;
type Mode = "diagram" | "build";

type TableNodeData = {
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

type BeamEdgeData = {
  source: string;
  target: string;
  sourceColumn: string;
  targetColumn: string;
  label: string;
  active: boolean;
  inferred: boolean;
};

type EdgeStyle = {
  show: boolean;
  pulse: boolean;
  line: "solid" | "dashed" | "dotted";
  width: number;
  from: string;
  to: string;
  /** The travelling pulse/beam color — distinct from the static link color. */
  pulseColor: string;
};

const DEFAULT_EDGE_STYLE: EdgeStyle = {
  show: true,
  pulse: true,
  line: "solid",
  width: 2,
  from: "#a78bfa",
  to: "#7c3aed",
  // Cyan pulse over the purple link — reads clearly as "flow" vs. the link.
  pulseColor: "#22d3ee",
};

const EdgeStyleContext = createContext<EdgeStyle>(DEFAULT_EDGE_STYLE);

const COLOR_PRESETS: { label: string; from: string; to: string }[] = [
  { label: "Purple", from: "#a78bfa", to: "#7c3aed" },
  { label: "Teal", from: "#5eead4", to: "#0d9488" },
  { label: "Blue", from: "#7dd3fc", to: "#2563eb" },
  { label: "Amber", from: "#fcd34d", to: "#d97706" },
  { label: "Pink", from: "#f9a8d4", to: "#db2777" },
  { label: "Green", from: "#86efac", to: "#16a34a" },
];

const PULSE_PRESETS: { label: string; color: string }[] = [
  { label: "Cyan", color: "#22d3ee" },
  { label: "Green", color: "#4ade80" },
  { label: "Amber", color: "#fbbf24" },
  { label: "Pink", color: "#f472b6" },
  { label: "White", color: "#f8fafc" },
  { label: "Match link", color: "" }, // empty → use the link's `to` color
];

function dashFor(line: EdgeStyle["line"], w: number): string | undefined {
  if (line === "dashed") return `${Math.max(4, w * 3)} ${Math.max(3, w * 2)}`;
  if (line === "dotted") return `1 ${Math.max(3, w * 2.5)}`;
  return undefined;
}

/** Subsequence fuzzy score (higher = better); null if not all chars match. */
function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  const direct = t.indexOf(q);
  let base = 0;
  if (direct >= 0) base = 1000 - direct * 5 + (direct === 0 ? 200 : 0); // substring wins
  let qi = 0;
  let score = 0;
  let last = -2;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += ti === last + 1 ? 5 : 1;
      if (ti === 0) score += 3;
      last = ti;
      qi++;
    }
  }
  if (qi < q.length) return null;
  return base + score;
}

const rowY = (i: number) => HEADER_H + i * ROW_H + ROW_H / 2;
const nodeHeight = (t: GraphTable) => HEADER_H + t.columns.length * ROW_H;
const colKey = (table: string, col: string) => `${table}.${col}`;

function TableNode({ data }: NodeProps) {
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

function BeamEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps) {
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
            {inferred ? "≈ " : ""}
            {d.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const nodeTypes = { table: TableNode };
const edgeTypes = { beam: BeamEdge };

// shadcn-styled controls for react-querybuilder so the WHERE builder matches
// the app in both themes.
const INPUT_CLS =
  "h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary/60";
const RQB_CLASSNAMES: Partial<Classnames> = {
  queryBuilder: "flex flex-col gap-2",
  ruleGroup: "flex flex-col gap-2 rounded-lg border border-border bg-secondary/25 p-2",
  header: "flex flex-wrap items-center gap-1.5",
  body: "flex flex-col gap-1.5 pl-2",
  rule: "flex flex-wrap items-center gap-1.5 rounded-md bg-panel/50 px-1.5 py-1",
  combinators: INPUT_CLS,
  fields: `${INPUT_CLS} max-w-[180px]`,
  operators: INPUT_CLS,
  value: INPUT_CLS,
  addRule:
    "flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
  addGroup:
    "flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
  removeRule:
    "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive",
  removeGroup:
    "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive",
};
const RQB_TRANSLATIONS = {
  addRule: { label: "+ Condition", title: "Add condition" },
  addGroup: { label: "+ Group", title: "Add group" },
  removeRule: { label: "✕", title: "Remove" },
  removeGroup: { label: "✕", title: "Remove group" },
};

function ToggleRow({
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

function edgeIsActive(d: BeamEdgeData, sel: Selection): boolean {
  if (!sel) return false;
  if (d.source !== sel.table && d.target !== sel.table) return false;
  if (!sel.column) return true;
  return d.sourceColumn === sel.column || d.targetColumn === sel.column;
}

/** Build a SELECT from picked columns, joining involved tables via FK links. */
function buildSql(
  schema: string,
  picked: string[],
  links: GraphLink[],
  whereSql: string,
  orderKey: string | null,
  orderDir: "ASC" | "DESC",
  limit: number | null,
): string {
  if (picked.length === 0) return "-- Tick columns on the tables to build a query.";
  const q = (id: string) => `"${id}"`;
  const qualify = (key: string) => {
    const [t, c] = key.split(".");
    return `${q(t)}.${q(c)}`;
  };
  const involved: string[] = [];
  for (const k of picked) {
    const t = k.split(".")[0];
    if (!involved.includes(t)) involved.push(t);
  }
  const base = involved[0];
  const included = new Set([base]);
  const joins: string[] = [];
  let progress = true;
  while (progress && included.size < involved.length) {
    progress = false;
    for (const t of involved) {
      if (included.has(t)) continue;
      const link = links.find(
        (l) => (l.source === t && included.has(l.target)) || (l.target === t && included.has(l.source)),
      );
      if (link) {
        joins.push(
          `JOIN ${q(schema)}.${q(t)} ON ${q(link.source)}.${q(link.sourceColumn)} = ${q(link.target)}.${q(link.targetColumn)}`,
        );
        included.add(t);
        progress = true;
      }
    }
  }
  for (const t of involved) {
    if (!included.has(t)) {
      joins.push(`CROSS JOIN ${q(schema)}.${q(t)}`);
      included.add(t);
    }
  }
  let sql = `SELECT\n  ${picked.map(qualify).join(",\n  ")}\nFROM ${q(schema)}.${q(base)}`;
  for (const j of joins) sql += `\n${j}`;
  if (whereSql && whereSql !== "(1 = 1)" && whereSql.trim()) sql += `\nWHERE ${whereSql}`;
  if (orderKey) sql += `\nORDER BY ${qualify(orderKey)} ${orderDir}`;
  if (limit && limit > 0) sql += `\nLIMIT ${limit}`;
  return sql + ";";
}

export function Visualizer({
  profileId,
  connectionName,
  onOpenSql,
  onNewVs,
  instanceId,
}: {
  profileId: string;
  connectionName: string;
  onOpenSql?: (sql: string, run: boolean) => void;
  onNewVs?: () => void;
  /** Unique per Visualizer tab — scopes the "which schema" memory so a new
   *  tab starts independent of previous tabs. Defaults to the profile. */
  instanceId?: string;
}) {
  // Per-tab schema memory (independent tabs); the heavier graph/schema-list
  // caches stay keyed by profile since they're the same database.
  const schemaKey = instanceId ?? profileId;
  const [schemas, setSchemas] = useState<string[]>(() => schemaCache.get(profileId) ?? []);
  const [schema, setSchema] = useState<string>(() => lastSchema.get(schemaKey) ?? "");
  const [graph, setGraph] = useState<SchemaGraph | null>(
    () => graphCache.get(`${profileId}:${lastSchema.get(schemaKey) ?? ""}`) ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState<Selection>(null);
  const [mode, setMode] = useState<Mode>("diagram");
  const [showInferred, setShowInferred] = useState(true);
  const [edgeStyle, setEdgeStyle] = useState<EdgeStyle>(DEFAULT_EDGE_STYLE);
  const [searchOpen, setSearchOpen] = useState(false);
  const [stylePanelOpen, setStylePanelOpen] = useState(false);
  // Bumped to force a cache-bypassing re-fetch (manual refresh, or a catalog
  // change elsewhere in the app — new schema/table).
  const [refreshTick, setRefreshTick] = useState(0);

  const reload = useCallback(() => {
    schemaCache.delete(profileId);
    for (const key of Array.from(graphCache.keys())) {
      if (key.startsWith(`${profileId}:`)) graphCache.delete(key);
    }
    setRefreshTick((t) => t + 1);
  }, [profileId]);

  // Keep the diagram live: when tables/schemas change anywhere in the app
  // (a CREATE/DROP ran, data was loaded), refetch this connection's graph.
  useEffect(() => {
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ profileId?: string }>).detail;
      if (!detail?.profileId || detail.profileId === profileId) reload();
    };
    window.addEventListener("studio:catalog-changed", onChanged);
    return () => window.removeEventListener("studio:catalog-changed", onChanged);
  }, [profileId, reload]);

  // Query builder state
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [where, setWhere] = useState<RuleGroupType>({ combinator: "and", rules: [] });
  const [orderKey, setOrderKey] = useState<string | null>(null);
  const [orderDir, setOrderDir] = useState<"ASC" | "DESC">("ASC");
  const [limit, setLimit] = useState<number>(1000);
  const [copied, setCopied] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const rfRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);

  const onSelect = useCallback((table: string, column?: string) => {
    setSel((prev) => (prev && prev.table === table && prev.column === column ? null : { table, column }));
  }, []);
  const onPick = useCallback((table: string, column: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      const key = colKey(table, column);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  useEffect(() => {
    const cached = schemaCache.get(profileId);
    if (cached) {
      setSchemas(cached);
      setSchema((cur) => cur || lastSchema.get(schemaKey) || cached[0] || "");
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
  }, [profileId, refreshTick]);

  useEffect(() => {
    if (!schema) return;
    lastSchema.set(schemaKey, schema);
    setPicked(new Set());
    setWhere({ combinator: "and", rules: [] });
    setOrderKey(null);
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
  }, [profileId, schema, refreshTick]);

  // Rebuild layout when the graph or filter changes.
  useEffect(() => {
    if (!graph) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const visible = graph.tables;
    const names = new Set(visible.map((t) => t.name));
    const declared = graph.links
      .filter((l) => names.has(l.source) && names.has(l.target) && l.source !== l.target)
      .map((l) => ({ ...l, inferred: false }));

    // Infer relationships when no FK is declared: a column whose name matches
    // another table's primary-key column name (e.g. energy.METER_ID → meters.METER_ID).
    const linkKey = (l: { source: string; sourceColumn: string; target: string; targetColumn: string }) =>
      `${l.source}.${l.sourceColumn}>${l.target}.${l.targetColumn}`;
    const declaredSet = new Set(declared.map(linkKey));
    const pkByTable = new Map<string, Set<string>>();
    visible.forEach((t) => pkByTable.set(t.name, new Set(t.columns.filter((c) => c.pk).map((c) => c.name))));
    const inferred: (GraphLink & { inferred: boolean })[] = [];
    if (showInferred) {
      const seen = new Set<string>();
      const colNames = new Map<string, Set<string>>();
      visible.forEach((t) => colNames.set(t.name, new Set(t.columns.map((c) => c.name))));
      // Treat every single-column primary key as a parent key; any OTHER table
      // that has a column of the same name is inferred to reference it — this
      // covers composite-key children (e.g. ENERGY_READINGS.METER_ID which is
      // part of that table's PK) referencing ENERGY_METERS.METER_ID.
      for (const parent of visible) {
        const pk = [...(pkByTable.get(parent.name) ?? new Set())];
        if (pk.length !== 1) continue;
        const key = pk[0];
        for (const child of visible) {
          if (child.name === parent.name) continue;
          if (!(colNames.get(child.name) ?? new Set()).has(key)) continue;
          // Skip if the child also has this exact column as a single-col PK
          // (both are parents of the same key — ambiguous).
          const childPk = pkByTable.get(child.name) ?? new Set();
          if (childPk.has(key) && childPk.size === 1) continue;
          const l = { source: child.name, sourceColumn: key, target: parent.name, targetColumn: key, inferred: true };
          const k = linkKey(l);
          if (!declaredSet.has(k) && !seen.has(k)) {
            seen.add(k);
            inferred.push(l as GraphLink & { inferred: boolean });
          }
        }
      }
    }
    const links = [...declared, ...inferred];

    const sourceCols = new Map<string, Set<string>>();
    const targetCols = new Map<string, Set<string>>();
    for (const l of links) {
      if (!sourceCols.has(l.source)) sourceCols.set(l.source, new Set());
      sourceCols.get(l.source)!.add(l.sourceColumn);
      if (!targetCols.has(l.target)) targetCols.set(l.target, new Set());
      targetCols.get(l.target)!.add(l.targetColumn);
    }
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
            mode,
            onSelect,
            onPick,
            picked,
            sourceCols: sourceCols.get(table.name) ?? new Set(),
            targetCols: targetCols.get(table.name) ?? new Set(),
            matchedTables: new Set<string>(),
            matchedCols: new Set<string>(),
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
          inferred: l.inferred,
        } as unknown as Record<string, unknown>,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, showInferred]);

  // Fuzzy search across table + column names → ranked results + match sets.
  const searchTerm = search.trim();
  const matches = useMemo(() => {
    if (!graph || !searchTerm) {
      return { results: [] as { table: string; column?: string; score: number }[], tables: new Set<string>(), cols: new Set<string>() };
    }
    const results: { table: string; column?: string; score: number }[] = [];
    const tables = new Set<string>();
    const cols = new Set<string>();
    for (const t of graph.tables) {
      const ts = fuzzyScore(searchTerm, t.name);
      if (ts !== null) {
        results.push({ table: t.name, score: ts + 50 });
        tables.add(t.name);
      }
      for (const c of t.columns) {
        const cs = Math.max(fuzzyScore(searchTerm, c.name) ?? -1, fuzzyScore(searchTerm, `${t.name}.${c.name}`) ?? -1);
        if (cs >= 0) {
          results.push({ table: t.name, column: c.name, score: cs });
          tables.add(t.name);
          cols.add(colKey(t.name, c.name));
        }
      }
    }
    results.sort((a, b) => b.score - a.score);
    return { results: results.slice(0, 60), tables, cols };
  }, [graph, searchTerm]);

  // Center the canvas on a table and select it.
  const jumpTo = useCallback(
    (table: string, column?: string) => {
      setSel({ table, column });
      const node = rfRef.current?.getNode?.(table) ?? nodes.find((n) => n.id === table);
      if (node && rfRef.current) {
        const t = (node.data as unknown as TableNodeData).table;
        const h = t ? nodeHeight(t) : 120;
        rfRef.current.setCenter(node.position.x + NODE_W / 2, node.position.y + h / 2, {
          zoom: 1.15,
          duration: 500,
        });
      }
    },
    [nodes],
  );

  // Reflect selection / mode / picked columns / matches into node & edge data.
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        selected: n.id === sel?.table,
        data: {
          ...n.data,
          mode,
          picked,
          selTable: sel?.table,
          selColumn: sel?.column,
          matchedTables: matches.tables,
          matchedCols: matches.cols,
        },
      })),
    );
    setEdges((eds) =>
      eds.map((e) => {
        const d = e.data as unknown as BeamEdgeData;
        return { ...e, data: { ...e.data, active: edgeIsActive(d, sel) } };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, mode, picked, matches]);

  const counts = useMemo(() => ({ nodes: nodes.length, edges: edges.length }), [nodes, edges]);

  // react-querybuilder fields from involved (picked) tables, else all tables.
  const fields: Field[] = useMemo(() => {
    if (!graph) return [];
    const involved = new Set([...picked].map((k) => k.split(".")[0]));
    const tables = involved.size ? graph.tables.filter((t) => involved.has(t.name)) : graph.tables;
    return tables.flatMap((t) =>
      t.columns.map((c) => ({ name: `"${t.name}"."${c.name}"`, label: `${t.name}.${c.name}` })),
    );
  }, [graph, picked]);

  const generatedSql = useMemo(() => {
    if (!graph) return "";
    const whereSql = where.rules.length
      ? formatQuery(where, { format: "sql", quoteFieldNamesWith: ["", ""] as [string, string] })
      : "";
    return buildSql(schema, [...picked], graph.links, whereSql, orderKey, orderDir, limit);
  }, [graph, schema, picked, where, orderKey, orderDir, limit]);

  const pickedFields: Field[] = useMemo(
    () => [...picked].map((k) => ({ name: k, label: k })),
    [picked],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <header className="flex h-11 shrink-0 items-center gap-3 overflow-x-auto border-b border-border px-3 [scrollbar-width:thin]">
        <div className="flex shrink-0 items-center gap-2">
          <Link2 className="h-4 w-4 text-[#a78bfa]" />
          <span className="font-heading text-[14px] font-bold text-foreground">Schema visualizer</span>
          <span className="text-xs text-muted-foreground">{connectionName}</span>
        </div>
        {/* Diagram ↔ Build — Build (visual query builder) is promoted with an
            accent + label so users discover they can build SQL without typing. */}
        <div className="ml-1 flex shrink-0 items-center rounded-md border border-border p-0.5">
          <button
            onClick={() => setMode("diagram")}
            className={cn(
              "flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors",
              mode === "diagram" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Workflow className="h-3.5 w-3.5" /> Diagram
          </button>
          <button
            onClick={() => setMode("build")}
            title="Build a query visually — pick columns, filters and joins, no SQL typing"
            className={cn(
              "relative flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors",
              mode === "build"
                ? "bg-primary text-primary-foreground"
                : "text-primary hover:bg-primary/10",
            )}
          >
            <SquarePen className="h-3.5 w-3.5" /> Build
            {mode !== "build" && picked.size === 0 ? (
              <span className="ml-0.5 rounded bg-primary/15 px-1 py-px text-[8.5px] font-semibold uppercase tracking-wide text-primary">
                no-SQL
              </span>
            ) : picked.size > 0 ? (
              <span className="ml-0.5 rounded-full bg-primary px-1.5 py-px font-mono text-[9px] text-primary-foreground">
                {picked.size}
              </span>
            ) : null}
          </button>
        </div>
        <div className="ml-1 flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>Schema</span>
          <Select value={schema} onValueChange={setSchema} disabled={schemas.length === 0}>
            <SelectTrigger className="h-7 min-w-[130px] text-xs" size="sm">
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
          <button
            onClick={reload}
            title="Refresh — re-read schemas and tables from the database"
            aria-label="Refresh diagram"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>
        <button
          onClick={() => setShowInferred((s) => !s)}
          title="Show inferred relationships (matched by key column names)"
          className={cn(
            "ml-auto flex h-6 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors",
            showInferred
              ? "border-[#a78bfa]/50 bg-[#a78bfa]/10 text-[#c4b5fd]"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="text-[13px] leading-none">≈</span> Inferred
        </button>
        <button
          onClick={() => setStylePanelOpen((s) => !s)}
          title="Link style"
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
            stylePanelOpen ? "text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setSearchOpen((s) => !s)}
          title="Search tables (⌘F)"
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
            searchOpen ? "text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
        >
          <Search className="h-3.5 w-3.5" />
        </button>
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
            <div className="max-w-md rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-muted-foreground">{error}</div>
          </div>
        ) : null}
        {!loading && !error && nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No tables to visualize in this schema.</div>
        ) : (
          <EdgeStyleContext.Provider value={edgeStyle}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onInit={(inst) => (rfRef.current = inst)}
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
              <MiniMap pannable zoomable className="!right-3 !bottom-3" maskColor="color-mix(in srgb, var(--background) 55%, transparent)" nodeColor={edgeStyle.to} />
            </ReactFlow>
          </EdgeStyleContext.Provider>
        )}

        {/* Floating "add" — connect another database via a virtual schema */}
        {onNewVs ? (
          <button
            onClick={onNewVs}
            title="Add a virtual schema (connect another database)"
            className="absolute top-3 left-3 z-20 flex h-8 items-center gap-1.5 rounded-lg border border-border bg-popover px-2.5 text-[12px] font-medium text-foreground shadow-lg transition-colors hover:border-teal/50 hover:text-teal"
          >
            <Plus className="h-3.5 w-3.5" />
            <Waypoints className="h-3.5 w-3.5 text-teal" />
            Virtual schema
          </button>
        ) : null}

        {/* Floating VS Code-style fuzzy search over tables + columns */}
        {searchOpen ? (
          <div className="absolute top-3 right-3 z-20 flex w-80 flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-2xl">
            <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && matches.results[0]) {
                    jumpTo(matches.results[0].table, matches.results[0].column);
                  } else if (e.key === "Escape") {
                    setSearch("");
                    setSearchOpen(false);
                  }
                }}
                placeholder="Find tables & columns…"
                className="h-6 min-w-0 flex-1 bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
              />
              {searchTerm ? (
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{matches.results.length}</span>
              ) : null}
              <button
                aria-label="Close search"
                onClick={() => {
                  setSearch("");
                  setSearchOpen(false);
                }}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {searchTerm ? (
              <div className="max-h-64 overflow-auto py-1">
                {matches.results.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-muted-foreground">No matches.</p>
                ) : (
                  matches.results.map((m) => (
                    <button
                      key={`${m.table}.${m.column ?? ""}`}
                      onClick={() => jumpTo(m.table, m.column)}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-secondary/70"
                    >
                      {m.column ? (
                        <Columns3 className="h-3.5 w-3.5 shrink-0 text-syntax-type" />
                      ) : (
                        <Table2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        <span className="text-foreground">{m.column ?? m.table}</span>
                        {m.column ? (
                          <span className="ml-1.5 text-[10px] text-muted-foreground">{m.table}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 rounded bg-secondary px-1 py-px text-[9px] text-muted-foreground uppercase">
                        {m.column ? "col" : "table"}
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Link style panel */}
        {stylePanelOpen ? (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setStylePanelOpen(false)} />
            <div className="absolute top-3 right-3 z-30 w-64 rounded-lg border border-border bg-popover p-3 shadow-2xl">
              <div className="mb-2 flex items-center justify-between">
                <span className="eyebrow-muted">Link style</span>
                <button onClick={() => setStylePanelOpen(false)} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid gap-2.5">
                <ToggleRow label="Show links" checked={edgeStyle.show} onChange={(v) => setEdgeStyle((s) => ({ ...s, show: v }))} />
                <ToggleRow label="Animated pulse" checked={edgeStyle.pulse} onChange={(v) => setEdgeStyle((s) => ({ ...s, pulse: v }))} />
                <div>
                  <p className="mb-1 text-[11px] text-muted-foreground">Line</p>
                  <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                    {(["solid", "dashed", "dotted"] as const).map((l) => (
                      <button
                        key={l}
                        onClick={() => setEdgeStyle((s) => ({ ...s, line: l }))}
                        className={cn(
                          "flex-1 rounded px-2 py-1 text-[11px] font-medium capitalize transition-colors",
                          edgeStyle.line === l ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Width</span>
                    <span className="font-mono">{edgeStyle.width}px</span>
                  </p>
                  <input
                    type="range"
                    min={1}
                    max={6}
                    step={0.5}
                    value={edgeStyle.width}
                    onChange={(e) => setEdgeStyle((s) => ({ ...s, width: Number(e.target.value) }))}
                    className="w-full accent-primary"
                  />
                </div>
                <div>
                  <p className="mb-1 text-[11px] text-muted-foreground">Link color</p>
                  <div className="flex flex-wrap gap-1.5">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c.label}
                        title={c.label}
                        onClick={() => setEdgeStyle((s) => ({ ...s, from: c.from, to: c.to }))}
                        className={cn(
                          "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110",
                          edgeStyle.to === c.to ? "border-foreground" : "border-transparent",
                        )}
                        style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}
                      />
                    ))}
                  </div>
                </div>
                {edgeStyle.pulse ? (
                  <div>
                    <p className="mb-1 text-[11px] text-muted-foreground">Pulse color</p>
                    <div className="flex flex-wrap gap-1.5">
                      {PULSE_PRESETS.map((p) => {
                        const swatch = p.color || edgeStyle.to;
                        const selected = edgeStyle.pulseColor === p.color;
                        return (
                          <button
                            key={p.label}
                            title={p.label}
                            onClick={() => setEdgeStyle((s) => ({ ...s, pulseColor: p.color }))}
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-full border-2 transition-transform hover:scale-110",
                              selected ? "border-foreground" : "border-transparent",
                            )}
                            style={{ background: p.color ? swatch : "transparent" }}
                          >
                            {/* "Match link" preset shows a ring instead of a solid dot. */}
                            {!p.color ? (
                              <span
                                className="h-4 w-4 rounded-full border-2 border-dashed"
                                style={{ borderColor: swatch }}
                              />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </div>

      {mode === "build" ? (
        <div className="flex h-[320px] shrink-0 flex-col border-t border-border bg-panel">
          {/* Header */}
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
            <SquarePen className="h-3.5 w-3.5 text-primary" />
            <span className="text-[13px] font-semibold text-foreground">Query builder</span>
            <span className="rounded-full bg-secondary px-1.5 py-px font-mono text-[10px] text-muted-foreground">
              {picked.size} col{picked.size === 1 ? "" : "s"}
            </span>
            <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>Order by</span>
              <Select value={orderKey ?? "__none__"} onValueChange={(v) => setOrderKey(v === "__none__" ? null : v)}>
                <SelectTrigger className="h-6 min-w-[120px] text-xs" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">none</SelectItem>
                  {pickedFields.map((f) => (
                    <SelectItem key={f.name} value={f.name}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={orderDir} onValueChange={(v) => setOrderDir(v as "ASC" | "DESC")}>
                <SelectTrigger className="h-6 w-[70px] text-xs" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ASC">ASC</SelectItem>
                  <SelectItem value="DESC">DESC</SelectItem>
                </SelectContent>
              </Select>
              <span>Limit</span>
              <Input value={String(limit)} onChange={(e) => setLimit(Number(e.target.value) || 0)} inputMode="numeric" className="h-6 w-16 text-xs" />
            </div>
          </div>

          {/* Selected column chips */}
          <div className="flex min-h-9 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border px-3 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="shrink-0 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Select</span>
            {picked.size === 0 ? (
              <span className="text-[11px] text-muted-foreground/70">Tick columns on the tables above…</span>
            ) : (
              <>
                {[...picked].map((k) => (
                  <span
                    key={k}
                    className="flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-0.5 pr-1 pl-2 font-mono text-[10.5px] text-foreground"
                  >
                    {k}
                    <button
                      onClick={() => {
                        const [t, c] = k.split(".");
                        onPick(t, c);
                      }}
                      className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-destructive"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
                <button
                  onClick={() => setPicked(new Set())}
                  className="ml-1 shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </>
            )}
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[1.1fr_1fr]">
            {/* WHERE builder */}
            <div className="flex min-h-0 flex-col border-r border-border">
              <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border/60 px-3 text-[11px] text-muted-foreground">
                <Filter className="h-3 w-3" /> Filters (WHERE)
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-2.5">
                <QueryBuilder
                  fields={fields}
                  query={where}
                  onQueryChange={setWhere}
                  controlClassnames={RQB_CLASSNAMES}
                  translations={RQB_TRANSLATIONS}
                />
              </div>
            </div>

            {/* SQL preview + actions */}
            <div className="flex min-h-0 flex-col bg-editor">
              <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border/60 px-3 text-[11px] text-muted-foreground">
                SQL
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(generatedSql);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1200);
                  }}
                  disabled={picked.size === 0}
                  className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-secondary hover:text-foreground disabled:opacity-40"
                >
                  {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-3">
                <pre className="font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-foreground/90">{generatedSql}</pre>
              </div>
              <div className="flex h-11 shrink-0 items-center justify-end gap-2 border-t border-border px-3">
                <button
                  onClick={() => onOpenSql?.(generatedSql, false)}
                  disabled={picked.size === 0}
                  className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                >
                  Open in editor
                </button>
                <button
                  onClick={() => onOpenSql?.(generatedSql, true)}
                  disabled={picked.size === 0}
                  className="cta-glow flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-40"
                >
                  <Play className="h-3.5 w-3.5 fill-current" /> Run
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
