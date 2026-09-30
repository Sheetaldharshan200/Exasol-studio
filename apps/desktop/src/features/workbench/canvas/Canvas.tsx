// The canvas: boxes on an infinite plane, arrows between them, the explorer
// at its side. Selecting a box lights up the trail it was built from.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { Eraser, Maximize2, Play, Plus, Redo2, Undo2 } from "lucide-react";
import { AgentMark } from "@/components/studio/AgentMark";
import { askExa } from "@/features/assistant/exa/ask-exa";
import type { CanvasPlan } from "@/features/assistant/exa/canvas-plan.ts";
import { cn } from "@/lib/utils";
import { ChartBoxNode } from "./ChartBox.tsx";
import { CanvasStoreContext, EditorSetupContext, useCanvas, useCanvasStore, type EditorSetup } from "./context.ts";
import { lineageText } from "./Evidence.tsx";
import { ExplorerPanel } from "./ExplorerPanel.tsx";
import { PROVENANCE_EDGE, ProvenanceEdge } from "./ProvenanceEdge.tsx";
import { QueryBoxNode } from "./QueryBox.tsx";
import { TableBoxNode } from "./TableBox.tsx";
import { arrowsOf, byId, compileSql, lineage, newId, upstreamOf, type Box, type CanvasDoc } from "./model.ts";
import { describeCanvas, resolvePlan } from "./plan-apply.ts";
import { createCanvasStore, type CanvasStore, type Conn } from "./store.ts";

export const CANVAS_APPLY_EVENT = "studio:canvas-apply";
export const CANVAS_PENDING_KEY = "exa.canvas.pending";

const nodeTypes = { table: TableBoxNode, query: QueryBoxNode, chart: ChartBoxNode };
const edgeTypes = { [PROVENANCE_EDGE]: ProvenanceEdge };

/** Nodes for the document's boxes, keeping what ReactFlow tracks (selection, drag). */
export function reconcileNodes(prev: Node[], boxes: Box[]): Node[] {
  const byPrev = new Map(prev.map((n) => [n.id, n]));
  return boxes.map((b) => {
    const old = byPrev.get(b.id);
    const position = old?.dragging ? old.position : { x: b.rect.x, y: b.rect.y };
    return { id: b.id, type: b.kind, position, data: {}, style: { width: b.rect.w, height: b.rect.h }, selected: old?.selected ?? false, dragging: old?.dragging };
  });
}

export function edgesFor(doc: CanvasDoc, trail: Set<string> | null): Edge[] {
  return arrowsOf(doc).map((a) => {
    const lit = !trail || (trail.has(a.from) && trail.has(a.to));
    return {
      id: a.id,
      source: a.from,
      target: a.to,
      type: PROVENANCE_EDGE,
      data: { kind: a.kind },
      animated: !!trail && lit,
      style: { opacity: lit ? 1 : 0.25 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "var(--primary)", width: 14, height: 14 },
    };
  });
}

export function Canvas({ conn, editor, pickedTables, onPickedOpened }: { conn: Conn; editor: EditorSetup; pickedTables?: { schema: string; table: string }[]; onPickedOpened?: () => void }) {
  const store = useMemo(() => createCanvasStore(conn), [conn.profileId, conn.connectionName]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <CanvasStoreContext.Provider value={store}>
      <EditorSetupContext.Provider value={editor}>
        <ReactFlowProvider>
          <div className="flex h-full min-h-0">
            <ExplorerPanel conn={conn} />
            <Board store={store} pickedTables={pickedTables} onPickedOpened={onPickedOpened} />
          </div>
        </ReactFlowProvider>
      </EditorSetupContext.Provider>
    </CanvasStoreContext.Provider>
  );
}

function Board({ store, pickedTables, onPickedOpened }: { store: CanvasStore; pickedTables?: { schema: string; table: string }[]; onPickedOpened?: () => void }) {
  const doc = useCanvas((s) => s.doc);
  const conn = useCanvas((s) => s.conn);
  const canUndo = useCanvas((s) => s.past.length > 0);
  const canRedo = useCanvas((s) => s.future.length > 0);
  // Boxes with no rows yet — a restored canvas starts this way.
  const unrun = useCanvas((s) => s.doc.boxes.filter((b) => b.kind !== "chart" && (!s.runs[b.id] || s.runs[b.id]?.status === "idle")).length);
  const [nodes, setNodes] = useState<Node[]>(() => reconcileNodes([], doc.boxes));
  const flow = useReactFlow();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => setNodes((prev) => reconcileNodes(prev, doc.boxes)), [doc.boxes]);

  const selectedIds = useMemo(() => nodes.filter((n) => n.selected).map((n) => n.id), [nodes]);
  // One selected box lights the trail it came from; the rest steps back.
  const trail = useMemo(() => (selectedIds.length === 1 ? upstreamOf(doc, selectedIds[0]) : null), [doc, selectedIds]);
  const edges = useMemo(() => edgesFor(doc, trail), [doc, trail]);
  const shownNodes = useMemo(() => (trail ? nodes.map((n) => ({ ...n, className: trail.has(n.id) ? undefined : "opacity-40 transition-opacity" })) : nodes), [nodes, trail]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((prev) => applyNodeChanges(changes, prev));
      for (const c of changes) {
        if (c.type === "position" && c.position && c.dragging === false) store.getState().moveBox(c.id, c.position.x, c.position.y);
        if (c.type === "remove") store.getState().removeBox(c.id);
      }
    },
    [store],
  );

  const rememberViewport = useCallback(() => {
    const v = flow.getViewport();
    const el = wrap.current;
    if (!el) return;
    store.getState().setViewport({ x: -v.x / v.zoom, y: -v.y / v.zoom, w: el.clientWidth / v.zoom, h: el.clientHeight / v.zoom });
  }, [flow, store]);
  useEffect(() => {
    rememberViewport();
  }, [rememberViewport]);

  // Tables picked in the diagram come over as boxes when this mode opens.
  useEffect(() => {
    if (!pickedTables?.length) return;
    const have = new Set(doc.boxes.filter((b) => b.kind === "table").map((b) => `${b.schema}.${b.table}`));
    for (const t of pickedTables) if (!have.has(`${t.schema}.${t.table}`)) store.getState().openTable(t);
    onPickedOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedTables]);

  // The agent's plan: from the card in the assistant, or left for us before this mode opened.
  const applyPlan = useCallback(
    (plan: CanvasPlan): string[] => {
      const s = store.getState();
      const { steps, errors } = resolvePlan(plan, s.doc, (kind) => newId(kind === "query" ? "q" : "c"));
      for (const st of steps) {
        if (st.kind === "query") s.addQuery(st.sources, { id: st.id, name: st.name, sql: st.sql });
        else s.addChart(st.source, { id: st.id, name: st.name, chart: st.chart, viz: { xField: st.xField, yFields: st.yFields, stacked: st.stacked } });
      }
      window.setTimeout(() => void flow.fitView({ duration: 400, padding: 0.15 }), 80);
      return errors;
    },
    [store, flow],
  );
  useEffect(() => {
    const onApply = (e: Event) => {
      const plan = (e as CustomEvent<{ plan: CanvasPlan; profileId?: string }>).detail?.plan;
      if (plan) {
        // Taken now: the copy left for a canvas that was not open is not needed.
        try {
          sessionStorage.removeItem(CANVAS_PENDING_KEY);
        } catch {
          /* nothing to clear */
        }
        const errors = applyPlan(plan);
        if (errors.length) window.dispatchEvent(new CustomEvent("studio:notice", { detail: { kind: "warning", title: "Some boxes could not be added", body: errors.join(" ") } }));
      }
    };
    window.addEventListener(CANVAS_APPLY_EVENT, onApply);
    try {
      const pending = sessionStorage.getItem(CANVAS_PENDING_KEY);
      if (pending) {
        sessionStorage.removeItem(CANVAS_PENDING_KEY);
        applyPlan(JSON.parse(pending) as CanvasPlan);
      }
    } catch {
      /* nothing pending */
    }
    return () => window.removeEventListener(CANVAS_APPLY_EVENT, onApply);
  }, [applyPlan]);

  const ask = () => {
    const boxes = byId(doc);
    const parts = [describeCanvas(doc, conn.connectionName)];
    if (selectedIds.length === 1) {
      const b = boxes.get(selectedIds[0]);
      if (b) {
        let compiled: string | null = null;
        try {
          compiled = compileSql(b, boxes);
        } catch {
          compiled = null;
        }
        parts.push(`Selected box "${b.kind === "table" ? `${b.schema}.${b.table}` : b.name}" — how it was made:\n${lineageText(lineage(b.id, boxes), compiled)}`);
      }
    }
    parts.push("Answer about this canvas: explain how a result was reached from its trail when asked, verify the SQL, and when asked to add a step or a chart, finish with a ```canvas fence so it lands on the canvas.");
    askExa(parts.join("\n\n"), { send: false });
  };

  const button = (label: string, onClick: () => void, disabled: boolean, child: React.ReactNode) => (
    <button key={label} onClick={onClick} disabled={disabled} title={label} aria-label={label} className="flex h-7 items-center gap-1 rounded-md border border-border bg-panel px-2 text-[11px] text-foreground shadow-sm hover:bg-secondary disabled:opacity-40">
      {child}
    </button>
  );

  return (
    <div ref={wrap} className="relative min-w-0 flex-1">
      <ReactFlow
        nodes={shownNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onMoveEnd={rememberViewport}
        minZoom={0.05}
        maxZoom={4}
        panOnDrag
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        zoomActivationKeyCode={["Meta", "Control"]}
        selectionOnDrag={false}
        nodesConnectable={false}
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
        fitView={doc.boxes.length > 0}
        className="bg-editor"
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={1.2} color="color-mix(in srgb, var(--border) 70%, transparent)" />
        <Controls showInteractive={false} className="!bottom-3 !left-3" />
      </ReactFlow>
      <div className="pointer-events-none absolute left-3 right-3 top-3 flex items-start gap-2">
        <div className="pointer-events-auto flex items-center gap-1.5">
          {button("Ask Exa about this canvas", ask, false, <><AgentMark className="h-3.5 w-3.5" /> Ask</>)}
          {unrun ? button(`Run the ${unrun} box${unrun === 1 ? "" : "es"} without rows`, () => void store.getState().runAll(), false, <><Play className="h-3.5 w-3.5" /> Run all</>) : null}
          {button("Fit everything in view", () => void flow.fitView({ duration: 400, padding: 0.15 }), !doc.boxes.length, <Maximize2 className="h-3.5 w-3.5" />)}
          {button("Undo", () => store.getState().undo(), !canUndo, <Undo2 className="h-3.5 w-3.5" />)}
          {button("Redo", () => store.getState().redo(), !canRedo, <Redo2 className="h-3.5 w-3.5" />)}
          {button("Clear the canvas", () => window.confirm("Remove every box from this canvas? Undo brings them back.") && store.getState().clear(), !doc.boxes.length, <Eraser className="h-3.5 w-3.5" />)}
        </div>
        <div className={cn("pointer-events-none ml-auto rounded-md border border-border bg-panel/80 px-2 py-1 text-[10.5px] text-muted-foreground shadow-sm", trail && "border-primary/50 text-primary")}>
          {trail ? `Trail: ${trail.size} box${trail.size === 1 ? "" : "es"} behind the selection` : `${doc.boxes.length} box${doc.boxes.length === 1 ? "" : "es"} · drag to pan · ⌘/Ctrl + wheel to zoom`}
        </div>
      </div>
      {!doc.boxes.length ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="max-w-md rounded-xl border border-dashed border-border bg-panel/70 p-6 text-center text-[12.5px] text-muted-foreground">
            <Plus className="mx-auto mb-2 h-5 w-5 text-primary" />
            <p className="text-foreground">Every box is a real result set. Every arrow is where it came from.</p>
            <p className="mt-1.5">Click a table in the explorer to put it here. Then query it, chart it, and follow the rows behind any mark — the trail stays.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
