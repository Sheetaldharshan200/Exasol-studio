# Design

## Where it lives

`apps/desktop/src/features/workbench/canvas/`, mounted by `Visualizer.tsx`
when `mode === "build"`. Each file stays under ~500 lines; pure logic is
separate and tested.

- `model.ts` — the document and every decision that needs no DOM:
  `Box` (`table` | `query` | `chart`), `CanvasDoc {version, boxes}`, box
  sizes, `placeBox` (flush right of the anchor, else the next free slot in
  reading order; never overlapping), `arrowsOf(doc)` (derived, not stored),
  `compileSql(box, byId)` (CTE chain; `derived_table` and named sources),
  `lineage(boxId, byId)`, `rowsBehindSql(chart, selection)`, identifier
  quoting. `model.test.ts`.
- `persist.ts` — encode/decode/validate of the stored document (localStorage
  key `exa.canvas.<profileId>`), tolerant of unknown boxes. Tested.
- `store.ts` — one zustand store per canvas instance: document, runtime
  results per box (never persisted), chart selections, undo/redo snapshots
  (cap 50), and actions. Running a box calls `ipc.executeSql(profileId,
  connectionName, compiled, 500, false, false, progressId)`; a step's
  dependants are marked stale and re-run.
- `Canvas.tsx` — ReactFlow with `nodeTypes` `{table, query, chart}` and the
  `provenance` edge; `minZoom 0.05`, `maxZoom 4`, `panOnDrag`,
  `zoomOnScroll` off unless ctrl/⌘ (matching the diagram and Panorama);
  Controls; toolbar (Ask, Fit, Undo, Redo, Clear); listens for
  `studio:canvas-apply`.
- `ExplorerPanel.tsx` — connection picker (open connections), schemas from
  `ipc.getDatabaseOverview`, tables/views from `ipc.listSchemaObjects`,
  filter; click → `openTable`.
- `TableBox.tsx`, `QueryBox.tsx`, `ChartBox.tsx`, `ChartEditor.tsx`,
  `Halo.tsx`, `ProvenanceEdge.tsx` — the nodes. Grids use `ResultsGrid`
  (`hideToolbar`, small font); charts use `buildChartOption` with the
  `CellViz` shape the Notebook already uses, so a chart made here reads the
  same as one in a notebook; CSV uses `toCsv`; PNG uses ECharts' `getDataURL`.
- `features/assistant/exa/canvas-plan.ts` (+ test) parses the ```canvas
  fence: `{ boxes: [{ kind: "query", name, sql, source? }, { kind: "chart",
  name, source, chart, xField, yFields }] }`; `canvas-plan-card.tsx` renders
  it and dispatches `studio:canvas-apply`. The fence is taught where the
  notebook fence is taught.

## Rules borrowed from Panorama, adapted

- One entity, three sources: a stored table, a SQL step, a chart. Arrows are
  derived from `source` fields, so they can never disagree with the boxes.
- New boxes go flush right of the anchor with a 48px gap; boxes opened from
  the explorer fill in reading order. Nothing overlaps.
- The database may be slow; the canvas never is. A box waiting for rows shows
  a placeholder, never an empty grid.
- Editors step aside when the box is too small to type in: below zoom 0.4
  the query box shows its SQL as text and the chart editor collapses.
- ⌘↵ runs. Esc returns to the result.

## What is removed

`visualizer/BuilderPane.tsx` and the builder state in `Visualizer.tsx`
(aggregates, join types, where, order, limit, generated SQL, debounce).
`build-sql.ts` stays: `ObjectContextMenu` uses it. `query-builder-style.ts`
goes if nothing else imports it.
