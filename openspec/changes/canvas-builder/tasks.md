# Tasks

## 1. Model (pure, tested)
- [x] `canvas/model.ts` + `model.test.ts`: boxes, placement, arrows, compileSql, lineage, rowsBehindSql, quoting.
- [x] `canvas/persist.ts` + test.

## 2. Store and canvas
- [x] `canvas/store.ts`: document, results, selections, undo/redo, run with stale propagation.
- [x] `canvas/Canvas.tsx`, `ProvenanceEdge.tsx`, `Halo.tsx`.

## 3. Boxes
- [x] `TableBox.tsx` (paging, export, halo), `QueryBox.tsx` (Monaco, run, result, edit/back), `ChartBox.tsx` + `ChartEditor.tsx` (edit, selection, rows behind, evidence, export).

## 4. Explorer and shell
- [x] `ExplorerPanel.tsx`: connection picker, schemas, tables/views, filter.
- [x] `Visualizer.tsx`: Build mode mounts the canvas; BuilderPane and its state removed; picked diagram tables can be added to the canvas.

## 5. Agent
- [x] `canvas-plan.ts` + test, `canvas-plan-card.tsx`, fence routing, `studio:canvas-apply`; the fence taught beside the notebook fence; Ask button with canvas context.

## 6. Review
- [ ] tsc, desktop tests, Codex review, wiki page, build.
