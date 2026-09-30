# Canvas: the Visualizer's Build mode becomes a Panorama-style query canvas

## Why

The Visualizer's Build mode is a form: pick columns, add a WHERE, get one SQL
statement. It answers one question and then it is gone. Exploration does not
work that way — it branches. You look at a table, ask one thing of it, chart
the answer, want the rows behind one bar, compare with another table, and
half an hour later you need to say *how* a chart was made.

Panorama (exasol-labs/exasol-panorama) has the right idea: every result is a
box on an infinite plane, every arrow says where it came from. Studio hosts
Panorama in its own tab; this change brings the idea into Studio's own query
builder, in Studio's design, on the pieces Studio already has — the ReactFlow
canvas the diagram runs on, Monaco, ECharts, the results grid, the CSV
export, the Notebook's "ask the agent" pattern. The Build toggle stays where
it is; what it opens is the canvas.

Two audiences, one artefact: a person builds and reads queries as a picture
of their reasoning; the agent gets the same picture — every chart carries its
evidence (the table, the SQL steps, the mapping) and can be asked to add to
the canvas through the assistant, the way it creates notebooks today.

## What

- **Explorer** at the left of the canvas: the connection (the open connection
  this Visualizer belongs to; other open connections selectable), its schemas,
  and on a click the schema's tables and views with row counts; a filter box.
  Clicking a table puts a **table box** on the canvas.
- **Table box**: schema.table, the column type row, the first rows in the
  results grid, "load more" paging, row count. Halo buttons around the active
  box: *Query with SQL*, *Chart this*, *Export CSV*, *Close*.
- **Query box**: a SQL step on one or more boxes. Monaco editor seeded with
  `SELECT * FROM derived_table`; `derived_table` (or a named source) resolves
  to the source box, and steps chain as CTEs so re-running an early step
  refreshes what is built on it. Run with ⌘↵ / Ctrl+↵ or the button; the
  result grid shows below; *Edit* / *Back to result* toggles the editor.
  Errors and elapsed time are shown in the box.
- **Chart box**: an ECharts chart on a table or query box. *Edit* opens the
  chart editor beside it — what to draw (chart, by, measure, order, show),
  how it looks (stacked, direction), what is written (legend). Clicking marks
  selects them; *Show the rows behind the selection* opens a query box with
  the matching WHERE. *Evidence* lists the lineage — source table, each SQL
  step, the mapping — with copy-SQL. Export PNG / CSV of the charted rows.
- **Arrows** are derived from sources and drawn with a marker naming the
  relationship: `SQL` (derivation), a bars mark (feeds a chart), `≡` (rows
  behind a selection).
- **Infinite canvas**: pan by dragging, zoom with ctrl/⌘ + wheel or pinch,
  fit to view, undo/redo. New boxes land flush right of their source, or in
  reading order from the explorer, never overlapping.
- **Ask the agent**: an *Ask* button on the canvas (the Notebook's pattern)
  opens the assistant with the canvas as context — the connection, the boxes
  and their SQL. The agent answers with a ```canvas fence — query and chart
  boxes on named sources — that renders as an *Add to canvas* card.
- **Persistence**: the canvas is saved per connection in local storage and
  restored with its layout; results are re-run on demand, not stored.
- The form-based BuilderPane and its state are removed.

## Non-goals

- Not a second Panorama. No GPU renderer, no history DAG, no Parquet/XLSX
  export; the hosted Panorama tab remains for that.
- No cross-filtering between charts in this change (a selection opens rows;
  it does not filter sibling charts).
- No collaboration or sharing beyond export.
