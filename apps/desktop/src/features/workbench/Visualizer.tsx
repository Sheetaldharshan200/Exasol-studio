import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import {
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  formatQuery,
  type Field,
  type RuleGroupType,
} from "react-querybuilder";
import {
  Check,
  ChevronDown,
  Columns3,
  Loader2,
  RotateCw,
  Plus,
  Search,
  SlidersHorizontal,
  Waypoints,
  SquarePen,
  Table2,
  Workflow,
  X,
} from "lucide-react";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { adapterForScript } from "@/features/connection/virtual-schemas/adapters/index.ts";
import { focusBounds } from "./visualizer-focus.ts";
import { inferLinks } from "./infer-links.ts";
import { formatClock, formatElapsed } from "@/lib/elapsed";
import { useElapsedMs } from "@/lib/use-elapsed-ms";
import { buildSql, type Aggregate, type JoinType } from "./build-sql.ts";
import { BuilderPane } from "./visualizer/BuilderPane";
import { GROUP_HEADER, budgetLinks, colKey, layoutSchemas, linkSummary, linksForSelection, mergeSchemaGraphs, splitColKey, splitTableId, whereSchemas, type ConnGraph } from "./visualizer/connection-graph";
import { isFarZoom, nameFontLimit, zoomVar } from "./visualizer/zoom-lod";
import {
  COLOR_PRESETS,
  DEFAULT_EDGE_STYLE,
  DENSE_EDGES,
  EdgeStyleContext,
  NODE_W,
  PULSE_PRESETS,
  ROW_H,
  edgeIsActive,
  edgeTypes,
  nodeHeight,
  nodeTypes,
  SCHEMA_NODE_TYPES,
  ToggleRow,
  type BeamEdgeData,
  type SchemaFarData,
  type EdgeStyle,
  type Mode,
  type Selection,
  type TableNodeData,
} from "./visualizer/diagram";
import { RQB_CLASSNAMES, RQB_TRANSLATIONS } from "./visualizer/query-builder-style";
import { fuzzyScore } from "./visualizer/search";
import { errorMessage, ipc, type GraphLink, type SchemaGraph } from "@/lib/ipc";
import { DiagramStateContext, TABLE_PAGE, type DiagramState, type SchemaGroupData } from "./visualizer/diagram";
import { cn } from "@/lib/utils";

const graphCache = new Map<string, SchemaGraph>();
/** A schema in the picker: virtual ones carry the source they federate. */
type SchemaEntry = { name: string; source?: string };
const schemaCache = new Map<string, SchemaEntry[]>();
/** Which schemas a tab shows; a new tab shows all of them. */
const lastSelection = new Map<string, string[]>();
const ADD_SOURCE_ID = "__add_source__";
/** How long the viewport stays promoted after a gesture (see global.css). */
const GESTURE_SETTLE_MS = 180;

/** Subsequence fuzzy score (higher = better); null if not all chars match. */

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
  const [schemas, setSchemas] = useState<SchemaEntry[]>(() => schemaCache.get(profileId) ?? []);
  // Every schema is on the canvas by default; the picker narrows.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(lastSelection.get(schemaKey) ?? schemaCache.get(profileId)?.map((s) => s.name) ?? []));
  const [graphs, setGraphs] = useState<Record<string, SchemaGraph>>({});
  // Tables drawn per schema box (TABLE_PAGE at first; "Show more" / "All" extend).
  const [shownPerSchema, setShownPerSchema] = useState<Record<string, number>>({});
  // The schema being fetched right now, its place in the queue and when the
  // load began — shown as a pill, never as a curtain: loaded schemas stay usable.
  const [loadingNow, setLoadingNow] = useState<{ schema: string; index: number; total: number; startedAt: number } | null>(null);
  const loading = loadingNow !== null;
  const loadElapsed = useElapsedMs(loadingNow?.startedAt, loading);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState<Selection>(null);
  const [mode, setMode] = useState<Mode>("diagram");
  const [showInferred, setShowInferred] = useState(true);
  // Inferred links below this confidence stay hidden (see infer-links.ts).
  const [minScore, setMinScore] = useState(0.6);
  const [hiddenInferred, setHiddenInferred] = useState(0);
  // Links held back by the render budget (see budgetLinks) — shown in the header.
  const [budgetHidden, setBudgetHidden] = useState(0);
  const [edgeStyle, setEdgeStyle] = useState<EdgeStyle>(DEFAULT_EDGE_STYLE);
  // Gestures never touch React state: classes on the pane (toggled through a
  // ref) hide link decoration and the minimap while moving, and drop column
  // text below FAR_ZOOM where a label is a couple of pixels tall anyway.
  const paneRef = useRef<HTMLDivElement>(null);
  const pane = useCallback(() => paneRef.current?.querySelector<HTMLElement>(".visualizer-pane") ?? null, []);
  const setPaneClass = useCallback((cls: string, on: boolean) => {
    pane()?.classList.toggle(cls, on);
  }, [pane]);
  // Every viewport change writes the live zoom into a CSS variable (so borders
  // and the schema name keep a constant SCREEN size) and picks the detail tier.
  const applyZoom = useCallback((zoom: number) => {
    const el = pane();
    if (!el) return;
    el.style.setProperty("--vs-zoom", zoomVar(zoom));
    el.classList.toggle("is-far", isFarZoom(zoom, ROW_H));
  }, [pane]);
  // The promotion outlives the gesture by a moment: a wheel zoom arrives as a
  // burst of separate gestures, and dropping the layer between them is what
  // made zooming out stutter and then stall.
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beginGesture = useCallback(() => {
    if (settle.current) clearTimeout(settle.current);
    setPaneClass("is-moving", true);
  }, [setPaneClass]);
  const endGesture = useCallback(() => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => setPaneClass("is-moving", false), GESTURE_SETTLE_MS);
  }, [setPaneClass]);
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);
  /** Frame one schema: click its name (or its big name when zoomed out). The
   *  box is read live, so a schema that has been dragged frames where it is. */
  const focusSchema = useCallback((schema: string) => {
    const inst = rfRef.current;
    const box = inst?.getNodes().find((n) => n.id === `schema:${schema}`);
    if (!inst || !box) return;
    const width = Number(box.style?.width ?? 0);
    const height = Number(box.style?.height ?? 0);
    if (!width || !height) return;
    void inst.fitBounds({ x: box.position.x, y: box.position.y, width, height }, { duration: 450, padding: 0.08 });
    syncZoomAfterRef.current(450);
  }, []);

  /** Re-read the viewport after a programmatic move (fitView / fitBounds never
   *  raise onMove), once its animation has landed. */
  const syncZoomAfterRef = useRef<(ms: number) => void>(() => {});
  const syncZoomAfter = useCallback((ms: number) => {
    const t = window.setTimeout(() => {
      const vp = rfRef.current?.getViewport();
      if (vp) applyZoom(vp.zoom);
    }, ms + 60);
    return () => window.clearTimeout(t);
  }, [applyZoom]);
  syncZoomAfterRef.current = syncZoomAfter;
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
    setShownPerSchema({});
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
  const [aggregates, setAggregates] = useState<Record<string, Aggregate>>({});
  const [joinTypes, setJoinTypes] = useState<Record<string, JoinType>>({});

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const rfRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);

  // Dragging a schema box moves every table in it: remember where the box and
  // its tables started, then offset them by the box's travel on each frame.
  const groupDrag = useRef<{ id: string; x: number; y: number; followers: Record<string, { x: number; y: number }> } | null>(null);
  const onNodeDragStart = useCallback(
    (_e: unknown, node: Node) => {
      if (!SCHEMA_NODE_TYPES.includes(node.type ?? "")) return;
      const schema = (node.data as unknown as { schema: string }).schema;
      // Everything that belongs to this schema moves with the grab — its
      // tables, the dashed backdrop and the zoomed-out name, whichever of the
      // two the user actually took hold of.
      const followers: Record<string, { x: number; y: number }> = {};
      for (const n of nodes) {
        if (n.id === node.id) continue;
        const mine =
          n.type === "table"
            ? (n.data as unknown as TableNodeData).table.schema === schema
            : SCHEMA_NODE_TYPES.includes(n.type ?? "") && (n.data as unknown as { schema: string }).schema === schema;
        if (mine) followers[n.id] = { ...n.position };
      }
      groupDrag.current = { id: node.id, x: node.position.x, y: node.position.y, followers };
    },
    [nodes],
  );
  const onNodeDrag = useCallback(
    (_e: unknown, node: Node) => {
      const start = groupDrag.current;
      if (!start || node.id !== start.id) return;
      const dx = node.position.x - start.x;
      const dy = node.position.y - start.y;
      setNodes((nds) =>
        nds.map((n) => {
          const from = start.followers[n.id];
          return from ? { ...n, position: { x: from.x + dx, y: from.y + dy } } : n;
        }),
      );
    },
    [setNodes],
  );
  const onNodeDragStop = useCallback(() => {
    groupDrag.current = null;
  }, []);

  const onSelect = useCallback((table: string, column?: string) => {
    setSel((prev) => (prev && prev.table === table && prev.column === column ? null : { table, column }));
  }, []);

  // Click a table → the viewport animates to frame it together with the
  // tables it joins (zoom derived from their bounds, never fixed); click the
  // empty canvas, press Escape, or click the same table again → back to the
  // whole schema. Column clicks inside the same table do not move the view.
  const selTable = sel?.table ?? null;
  // Bumped by the layout effect each time a new set of nodes is committed, so
  // "show everything" also runs after a schema switch, once the new nodes exist.
  const [layoutRev, setLayoutRev] = useState(0);
  // What the layout produced: the links between DRAWN tables, and how many
  // links exist between visible tables at all (pagination holds some back).
  const [drawableLinks, setDrawableLinks] = useState<{ links: (GraphLink & { inferred: boolean; score?: number })[]; eligible: number }>({ links: [], eligible: 0 });
  const toEdges = useCallback(
    (links: (GraphLink & { inferred: boolean; score?: number })[]): Edge[] =>
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
          score: l.score,
          active: false,
          inferred: l.inferred,
        } as unknown as Record<string, unknown>,
      })),
    [],
  );
  useEffect(() => {
    const inst = rfRef.current;
    if (!inst || nodes.length === 0) return;
    if (!selTable) {
      // React Flow measures the fresh nodes a frame after they mount.
      const t = window.setTimeout(() => void inst.fitView({ duration: 450, padding: 0.15 }), 60);
      const cancelSync = syncZoomAfter(60 + 450);
      return () => {
        window.clearTimeout(t);
        cancelSync();
      };
    }
    // Read live positions: a table may have been dragged since the layout.
    const rect = focusBounds(
      inst
        .getNodes()
        .filter((n) => n.type === "table")
        .map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, width: NODE_W, height: nodeHeight((n.data as unknown as TableNodeData).table) })),
      edges.map((e) => ({ source: e.source, target: e.target })),
      selTable,
    );
    if (!rect) return;
    void inst.fitBounds(rect, { duration: 450, padding: 0.2 });
    return syncZoomAfter(450);
    // A change of TABLE or a fresh layout moves the view; nodes/edges are read
    // at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selTable, layoutRev]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
    // A remembered selection wins; otherwise every schema (new schemas join
    // automatically until the user has narrowed).
    const apply = (entries: SchemaEntry[]) => {
      setSchemas(entries);
      const remembered = lastSelection.has(schemaKey) ? lastSelection.get(schemaKey)! : null;
      setSelected(remembered ? new Set(remembered.filter((n) => entries.some((e) => e.name === n))) : new Set(entries.map((e) => e.name)));
    };
    const cached = schemaCache.get(profileId);
    if (cached) {
      apply(cached);
      return;
    }
    ipc
      .getDatabaseOverview(profileId)
      .then((o) => {
        const entries: SchemaEntry[] = o.schemas.map((s) => ({
          name: s.name,
          source: s.isVirtual ? adapterForScript(s.adapterScript)?.name ?? "virtual" : undefined,
        }));
        schemaCache.set(profileId, entries);
        apply(entries);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [profileId, refreshTick]);

  const selectedList = useMemo(() => schemas.filter((s) => selected.has(s.name)).map((s) => s.name), [schemas, selected]);
  useEffect(() => {
    // Only a choice made with the list in hand is worth remembering — before
    // the schemas arrive the selection is empty for a different reason.
    if (schemas.length) lastSelection.set(schemaKey, selectedList);
    // 3. Everything the builder holds about a hidden schema goes with it: picks,
    //    aggregates, join types, and the WHERE group if any rule named it.
    const keep = (key: string) => selected.has(splitTableId(splitColKey(key).table).schema);
    setPicked((prev) => new Set([...prev].filter(keep)));
    setAggregates((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => keep(k))));
    setJoinTypes((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => { const [src, dst] = k.split(">"); return keep(src) && keep(dst); })));
    setWhere((prev) => (whereSchemas(prev).every((sc) => selected.has(sc)) ? prev : { combinator: "and", rules: [] }));
    const missing = selectedList.filter((name) => !graphCache.has(`${profileId}:${name}`));
    if (missing.length === 0) {
      setGraphs(Object.fromEntries(selectedList.map((name) => [name, graphCache.get(`${profileId}:${name}`)!])));
      setError(null);
      // A load may have been abandoned mid-flight by this very change of
      // selection: its `finally` is skipped (alive = false), so the pill is
      // ours to clear or it stays up forever.
      setLoadingNow(null);
      return;
    }
    let alive = true;
    setError(null);
    // ONE schema at a time, on purpose: the connection is a single websocket
    // session and concurrent statements on it hang or kill the driver (the
    // same trap the agent's DAG runner hit). Each schema shows up as soon as
    // its graph is in, so a big database fills in progressively.
    const publish = () =>
      setGraphs(Object.fromEntries(selectedList.flatMap((name) => (graphCache.has(`${profileId}:${name}`) ? [[name, graphCache.get(`${profileId}:${name}`)!]] : []))));
    (async () => {
      let firstError: string | null = null;
      for (const [i, name] of missing.entries()) {
        if (!alive) return;
        // Each schema times itself: "since 14:05:02 · 3.1s" is about THIS
        // schema, not about the batch that started five schemas ago.
        setLoadingNow({ schema: name, index: i + 1, total: missing.length, startedAt: Date.now() });
        try {
          graphCache.set(`${profileId}:${name}`, await ipc.getSchemaGraph(profileId, name));
        } catch (e) {
          firstError ??= errorMessage(e);
        }
        if (alive) publish();
      }
      if (alive && firstError) setError(firstError);
    })().finally(() => alive && setLoadingNow(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, selectedList.join("|"), refreshTick]);
  // One graph for the whole connection: SCHEMA.TABLE ids, links across schemas.
  const graph: ConnGraph | null = useMemo(() => {
    const parts = selectedList.flatMap((name) => (graphs[name] ? [{ schema: name, graph: graphs[name] }] : []));
    return parts.length ? mergeSchemaGraphs(parts) : null;
  }, [graphs, selectedList]);

  // Rebuild layout when the graph or filter changes.
  useEffect(() => {
    if (!graph) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const visible = graph.tables;
    const names = new Set(visible.map((t) => t.id));
    const declared = graph.links
      .filter((l) => names.has(l.source) && names.has(l.target) && l.source !== l.target)
      .map((l) => ({ ...l, inferred: false }));

    // Inferred relationships (no FK declared): scored, type-gated, ambiguity-
    // penalised — see infer-links.ts. Links under the confidence slider are
    // hidden and counted so the user knows they exist.
    let inferred: (GraphLink & { inferred: boolean; score?: number })[] = [];
    if (showInferred) {
      const all = inferLinks(visible, declared, { minScore: 0 });
      inferred = all.filter((l) => l.score >= minScore).map((l) => ({ source: l.source, sourceColumn: l.sourceColumn, target: l.target, targetColumn: l.targetColumn, inferred: true, score: l.score }));
      setHiddenInferred(all.length - inferred.length);
    } else {
      setHiddenInferred(0);
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
    // Pagination per box: a schema with 500 tables draws TABLE_PAGE of them
    // until the user asks for more — DOM stays bounded whatever the database.
    const perSchema = selectedList.map((name) => {
      const all = visible.filter((t) => t.schema === name);
      const shown = Math.min(all.length, shownPerSchema[name] ?? TABLE_PAGE);
      return { schema: name, tables: all.slice(0, shown), total: all.length };
    });
    const drawn = new Set(perSchema.flatMap((g) => g.tables.map((t) => t.id)));
    const layout = layoutSchemas(perSchema.map(({ schema, tables }) => ({ schema, tables })), NODE_W, nodeHeight, { groupGap: 170 });
    // Boxes are plain backdrop nodes and tables are absolutely positioned — no
    // sub-flow parent/child machinery (its measure→render loop killed the
    // renderer). The box only shows where a schema's tables were laid out.
    const groupNodes: Node[] = layout.groups.map((g) => {
      const info = perSchema.find((p) => p.schema === g.schema)!;
      return {
        id: `schema:${g.schema}`,
        type: "schemaGroup",
        position: { x: g.box.x, y: g.box.y },
        style: { width: g.box.width, height: g.box.height },
        // Drag the box by its title strip; its tables follow (onNodeDrag below).
        draggable: true,
        dragHandle: ".vs-box-handle",
        selectable: false,
        connectable: false,
        zIndex: -1,
        data: {
          schema: g.schema,
          onFocus: () => focusSchema(g.schema),
          source: schemas.find((sc) => sc.name === g.schema)?.source,
          shown: info.tables.length,
          total: info.total,
          onShowMore: () => setShownPerSchema((m) => ({ ...m, [g.schema]: (m[g.schema] ?? TABLE_PAGE) + TABLE_PAGE })),
          onShowAll: () => setShownPerSchema((m) => ({ ...m, [g.schema]: Number.MAX_SAFE_INTEGER })),
        } satisfies SchemaGroupData as unknown as Record<string, unknown>,
      };
    });
    // The zoomed-out schema name is a SEPARATE node stacked above the cards:
    // the dashed backdrop is zIndex -1, so a label inside it would be hidden
    // by the very cards it stands in for.
    const farNodes: Node[] = layout.groups.map((g) => {
      const info = perSchema.find((p) => p.schema === g.schema)!;
      return {
        id: `schemafar:${g.schema}`,
        type: "schemaFar",
        position: { x: g.box.x, y: g.box.y },
        style: { width: g.box.width, height: g.box.height },
        draggable: true,
        dragHandle: ".vs-box-far-label",
        selectable: false,
        connectable: false,
        zIndex: 5,
        data: {
          schema: g.schema,
          source: schemas.find((sc) => sc.name === g.schema)?.source,
          total: info.total,
          onFocus: () => focusSchema(g.schema),
          // A small schema gets a small name: a constant-size label on a
          // two-table box is wider than the box and lands on its neighbours.
          fontLimit: nameFontLimit(g.box.width, g.box.height, g.schema.length),
        } satisfies SchemaFarData as unknown as Record<string, unknown>,
      };
    });
    const tableNodes: Node[] = visible
      .filter((table) => drawn.has(table.id))
      .map((table) => ({
        id: table.id,
        type: "table",
        position: layout.absolute[table.id] ?? { x: 0, y: 0 },
        data: {
          table,
          sourceCols: sourceCols.get(table.id) ?? new Set(),
          targetCols: targetCols.get(table.id) ?? new Set(),
          onSelect,
          onPick,
        } satisfies TableNodeData as unknown as Record<string, unknown>,
      }));
    // The add-source box takes the next slot after the last schema box.
    const last = layout.groups[layout.groups.length - 1];
    const addNode: Node[] = onNewVs
      ? [{
          id: ADD_SOURCE_ID,
          type: "addSource",
          position: last ? { x: last.box.x + last.box.width + 120, y: last.box.y } : { x: 0, y: 0 },
          style: { width: 260, height: GROUP_HEADER + 56 + 60 },
          draggable: false,
          selectable: false,
          data: { onClick: onNewVs } as unknown as Record<string, unknown>,
        }]
      : [];
    setNodes([...groupNodes, ...tableNodes, ...farNodes, ...addNode]);
    setLayoutRev((r) => r + 1);
    // Only links between drawn tables can be drawn; the rest wait for "Show
    // more". Publishing them (rather than rendering here) leaves ONE place
    // that decides what is on screen — see the render plan below.
    setDrawableLinks({ links: links.filter((l) => drawn.has(l.source) && drawn.has(l.target)), eligible: links.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, showInferred, minScore, selectedList, schemas, shownPerSchema]);

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
      const ts = Math.max(fuzzyScore(searchTerm, t.name) ?? -1, fuzzyScore(searchTerm, t.id) ?? -1);
      if (ts >= 0) {
        results.push({ table: t.id, score: ts + 50 });
        tables.add(t.id);
      }
      for (const c of t.columns) {
        const cs = Math.max(fuzzyScore(searchTerm, c.name) ?? -1, fuzzyScore(searchTerm, `${t.name}.${c.name}`) ?? -1);
        if (cs >= 0) {
          results.push({ table: t.id, column: c.name, score: cs });
          tables.add(t.id);
          cols.add(colKey(t.id, c.name));
        }
      }
    }
    results.sort((a, b) => b.score - a.score);
    return { results: results.slice(0, 60), tables, cols };
  }, [graph, searchTerm]);

  // Select a table (and column): the selection effect above frames it.
  const jumpTo = useCallback((table: string, column?: string) => {
    // A table beyond the box's page cannot be framed: show its whole schema first.
    const { schema: sc } = splitTableId(table);
    setShownPerSchema((m) => ((m[sc] ?? TABLE_PAGE) === Number.MAX_SAFE_INTEGER ? m : { ...m, [sc]: Number.MAX_SAFE_INTEGER }));
    setSel({ table, column });
  }, []);

  // The AI's schema answers drive the diagram: a locate event highlights and
  // centers the named table/column instead of leaving the answer text-only.
  const pendingLocate = useRef<{ schema: string; table: string; column?: string } | null>(null);
  useEffect(() => {
    const onLocate = (e: Event) => {
      const d = (e as CustomEvent<{ schema?: string; table?: string; column?: string }>).detail;
      if (!d?.table) return;
      const wantSchema = (d.schema ?? selectedList[0] ?? "").toUpperCase();
      const wantTable = d.table.toUpperCase();
      // Names arrive from the AI in whatever case it wrote them; match what exists.
      const schemaEntry = schemas.find((sc) => sc.name.toUpperCase() === wantSchema);
      if (!schemaEntry) return;
      const known = graph?.tables.find((t) => t.schema === schemaEntry.name && t.name.toUpperCase() === wantTable);
      const column = known ? known.columns.find((c) => c.name.toUpperCase() === (d.column ?? "").toUpperCase())?.name : d.column;
      if (!selected.has(schemaEntry.name) || !known) {
        // The schema is hidden or its graph is not in yet: show it, jump later.
        pendingLocate.current = { schema: schemaEntry.name, table: wantTable, column };
        setSelected((prev) => new Set([...prev, schemaEntry.name]));
        return;
      }
      jumpTo(known.id, column);
    };
    window.addEventListener("studio:visualizer-locate", onLocate);
    return () => window.removeEventListener("studio:visualizer-locate", onLocate);
  }, [jumpTo, selected, selectedList, schemas, graph]);
  useEffect(() => {
    const pending = pendingLocate.current;
    if (!pending) return;
    const hit = graph?.tables.find((t) => t.schema === pending.schema && t.name.toUpperCase() === pending.table);
    if (!hit || !nodes.some((n) => n.id === hit.id)) return;
    pendingLocate.current = null;
    jumpTo(hit.id, hit.columns.find((c) => c.name.toUpperCase() === (pending.column ?? "").toUpperCase())?.name ?? pending.column);
  }, [nodes, graph, jumpTo]);

  // Reflect selection / mode / picked columns / matches into node & edge data.
  const diagramState: DiagramState = useMemo(
    () => ({ mode, selTable: sel?.table, selColumn: sel?.column, picked, matchedTables: matches.tables, matchedCols: matches.cols }),
    [mode, sel, picked, matches],
  );
  // The render plan: the only thing that puts edges on the canvas. It runs
  // for a new layout AND for a new selection, so narrowing survives a change
  // of inferred links, confidence or pagination.
  useEffect(() => {
    // A selection narrows what is drawn — picking a column is how you ask
    // where that column goes, and every other link on screen is in the way.
    const chosen = linksForSelection(drawableLinks.links, sel);
    // Over budget, the selected table's links join the drawn set; then mark
    // the ones the selection lights up.
    const budget = budgetLinks(chosen, sel?.table ?? null);
    // Everything that exists between visible tables but is not on screen,
    // whatever held it back: pagination, the selection, or the render limit.
    setBudgetHidden(Math.max(0, drawableLinks.eligible - budget.shown.length));
    setEdges(
      toEdges(budget.shown).map((e) => {
        const d = e.data as unknown as BeamEdgeData;
        return { ...e, data: { ...e.data, active: edgeIsActive(d, sel) } };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawableLinks, sel, mode, picked, matches]);

  const counts = useMemo(() => ({ tables: nodes.filter((n) => n.type === "table").length, edges: edges.length }), [nodes, edges]);
  const edgeRender = useMemo(() => ({ ...edgeStyle, dense: edges.length > DENSE_EDGES }), [edgeStyle, edges.length]);

  // react-querybuilder fields from involved (picked) tables, else all tables.
  const fields: Field[] = useMemo(() => {
    if (!graph) return [];
    const involved = new Set([...picked].map((k) => splitColKey(k).table));
    const tables = involved.size ? graph.tables.filter((t) => involved.has(t.id)) : graph.tables;
    return tables.flatMap((t) =>
      t.columns.map((c) => ({ name: `"${t.schema}"."${t.name}"."${c.name}"`, label: `${t.id}.${c.name}` })),
    );
  }, [graph, picked]);

  const generatedSql = useMemo(() => {
    if (!graph) return "";
    const whereSql = where.rules.length
      ? formatQuery(where, { format: "sql", quoteFieldNamesWith: ["", ""] as [string, string] })
      : "";
    return buildSql({ picked: [...picked], links: graph.links, whereSql, orderKey, orderDir, limit, aggregates, joinTypes });
  }, [graph, picked, where, orderKey, orderDir, limit, aggregates, joinTypes]);
  // The SQL pane follows the WHERE builder a beat behind the keystrokes.
  const [debouncedSql, setDebouncedSql] = useState(generatedSql);
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSql(generatedSql), 150);
    return () => window.clearTimeout(t);
  }, [generatedSql]);
  // An ORDER BY on a column that is no longer picked would name a table that
  // is not in FROM any more — drop it with the pick.
  useEffect(() => {
    if (orderKey && !picked.has(orderKey)) setOrderKey(null);
  }, [picked, orderKey]);
  // Links between the picked tables — the joins the SQL will use.
  const joinLinks = useMemo(() => {
    if (!graph) return [];
    const involved = new Set([...picked].map((k) => splitColKey(k).table));
    return graph.links.filter((l) => involved.has(l.source) && involved.has(l.target));
  }, [graph, picked]);

  const pickedFields: Field[] = useMemo(
    () => [...picked].map((k) => ({ name: k, label: k })),
    [picked],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <header className="flex h-11 shrink-0 items-center gap-3 overflow-x-auto border-b border-border px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex shrink-0 items-center gap-2">
          <Icon name="visualizer" className="h-4 w-4 text-[#a78bfa]" />
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={schemas.length === 0}
                data-agent-id="visualizer.schemas"
                className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-[11.5px] text-foreground hover:bg-secondary disabled:opacity-50"
              >
                <span>{selected.size === schemas.length ? "All schemas" : `${selected.size} of ${schemas.length} schemas`}</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 min-w-[240px] overflow-y-auto">
              <DropdownMenuItem onClick={() => setSelected(new Set(schemas.map((sc) => sc.name)))} className="text-[12px]">
                <Check className="h-3.5 w-3.5" /> Show all
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelected(new Set())} className="text-[12px]">
                <X className="h-3.5 w-3.5" /> Hide all
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {schemas.map((sc) => (
                <DropdownMenuCheckboxItem
                  key={sc.name}
                  checked={selected.has(sc.name)}
                  onCheckedChange={(on) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (on) next.add(sc.name);
                      else next.delete(sc.name);
                      return next;
                    })
                  }
                  onSelect={(e) => e.preventDefault()}
                  className="text-[12px]"
                >
                  <span className="flex items-center gap-1.5">
                    {sc.source ? <Waypoints className="h-3 w-3 text-teal" /> : null}
                    {sc.name}
                    {sc.source ? <span className="text-[10px] text-muted-foreground">{sc.source}</span> : null}
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
          {selectedList.length} schema{selectedList.length === 1 ? "" : "s"} · {counts.tables} tables · {counts.edges} links
          {linkSummary({
            hidden: budgetHidden,
            selection: sel ? (sel.column ? `${splitTableId(sel.table).table}.${sel.column}` : splitTableId(sel.table).table) : null,
          })}
        </span>
      </header>

      <div ref={paneRef} className="relative min-h-0 flex-1">
        {loadingNow ? (
          <div
            className="pointer-events-none absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-popover/95 px-3 py-1.5 font-mono text-[11px] text-muted-foreground shadow-lg"
            aria-live="polite"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span className="text-foreground">Loading {loadingNow.schema}</span>
            <span>· {loadingNow.index}/{loadingNow.total} schemas · since {formatClock(loadingNow.startedAt)} · {formatElapsed(loadElapsed)}</span>
          </div>
        ) : null}
        {error ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
            <div className="max-w-md rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-muted-foreground">{error}</div>
          </div>
        ) : null}
        {!loading && !error && nodes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <span>{selected.size === 0 ? "No schemas selected — pick some in the schema menu." : "No tables in the selected schemas yet."}</span>
            {onNewVs ? (
              <button onClick={onNewVs} className="flex items-center gap-1.5 rounded-md border border-teal/50 px-2.5 py-1 text-[12px] text-teal hover:bg-teal/10">
                <Plus className="h-3.5 w-3.5" /> Add a data source
              </button>
            ) : null}
          </div>
        ) : (
          <DiagramStateContext.Provider value={diagramState}>
          <EdgeStyleContext.Provider value={edgeRender}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onInit={(inst) => {
                rfRef.current = inst;
                // The mount-time fitView has already run: start in the right tier.
                syncZoomAfter(0);
              }}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onPaneClick={() => setSel(null)}
              onNodeDragStart={onNodeDragStart}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
              onMoveStart={beginGesture}
              onMove={(_e, vp) => applyZoom(vp.zoom)}
              onMoveEnd={(_e, vp) => {
                applyZoom(vp.zoom);
                endGesture();
              }}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              /* Far enough out that a whole warehouse fits as a map of boxes. */
              minZoom={0.04}
              proOptions={{ hideAttribution: true }}
              className="visualizer-pane"
            >
              {/* The built-in Fit View is another programmatic move: it raises
                  no onMove either, so the detail tier is re-read after it. */}
              <Controls className="!bottom-3 !left-3" showInteractive={false} onFitView={() => syncZoomAfter(450)} />
              <MiniMap pannable zoomable className="!right-3 !bottom-3" maskColor="color-mix(in srgb, var(--background) 55%, transparent)" nodeColor={(n) => (n.type === "table" ? edgeStyle.to : "transparent")} />
            </ReactFlow>
          </EdgeStyleContext.Provider>
          </DiagramStateContext.Provider>
        )}

        {/* Floating "add" — the same door as the box at the end of the row, always in view */}
        {onNewVs ? (
          <button
            onClick={onNewVs}
            data-agent-id="visualizer.add-source"
            title="Add a data source — attach another database or bucket as a virtual schema"
            className="absolute top-3 left-3 z-20 flex h-8 items-center gap-1.5 rounded-lg border border-border bg-popover px-2.5 text-[12px] font-medium text-foreground shadow-lg transition-colors hover:border-teal/50 hover:text-teal"
          >
            <Plus className="h-3.5 w-3.5" />
            <Waypoints className="h-3.5 w-3.5 text-teal" />
            Add data source
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
                        <span className="text-foreground">{m.column ?? splitTableId(m.table).table}</span>
                        <span className="ml-1.5 text-[10px] text-muted-foreground">{m.column ? m.table : splitTableId(m.table).schema}</span>
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
            <div className="absolute top-3 right-3 z-30 flex max-h-[calc(100%-1.5rem)] w-72 flex-col rounded-lg border border-border bg-popover p-3 shadow-2xl">
              <div className="mb-2 flex items-center justify-between">
                <span className="eyebrow-muted">Link style</span>
                <button onClick={() => setStylePanelOpen(false)} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid min-h-0 gap-2.5 overflow-y-auto [scrollbar-width:thin]">
                <ToggleRow label="Show links" checked={edgeStyle.show} onChange={(v) => setEdgeStyle((s) => ({ ...s, show: v }))} />
                <ToggleRow label="Animated pulse" checked={edgeStyle.pulse} onChange={(v) => setEdgeStyle((s) => ({ ...s, pulse: v }))} />
                <div>
                  <p className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Min confidence</span>
                    <span className="font-mono text-foreground">
                      {minScore.toFixed(1)}
                      {hiddenInferred ? <span className="text-muted-foreground"> · {hiddenInferred} hidden</span> : null}
                    </span>
                  </p>
                  <input
                    type="range"
                    min={0.3}
                    max={1}
                    step={0.1}
                    value={minScore}
                    onChange={(e) => setMinScore(Number(e.target.value))}
                    aria-label="Minimum confidence for inferred links"
                    className="w-full accent-primary"
                  />
                </div>
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
        <BuilderPane
          profileId={profileId}
          connectionName={connectionName}
          picked={picked}
          onUnpick={(k) => {
            const { table, column } = splitColKey(k);
            onPick(table, column);
          }}
          onClear={() => setPicked(new Set())}
          aggregates={aggregates}
          onAggregates={setAggregates}
          joinLinks={joinLinks}
          joinTypes={joinTypes}
          onJoinTypes={setJoinTypes}
          fields={fields}
          pickedFields={pickedFields}
          where={where}
          onWhere={setWhere}
          orderKey={orderKey}
          onOrderKey={setOrderKey}
          orderDir={orderDir}
          onOrderDir={setOrderDir}
          limit={limit}
          onLimit={setLimit}
          sql={generatedSql}
          displaySql={debouncedSql}
          onOpenSql={onOpenSql}
          rqbClassnames={RQB_CLASSNAMES}
          rqbTranslations={RQB_TRANSLATIONS}
        />
      ) : null}
    </div>
  );
}
