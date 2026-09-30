// One canvas's live state: the document (saved), what each box has fetched
// (never saved), chart selections, and undo/redo. Every mutation is a plain
// function of the document, so the React nodes stay thin.

import { createStore, type StoreApi } from "zustand";
import { ipc, type StatementResult } from "@/lib/ipc";
import type { CellViz } from "@/features/workbench/notebook-cell";
import {
  EMPTY_DOC,
  SIZES,
  byId,
  compilePagedSql,
  dependantsOf,
  newId,
  placeBox,
  rowsBehindSql,
  seedSql,
  suggestViz,
  type Box,
  type CanvasDoc,
  type ChartBox,
  type Rect,
} from "./model.ts";
import { loadDoc, saveDoc } from "./persist.ts";

/** Rows per fetch. Boxes grow by pages; the database is never asked for everything. */
export const PAGE = 500;
const HISTORY = 50;

export type RunState = {
  status: "idle" | "running" | "ok" | "error";
  /** Rows so far — appended page by page. */
  result?: StatementResult;
  error?: string;
  elapsedMs?: number;
  /** The rows fetched so far; the next page starts here. */
  loaded: number;
  /** The last row fetched filled the page: more may exist. */
  more: boolean;
  /** A source ran again since these rows were fetched. */
  stale?: boolean;
  progressId?: string;
};

export type Selection = { field: string; values: unknown[] };

export type Conn = { profileId: string; connectionName: string };

export type CanvasState = {
  conn: Conn;
  doc: CanvasDoc;
  runs: Record<string, RunState>;
  selections: Record<string, Selection>;
  /** The visible area in canvas units, kept by the ReactFlow viewport. */
  viewport: Rect;
  past: CanvasDoc[];
  future: CanvasDoc[];
  setViewport: (r: Rect) => void;
  openTable: (t: { schema: string; table: string; rowCount?: number | null }, conn?: Conn) => string;
  addQuery: (sources: string[], opts?: { sql?: string; name?: string; rowsBehind?: boolean; id?: string }) => string;
  addChart: (source: string, opts?: { chart?: string; viz?: CellViz; name?: string; id?: string }) => string;
  setSql: (id: string, sql: string) => void;
  setName: (id: string, name: string) => void;
  setViz: (id: string, chart: string, viz: CellViz) => void;
  moveBox: (id: string, x: number, y: number) => void;
  resizeBox: (id: string, w: number, h: number) => void;
  removeBox: (id: string) => void;
  clear: () => void;
  undo: () => void;
  redo: () => void;
  run: (id: string) => Promise<void>;
  /** Every table and step that has no rows yet, e.g. after a restart. */
  runAll: () => Promise<void>;
  loadMore: (id: string) => Promise<void>;
  setSelection: (id: string, sel: Selection | null) => void;
  /** The rows behind a chart's selection, as a new step arrowed from the chart. */
  showRowsBehind: (chartId: string) => string | null;
};

export type CanvasStore = StoreApi<CanvasState>;

function nextName(doc: CanvasDoc, base: string): string {
  const taken = new Set(doc.boxes.map((b) => (b.kind === "table" ? `${b.schema}.${b.table}` : b.name)));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`;
}

export function createCanvasStore(conn: Conn): CanvasStore {
  return createStore<CanvasState>()((set, get) => {
    /** A structural change: remembered for undo, saved, and redo forgotten. */
    const commit = (next: CanvasDoc) => {
      const { doc, past } = get();
      set({ doc: next, past: [...past.slice(-(HISTORY - 1)), doc], future: [] });
      saveDoc(conn.profileId, next);
    };
    const patchBox = (id: string, patch: (b: Box) => Box, remember = true) => {
      const doc = get().doc;
      const next = { ...doc, boxes: doc.boxes.map((b) => (b.id === id ? patch(b) : b)) };
      if (remember) commit(next);
      else {
        set({ doc: next });
        saveDoc(conn.profileId, next);
      }
    };
    // Typing in a step is one undo step: the document before the first
    // keystroke is remembered once, until the step runs or something else commits.
    const editing = new Set<string>();
    const markStale = (ids: string[]) =>
      set((s) => ({ runs: Object.fromEntries(Object.entries(s.runs).map(([k, v]) => [k, ids.includes(k) ? { ...v, stale: true } : v])) }));

    const fetchPage = async (id: string, offset: number) => {
      const state = get();
      const box = byId(state.doc).get(id);
      if (!box) return;
      let sql: string;
      try {
        sql = compilePagedSql(box, byId(state.doc), PAGE, offset);
      } catch (e) {
        set((s) => ({ runs: { ...s.runs, [id]: { status: "error", error: e instanceof Error ? e.message : String(e), loaded: 0, more: false } } }));
        return;
      }
      const progressId = `canvas-${id}-${Date.now()}`;
      const prev = state.runs[id];
      set((s) => ({ runs: { ...s.runs, [id]: { ...(offset > 0 && prev ? prev : { loaded: 0, more: false }), status: "running", progressId, stale: false } } }));
      const started = performance.now();
      // A run started later wins: an older answer arriving afterwards is dropped.
      const current = () => get().runs[id]?.progressId === progressId;
      try {
        const res = await ipc.executeSql(box.profileId, box.connectionName, sql, PAGE, false, false, progressId);
        if (!current()) return;
        const r = res.results[0];
        if (!r) throw new Error("The database returned nothing.");
        if (r.error) throw new Error(r.error);
        const rows = r.rows ?? [];
        const merged: StatementResult = offset > 0 && prev?.result ? { ...r, rows: [...prev.result.rows, ...rows], rowCount: prev.result.rows.length + rows.length } : { ...r, rowCount: rows.length };
        set((s) => ({
          runs: {
            ...s.runs,
            [id]: { status: "ok", result: merged, loaded: offset + rows.length, more: rows.length >= PAGE, elapsedMs: Math.round(performance.now() - started), stale: false },
          },
        }));
      } catch (e) {
        if (!current()) return;
        set((s) => ({ runs: { ...s.runs, [id]: { ...(s.runs[id] ?? { loaded: 0, more: false }), status: "error", error: e instanceof Error ? e.message : String(e) } } }));
      }
    };
    /** Charts built on `id` read its rows again; steps built on it are marked stale. */
    const readThrough = (id: string) => {
      const doc = get().doc;
      const boxes = byId(doc);
      const below = dependantsOf(doc, id);
      const src = get().runs[id];
      set((s) => ({
        runs: Object.fromEntries(
          Object.entries(s.runs).map(([k, v]) => {
            if (!below.includes(k)) return [k, v];
            const b = boxes.get(k);
            return b?.kind === "chart" && src ? [k, { ...src, stale: false }] : [k, { ...v, stale: true }];
          }),
        ),
      }));
    };

    return {
      conn,
      doc: loadDoc(conn.profileId),
      runs: {},
      selections: {},
      viewport: { x: 0, y: 0, w: 1600, h: 900 },
      past: [],
      future: [],
      setViewport: (viewport) => set({ viewport }),

      openTable: (t, c = conn) => {
        const { doc, viewport } = get();
        const id = newId("t");
        const rect = { ...placeBox(doc.boxes, SIZES.table, { viewport }), ...SIZES.table };
        commit({ ...doc, boxes: [...doc.boxes, { id, kind: "table", ...c, schema: t.schema, table: t.table, rowCount: t.rowCount ?? undefined, rect }] });
        void get().run(id);
        return id;
      },

      addQuery: (sources, opts = {}) => {
        const { doc, viewport } = get();
        const boxes = byId(doc);
        const anchor = boxes.get(sources[0] ?? "")?.rect;
        const first = boxes.get(sources[0] ?? "");
        const c: Conn = first ? { profileId: first.profileId, connectionName: first.connectionName } : conn;
        const id = opts.id ?? newId("q");
        const rect = { ...placeBox(doc.boxes, SIZES.query, { anchor, viewport }), ...SIZES.query };
        const name = nextName(doc, opts.name ?? (opts.rowsBehind ? "Rows behind selection" : "Step"));
        const box: Box = { id, kind: "query", ...c, name, sql: opts.sql ?? seedSql(sources.length), sources, rect, ...(opts.rowsBehind ? { rowsBehind: true } : {}) };
        commit({ ...doc, boxes: [...doc.boxes, box] });
        if (opts.sql) void get().run(id);
        return id;
      },

      addChart: (source, opts = {}) => {
        const { doc, viewport, runs } = get();
        const src = byId(doc).get(source);
        if (!src) return "";
        const id = opts.id ?? newId("c");
        const rect = { ...placeBox(doc.boxes, SIZES.chart, { anchor: src.rect, viewport }), ...SIZES.chart };
        const cols = runs[source]?.result?.columns ?? [];
        const guess = suggestViz(cols);
        const box: ChartBox = {
          id,
          kind: "chart",
          profileId: src.profileId,
          connectionName: src.connectionName,
          name: nextName(doc, opts.name ?? "Chart"),
          source,
          chart: opts.chart ?? guess.chart,
          viz: opts.viz ?? guess.viz,
          rect,
        };
        commit({ ...doc, boxes: [...doc.boxes, box] });
        if (runs[source]?.result) set((s) => ({ runs: { ...s.runs, [id]: { ...s.runs[source], stale: false } } }));
        else void get().run(id);
        return id;
      },

      setSql: (id, sql) => {
        if (!editing.has(id)) {
          editing.add(id);
          const { doc, past } = get();
          set({ past: [...past.slice(-(HISTORY - 1)), doc], future: [] });
        }
        patchBox(id, (b) => (b.kind === "query" ? { ...b, sql } : b), false);
      },
      setName: (id, name) => patchBox(id, (b) => (b.kind === "table" ? b : { ...b, name })),
      setViz: (id, chart, viz) => patchBox(id, (b) => (b.kind === "chart" ? { ...b, chart, viz } : b)),
      moveBox: (id, x, y) => {
        const b = byId(get().doc).get(id);
        if (b && b.rect.x === x && b.rect.y === y) return;
        patchBox(id, (b) => ({ ...b, rect: { ...b.rect, x, y } }));
      },
      resizeBox: (id, w, h) => patchBox(id, (b) => ({ ...b, rect: { ...b.rect, w: Math.max(240, w), h: Math.max(160, h) } })),

      removeBox: (id) => {
        const doc = get().doc;
        const gone = new Set([id, ...dependantsOf(doc, id)]);
        commit({ ...doc, boxes: doc.boxes.filter((b) => !gone.has(b.id)) });
        set((s) => ({
          runs: Object.fromEntries(Object.entries(s.runs).filter(([k]) => !gone.has(k))),
          selections: Object.fromEntries(Object.entries(s.selections).filter(([k]) => !gone.has(k))),
        }));
      },
      clear: () => {
        commit(EMPTY_DOC);
        set({ runs: {}, selections: {} });
      },
      undo: () => {
        const { past, doc, future } = get();
        const prev = past[past.length - 1];
        if (!prev) return;
        set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future] });
        saveDoc(conn.profileId, prev);
      },
      redo: () => {
        const { past, doc, future } = get();
        const next = future[0];
        if (!next) return;
        set({ doc: next, past: [...past, doc], future: future.slice(1) });
        saveDoc(conn.profileId, next);
      },

      run: async (id) => {
        editing.delete(id);
        const doc = get().doc;
        const box = byId(doc).get(id);
        if (!box) return;
        if (box.kind === "chart") {
          // A chart draws its source's rows: run the source, then read through.
          await get().run(box.source);
          const src = get().runs[box.source];
          if (src) set((s) => ({ runs: { ...s.runs, [id]: { ...src, stale: false } } }));
          return;
        }
        await fetchPage(id, 0);
        const below = dependantsOf(doc, id);
        markStale(below);
        // Steps below re-run on their own; charts read through their source.
        for (const d of below) {
          const b = byId(get().doc).get(d);
          if (b?.kind === "query") await fetchPage(d, 0);
          else if (b?.kind === "chart") {
            const src = get().runs[b.source];
            if (src) set((s) => ({ runs: { ...s.runs, [d]: { ...src, stale: false } } }));
          }
        }
      },

      runAll: async () => {
        const { doc, runs } = get();
        const pending = doc.boxes.filter((b) => b.kind !== "chart" && (!runs[b.id] || runs[b.id]?.status === "idle"));
        await Promise.all(pending.map((b) => get().run(b.id)));
      },

      loadMore: async (id) => {
        const run = get().runs[id];
        if (!run || run.status === "running" || !run.more) return;
        await fetchPage(id, run.loaded);
        readThrough(id);
      },

      setSelection: (id, sel) =>
        set((s) => {
          const selections = { ...s.selections };
          if (sel && sel.values.length) selections[id] = sel;
          else delete selections[id];
          return { selections };
        }),

      showRowsBehind: (chartId) => {
        const { doc, selections } = get();
        const chart = byId(doc).get(chartId);
        const sel = selections[chartId];
        if (!chart || chart.kind !== "chart" || !sel) return null;
        // The step reads the chart's source rows; the arrow comes from the chart,
        // which is what the person pointed at.
        const id = get().addQuery([chartId], { sql: rowsBehindSql(sel.field, sel.values), rowsBehind: true, name: `Rows behind ${chart.name}` });
        return id;
      },
    };
  });
}

