---
title: Workbench scale and polish — Marketplace hub, visualizer focus/inference, large files, chat chips
category: architecture
updated: 2026-09-22
---

# Workbench scale and polish

The batch that made the Marketplace a Docker-Hub-style catalog, taught the
schema diagram to focus and to infer relationships honestly, stopped big files
from freezing the app, and gave the chat completion + next-step chips. Spec:
`openspec/changes/workbench-scale-and-polish`.

## Marketplace = catalog pages, one state decision

- `features/marketplace/item-state.ts` — `itemState(item, sources)` is the ONLY
  derivation of installed / update / running / ready / onSystem / install /
  unavailable / reference / installing. The card, the item page, the Updates
  page, the header count and the app-open badge (`use-update-badge.ts`) read
  it; the old `countCatalogUpdates`/`countManagedUpdates` are gone.
  - Presence of a managed component comes from `installedMap` (detection +
    `list_components`), never from `list_components` alone — it reports the
    verified fallback version even when nothing is installed.
  - An available update outranks every other installed state, including a
    driver runtime that is "ready", so the Updates page and the item page agree.
- `features/marketplace/hub/` — `filters.ts` (pure: query → trust rail →
  category rail → sort; chips; counts; Docker-style compact numbers),
  `HubHome` (search, three featured cards, category shelves, recently
  updated), `HubSearch` (filter button with count, chips, `1 - N of M
  results`, Sort), `FilterDrawer` (right rail), `HubDetail` (identity row,
  version pills, Overview README | Versions), `HubCard`, `HubLogo`, `HubHeader`.
- `Marketplace.tsx` stays the controller (install queue, drivers, kits,
  managed switches); `renderCard` became `renderActions(item)` and the buttons
  live on the item page only, like Docker Hub. 2,101 → 1,860 lines.
- Stars and last push come from GitHub via `market_repo_meta` (`stars`,
  `pushedAt` on `RepoMeta`/`ResolvedCatalogItem`). READMEs via the existing
  `market_doc` (a duplicate `market_readme` was written and removed — check
  for an existing command before adding one).
- `checkedAt` is stamped when the SLOWEST source (releases) settles, not when
  the refresh starts.

## Visualizer

- `workbench/visualizer-focus.ts` — `focusBounds(nodes, links, id)`; click a
  table → `fitBounds` on it + 1-hop neighbours; click away / Escape → fit all.
  The fit-all also runs after a fresh layout (`layoutRev`), deferred one frame
  so React Flow has measured the new nodes.
- `workbench/infer-links.ts` — scored inference: same key name (1.0), naming
  convention `<PARENT>_ID`/`<SINGULAR>_ID`/`<PARENT>ID` (0.9), normalised
  name incl. TPC-H prefixes `O_CUSTKEY → C_CUSTKEY` (0.7); type family gate
  (number ↔ number, text ↔ text, dates never); generic `ID`/`KEY` names never
  match by equality; composite parent keys ×0.8; a child column matching two
  parents ×0.5 and `ambiguous`. Default threshold 0.6 with a slider; hidden
  links are counted. Edge labels show `≈ 0.9`.
- `workbench/build-sql.ts` — the builder's SQL, extracted verbatim and then
  extended with aggregates (alias `SUM_AMOUNT`, automatic GROUP BY) and
  per-link join types; `previewSql` forces `LIMIT 100`.
- `workbench/visualizer/BuilderPane.tsx` — the Build pane: an aggregate menu
  on every picked chip, a Joins row (INNER ↔ LEFT per link), the WHERE
  builder, the SQL (display lags 150 ms; Copy/Run/Preview use the CURRENT
  SQL), and "Preview 100 rows" run in place. A preview remembers the SQL it
  was launched for and drops a late answer for an older query. An ORDER BY on
  a column that is no longer picked is cleared with the pick.
- `Visualizer.tsx` 1,300 → 843 lines after moving nodes/edges/styling to
  `visualizer/diagram.tsx`, the querybuilder classnames to
  `query-builder-style.ts` and the fuzzy scorer to `search.ts`; React Flow
  `onlyRenderVisibleElements` is the wide-schema win (per-node column
  virtualisation would break the index-positioned edge handles).

## Large files never take the app down

- Rust `fs_read_table(path, limit, offset)` streams one window (limit ≤
  10,000, skip via the iterator, peek one to learn `hasMore`);
  `fs_count_rows` is one streaming pass (correct with quoted newlines).
- `workbench/open-file.ts` — `routeOpen({name, size})` decides text vs paged
  grid vs refuse BEFORE reading; CSV/TSV over 1 MB → grid, anything over
  2 MB → never text. `FileExplorer` reports failures with a toast instead of
  swallowing them.
- `git_diff` caps at 1 MB, cut on a line boundary, and says how much was left;
  untracked files over the cap are not read in full.
- `TabErrorBoundary` wraps every tab body; a render error shows in that tab
  with Copy details / Close tab / Try again, everything else keeps working.
- `lib/ipc-timeout.ts` — `withSoftTimeout` exists and is tested; the waiting
  state in tabs is not wired yet.

## Chat

- `exa/complete-draft.ts` — slash command, `@schema.table`, recent prompt
  (≥ 3 chars); `ExaComposerInput` shows it as a hint line, Tab accepts.
- `exa/next-actions.ts` — chips derived from the reply: SQL fence → Run /
  Open / Explain (DDL → Open only), error + code → Fix, time-series table →
  Chart / Dashboard, known table names → Visualize. No model call.

## Gotchas

- `cargo test a b` treats the second filter as an unexpected argument — use
  `cargo test -- a b`.
- assistant-ui's composer is driven through `useAui().composer().setText()`;
  state via `useAuiState((s) => s.composer.text)`.
- `reqwest::blocking` inside `#[tokio::test]` panics — use the async client.

## One canvas per connection (2026-09-22)

- Table identity is `SCHEMA.TABLE`, columns `SCHEMA.TABLE.COLUMN`; the last dot
  separates the column, the first the schema (`connection-graph.ts`). Per-schema
  graphs (`getSchemaGraph`, cached per profile:schema) are merged; declared links
  are intra-schema (what the Rust graph returns), inferred links run across every
  visible table by id — so a virtual schema's `sales.customer_id` can point at a
  local `CUSTOMERS.ID`.
- Each schema is a React Flow parent node (`schemaGroup`, dashed box, `zIndex -1`,
  not draggable) and its tables are children with `extent: "parent"` and
  RELATIVE positions; `layoutSchemas` also returns absolute positions, kept in a
  ref for `focusBounds`. Groups come first in the nodes array.
- Selection: all schemas by default, remembered per tab (`lastSelection`); a new
  schema joins automatically until the user has narrowed. Locate events for a
  hidden schema add it first, then jump.
- Performance: each declared link used to render two paths, an SMIL dot, a
  framer-motion gradient and an HTML label — with a hundred links every pan
  re-ran a hundred JS animations. Now: `dense` (> 24 links) → only the selected
  link is decorated; `paused` (onMoveStart/onMoveEnd) → plain lines while moving;
  the shimmer is `<animate>` on the gradient. `EdgeRenderContext = EdgeStyle &
  {dense, paused}`.
- Codex round 5 on the canvas: (1) remember a selection only once the schema
  list exists — an early `[]` read as "the user hid everything"; (2) locate
  events resolve schema/table/column case-insensitively against what exists;
  (3) hiding a schema also drops its aggregates, join types and any WHERE
  naming it (`whereSchemas`); (4) declared cross-schema FKs carry
  `targetSchema` from `get_schema_graph` (REFERENCED_SCHEMA) so the merge does
  not mis-qualify them; (5) framing reads live node positions (tables can be
  dragged inside their box). Known limit: identifiers containing dots are
  ambiguous in the dotted ids.
- **Crash after "Building graph…" (2026-09-22).** webview.log showed three
  `ResizeObserver loop completed with undelivered notifications` right before
  the restart: React Flow's `onlyRenderVisibleElements` with parent/child nodes
  flips children in and out of "visible" while their dimensions settle — a
  measure→render loop that ends in a renderer kill (`panic = "abort"` is the
  Rust side; the webview dies on its own). Removed the flag. Bounded rendering
  now comes from `budgetLinks` (`MAX_EDGES = 400`: over it, declared links plus
  the selected table's, the rest counted in the header) and from the
  dense/paused edge decoration. Schema graphs also load ONE at a time —
  concurrent statements on the shared websocket session are a known hang.
- **Production shape of the canvas (2026-09-22, after a second renderer death
  with sub-flows removed from culling but not from the model).** Per React
  Flow's own performance guidance — memoise node components, never rebuild
  node objects on interaction, render detail only where it can be read,
  collapse, keep node CSS plain — the canvas now: (1) uses NO sub-flow
  parent/child nodes at all; schema boxes are backdrop nodes (`zIndex -1`,
  `pointer-events: none` except their header) and tables sit at absolute
  positions from `layoutSchemas`; (2) puts selection, picks, mode and search
  matches in `DiagramStateContext` so a click re-renders memoised `TableNode`s
  without touching the nodes array; (3) — level of detail was tried (header-only below a zoom) and REMOVED: at the fit-to-all
  zoom it hid every column, which is what the user came to see; (4)
  paginates each box (`TABLE_PAGE = 20`, "Show N more" / "All", jump/locate
  reveals the whole schema); (5) draws only links between drawn tables, then
  applies `budgetLinks`; (6) loads schema graphs one at a time. Sources:
  reactflow.dev/learn/advanced-use/performance, xyflow issue #4792.
- **Pan/zoom smoothness (2026-09-22).** With the crash gone the remaining jank
  was paint: React Flow's `<Background>` re-renders its SVG pattern on every
  viewport change, translucent box fills + inset shadows blend at every zoom
  step, and toggling edge decoration through React state re-rendered every edge
  at gesture start/end. Now: a static CSS dot grid on the pane, `will-change:
  transform` on viewport and nodes, boxes are a dashed line plus a header, the
  minimap unmounts during a gesture, and `.is-moving .vs-deco { display: none }`
  hides pulses/labels through the cascade. Rule: nothing in the diagram may
  subscribe to the viewport transform except React Flow itself.
  Correction (later the same day): `will-change: transform` stays on the
  VIEWPORT only. Putting it on every node promoted 100+ cards (and the big
  schema boxes) to their own compositing layers; WebKit re-rasterised all of
  them on each zoom step, which is the "smooth, then hangs after some point"
  the user kept seeing. One layer for the viewport, plain nodes.

## Production fixes from the issue tracker (2026-09-22, #156 #157 #158)

- **The print window is a document viewer, not a browser.** Its response
  carries `default-src 'none'; script-src 'none'; connect-src 'none'` (a
  notebook keeps raw markdown HTML on purpose, and dashboards inline echarts —
  neither may execute or phone home in a trusted window; charts print from the
  captured image the script would otherwise have replaced), and
  `on_navigation` allows only the job's own URL, compared by scheme + host +
  path. The print dialog runs once, for that document only.
- **#156 exports.** `window.print()` is a silent no-op inside WKWebView, so the
  notebook and dashboard PDF buttons did nothing on the desktop while the toast
  claimed a dialog had opened. Now `lib/print-html.ts` hands the finished HTML
  to Rust `print_html` (`src-tauri/src/print.rs`): the document is stored in
  `PrintJobs`, opened in its own window on `print://localhost/<id>` (served by
  `register_uri_scheme_protocol`; `http://print.localhost/…` on Windows), and
  the native print dialog runs on THAT window once the page has loaded (800 ms
  settle for inline charts); the job is dropped with the window. The web build
  keeps the iframe. Dashboard exports also return an outcome that
  `export-notice.ts` turns into a toast (silent on cancel), and the Share
  popover's format buttons show a spinner on the one pressed.
- **#157 where "running" shows.** The Run button used to spin; the Results tab
  icon now spins and the tab strip reads `Running since 14:05:12 · 3.4s`
  (`lib/elapsed.ts` `formatClock`/`formatElapsed`, `lib/use-elapsed-ms.ts`
  ticking 5×/s). The same vocabulary is used by the visualizer's load pill
  (`Loading TPCH · 3/18 schemas · since … · 1.2s`, a pill, no longer a curtain
  over the canvas), the builder's preview button (`Running · 1.2s`) and every
  add-source statement (`running since … · 4.1s`, then its duration).
- **#158 link-style panel.** `w-64` with a three-column slider row overflowed;
  now `w-72`, `ToggleRow` is `w-full`/`role="switch"`, slider rows put
  label + value above a full-width range, and the panel scrolls when tall.
- **Smoothness, the actual cause (2026-09-22, second pass).** Two things, both
  measurable:
  1. `will-change: transform` was on the viewport permanently. A promoted layer
     is re-rasterized at every new scale, and this layer is the whole canvas —
     at low zoom it covers an enormous area, so each wheel step costs more than
     the last. That is precisely "smooth, then after some point it hangs". It
     is now scoped to `.is-moving` (added on `onMoveStart`, dropped 180 ms
     after the last `onMoveEnd`, so a wheel burst counts as one gesture): a
     gesture transforms the existing raster, and the browser rasterizes once,
     sharply, when it ends. xyflow discussion #4617 recommends exactly this;
     the same discussion's `translate3d` idea is not needed once the layer
     stops thrashing. `contain: layout style` on nodes keeps a card's layout
     from escaping it. The per-node `will-change` is gone for the same reason.
  2. The far-detail tier could never fire: `FAR_ZOOM` was 0.12 while React
     Flow's `minZoom` was 0.15. Every zoom level the user could reach painted
     every column of every card. `visualizer/zoom-lod.ts` now decides from
     LEGIBILITY — `isFarZoom(zoom, rowHeight)` is true once a row is under
     7 screen pixels — and `minZoom` is 0.04 so a warehouse fits on screen.
- **Zoomed out is a map, not a thumbnail (user request).** Under `.is-far`:
  column rows, card headers and the box's button strip all stop painting
  (`visibility`, so every card keeps its exact geometry and every edge handle
  stays on its column), cards become flat blocks, and each box draws a solid
  primary outline plus its NAME and table count at a constant screen size —
  `calc(15px / var(--vs-zoom))`, where `--vs-zoom` is written onto the pane by
  `onMove` as a style property, never as React state.
  - The name is its OWN node (`schemaFar`, `zIndex: 5`), not a child of the
    dashed box: the box is `zIndex: -1` so anything inside it is painted
    *under* the very cards it stands in for. It is `display: none` at every
    readable zoom, so it intercepts nothing there, and it carries
    `vs-box-handle`, so at map zoom you drag a schema by its name.
  - Dragging any schema node moves everything of that schema — tables, the
    backdrop and the name — whichever one you grabbed.
  - `fitView`/`fitBounds` never raise `onMove`, so the tier is also re-read
    after every programmatic move and on `onInit`; without that, the first
    auto-fit stayed in detail mode and focusing a table from far out kept the
    map tier while zoomed in.
  - A full-box node stacked above the cards would swallow every click at
    readable zoom, because React Flow puts `pointer-events` inline on a
    draggable node: `.react-flow__node-schemaFar { pointer-events: none
    !important }`, with the label itself re-enabling them only under
    `.is-far`. The minimap paints it transparent so the table rects still show.
  - The selected card's ShineBorder is a running animation and now sits in
    `.vs-deco`, so it parks during a gesture with the rest of the decoration.
- **Inference at scale.** `inferLinks` was parents × children × columns with a
  regex per step: 1.7 s for 1,000 tables, run again on every progressive
  publish. It now indexes every column once by (type family, exact / flat /
  normalised spelling) and looks parents up — 23 ms for 1,000 tables, 55 ms
  for 3,000, byte-identical output (checked against the old implementation on
  three synthetic schemas; `infer-links.test.ts` pins rule priority and a
  1,000-table budget).
