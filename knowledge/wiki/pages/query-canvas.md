---
title: Query canvas — the Visualizer's Build mode as a Panorama-style plane of boxes and arrows
category: architecture
type: feature+decision
updated: 2026-09-30
---

# The idea

Borrowed from exasol-labs/exasol-panorama and rebuilt in Studio's own design on
the pieces Studio already had (ReactFlow, Monaco, ECharts, the results grid,
CSV export, the Notebook's "ask the agent" pattern): **every box is a real
result set, every arrow says where it came from.** A table box, a SQL step
on other boxes, a chart on a box. Arrows are *derived* from the boxes'
`source` fields — they are never stored, so they can never lie.

Why not the form builder: it answered one question and forgot it.
Exploration branches; a canvas keeps the branches and their provenance, which
is what a person needs to verify a chart and what the agent needs to explain
one. Change: `openspec/changes/canvas-builder`.

# Where it lives

`apps/desktop/src/features/workbench/canvas/` (each file < 500 lines):

- `model.ts` (pure, tested) — `Box`, `CanvasDoc`, `placeBox` (flush right of
  the anchor, then below; explorer opens fill in reading order; never
  overlapping), `arrowsOf`, `dependantsOf`, `upstreamOf`, `compileSql` /
  `compilePagedSql` (placeholders `derived_table` / `source_n` → the table's
  qualified name or a CTE; flattened, dependency-ordered; cycles named),
  `lineage`, `rowsBehindSql`, `suggestViz`.
- `persist.ts` (tested) — `exa.canvas.<profileId>` in localStorage; tolerant
  decode, orphans dropped. Results are never saved.
- `store.ts` — one zustand store per canvas: doc, runs (paged, 500 rows a
  fetch, `more` flag), selections, undo/redo (50), stale propagation: running
  a step re-runs the steps built on it; charts read through their source.
- `Canvas.tsx` — ReactFlow board, explorer, toolbar (Ask, Fit, Undo, Redo,
  Clear), trail highlighting (one selected box lights `upstreamOf`, the rest
  dims), `studio:canvas-apply` + `exa.canvas.pending` for the agent's plan.
- Boxes: `TableBox`, `QueryBox` (Monaco, ⌘↵ runs, Esc back, editor hides
  below zoom 0.4), `ChartBox` (+ `ChartEditor`, `Evidence`), shared
  `BoxFrame` + `Halo` (new-box buttons on the right edge, act-on-box on top,
  close on the corner; missing capabilities greyed, not hidden).
- Assistant: `features/assistant/exa/canvas-plan.ts` (tested) parses the
  ```canvas fence; `canvas-plan-card.tsx` is the "Add to canvas" card;
  `plan-apply.ts` (tested) resolves names → ids and writes `describeCanvas`,
  the text the agent gets from the Ask button along with the selected box's
  trail (`lineageText`).

# Rules

- The database may be slow; the canvas never is — placeholders, never empty
  grids; errors inside the box.
- Rows behind a selection: `WHERE "field" IN (…) [OR "field" IS NULL]` on the
  chart's source, arrowed `≡` from the chart.
- Evidence = the trail (table → steps → mapping) + the compiled SQL the
  database actually ran, copyable as one text. This is the verification
  surface for people and the explanation surface for the agent.

# Gotchas met

- A ReactFlow node inside a custom scheme cannot take props: the store goes
  through context (`useCanvas`), Monaco setup through `EditorSetupContext`.
- `derived_table` replacement is a word-boundary regex over the step's SQL —
  a column literally named `derived_table` would be rewritten too; accepted.
- react-querybuilder left with the form builder; `build-sql.ts` stays for the
  object context menu.
