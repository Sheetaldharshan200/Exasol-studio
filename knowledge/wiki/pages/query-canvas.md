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
- `derived_table` replacement is SQL-aware (`replaceIdentifier`): string
  literals, quoted identifiers and comments are left alone; only a bare
  identifier token is rewritten. Codex caught the earlier regex version.
- react-querybuilder left with the form builder; `build-sql.ts` stays for the
  object context menu.

# Codex review (2026-09-30), all fixed

Rows behind a chart of a *table* read the table (the step's source is the
chart; `dataSourceOf` reads through); a stale run cannot overwrite a newer one
(`progressId` checked before commit); a step on sources from two connections
is refused by name; selecting marks no longer rebuilds the chart (handler in a
ref) and sorted series (pie, funnel) report the drawn *name*, not the index;
the by-field matches case-insensitively; an empty chart keeps its surface so
later rows draw; loading a page reads through to charts and marks steps
stale; the trail dims arrows too; typing in a step is one undo step, moves
and resizes are remembered; a restored canvas offers Run / Run all; a plan
taken live is not replayed; explorer answers for a switched connection are
dropped.

# Second Codex pass (2026-09-30), all fixed

Run tokens carry a sequence number (two runs in one millisecond were
indistinguishable); a superseded run no longer re-runs the boxes below it;
paging reads through to each chart's *own* source; the shared chart builder
matches field names case-insensitively (a quoted lower-case column fell back
to the first column); a NULL pie slice filters `IS NULL`, and only pie, donut
and funnel picks are read by name; Undo and Redo end a typing session; the
explorer keeps only the latest request per schema.

