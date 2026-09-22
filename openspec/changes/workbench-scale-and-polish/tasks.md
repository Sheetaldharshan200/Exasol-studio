# Tasks

## 1. Update sync — one truth (smallest, unblocks the Marketplace redesign)

- [x] 1.1 `features/marketplace/item-state.ts`: `itemState(item, sources)` → `ItemState`; port every boolean from `renderCard` (installed, onSystem, newer, managedUpdate, drift, noHostBuild, dbRunning); tests in `item-state.test.ts` (managed newer / equal / older / opaque drift / addon newer / not installed / no host build / running)
- [x] 1.2 Card, Updates page, header count AND the app-open badge (`use-update-badge.ts`) all read `itemState`/`countUpdates`; the old `countCatalogUpdates`/`countManagedUpdates` are deleted; `item-state.test.ts` pins presence-from-installedMap and update-outranks-ready (Codex findings 1–3, 8)
- [x] 1.3 `refreshAll()` + `checkedAt` in the Marketplace store; "Checked <relative>" stamp in header and Updates tab; no timers (verify no `setInterval` in marketplace/)
- [x] 1.4 "Update all" on the Updates page reuses `installSelected(ids)` (managed updates sequential, addons queued in parallel — the queue already isolates failures)

## 2. Marketplace page — Docker Hub layout

- [x] 2.1 `marketplace/hub/HubCard.tsx` (Docker-Hub card: logo tile, `publisher/name`, trust mark, two-line description, footer with install fact + stars); actions live on the item page (`hub/HubDetail.tsx`), like Docker Hub — the old per-card button row is gone (row: logo | body | actions), rendering a switch over `ItemState.kind`; primary action per kind, overflow for the rest; no logic beyond the switch
- [x] 2.2 `marketplace/hub/FilterDrawer.tsx` (right-hand rail: Trusted content + Categories) + pure `applyFilters(items, states, filters)` in `marketplace/filters.ts`; tests in `filters.test.ts` (compose, empty, search + filter)
- [x] 2.3 Pages: `HubHome` (search + 3 featured cards + category shelves + recently updated), `HubSearch` (filters button with count, chips, `1 - N of M results`, Sort, 3-col grid), `HubDetail` (identity row, version pills, Overview README | Versions), `HubHeader` (breadcrumb, Kits/Updates/Installed/AI clients, Checked stamp). Grid/list toggle, compact mode and progressive reveal removed. `Marketplace.tsx` 2,101 → 1,889 lines (InstallConsole ~300 lines is the next extraction)
- [ ] 2.4 Manual check in the app: install / update / running states each show exactly one primary action; long names and descriptions clamp; theme-safe in dark mode

## 3. Visualizer — focus and inference

- [x] 3.1 `Visualizer.tsx` 1,300 → 843 lines: `visualizer/BuilderPane.tsx` (the Build pane), `visualizer/diagram.tsx` (table nodes, beam edges, edge style, presets, ToggleRow, edgeIsActive — verbatim), `visualizer/query-builder-style.ts`, `visualizer/search.ts`; pure logic already in `visualizer-focus.ts`, `infer-links.ts`, `build-sql.ts`. The component itself (data loading, layout, search, style panel) stays as one file under 1,000 (Diagram.tsx, Builder.tsx, nodes.tsx, edges.tsx, search.ts, index.tsx) verbatim; tsc + vite build green; no file over 500 lines
- [x] 3.2 `workbench/visualizer-focus.ts`: `focusBounds(nodes, links, id, pad)`; tests in `focus.test.ts` (single, hub, isolated, missing id, padding)
- [x] 3.3 Wire click → `fitBounds`, pane click / Escape → `fitView`, double-click → pick (unchanged); manual check on a 60-table schema
- [x] 3.4 `workbench/infer-links.ts`: `inferLinks(tables, {minScore})` with the three rules, type gate, PK/UNIQUE gate, ambiguity penalty, `singular()`; tests in `infer-links.test.ts` with fixtures: TPC-H, energy (METER_ID), snake vs camel, generic-ID schema, no-PK schema, declared-FK dedupe
- [x] 3.5 Edge labels show `≈ score`; confidence slider in the toggles row; hidden-link count

- [x] 3.6 One canvas per connection: every schema is a dashed box (React Flow parent node), tables inside, links across schemas including virtual ones; a schema multiselect (all on by default, remembered per tab) replaces the schema dropdown; an "Add data source" box closes the row. Pure `visualizer/connection-graph.ts` (`SCHEMA.TABLE` ids, merge, box layout — tested); `build-sql`/`infer-links` work on schema-qualified ids (tested)
- [x] 3.7 Links stay cheap on big diagrams: above 24 links only the selected link animates/carries a label, decoration pauses while panning or zooming, and the shimmer is an SVG animation instead of a JS-driven gradient per edge (the hang on move/zoom with many links)

## 4. Query builder

- [x] 4.1 `workbench/build-sql.ts`: move `buildSql` + `deriveFields` verbatim; tests in `build-sql.test.ts` (quoting, lower-case identifiers, no picks, WHERE group nesting, ORDER BY)
- [x] 4.2 `buildSql` supports aggregates (alias + automatic GROUP BY) and per-link join types, tested — the Build pane's controls for them are still to be added (4.3/4.4)
- [x] 4.3 Fields were already memoised per picked set; SQL display debounced 150 ms; React Flow `onlyRenderVisibleElements` renders only on-screen tables (column rows are node-internal and their handles are index-positioned, so per-node virtualisation would break the edge anchors — the visible-elements pass is the win instead)
- [x] 4.4 "Preview 100 rows" in the pane (LIMIT forced to 100, errors inline, elapsed ms); aggregates per chip (COUNT/SUM/AVG/MIN/MAX → automatic GROUP BY) and INNER/LEFT per join in a Joins row

## 5. Large files never take the app down

- [x] 5.1 Rust `fs_read_table(path, offset, limit)` streaming window + `fs_count_rows`; `TablePreview` gains `offset`, `hasMore`; `cargo test` in `fs.rs` (window in middle, past end, header-only, empty, quoted newline, limit clamp)
- [x] 5.2 `FilePreviewPanel`: pager (1,000/page), jump-to-row, total from `fs_count_rows` (lazy, cached per path+mtime), "Edit as text anyway" with warning
- [x] 5.3 `features/workbench/open-file.ts`: `routeOpen({name, size})`; tests in `open-file.test.ts` (small text, 1 MB CSV boundary, 2 MB boundary, non-tabular refuse); `FileExplorer.openPath` uses it and toasts failures; `ExasolStudio.openData` moves here
- [x] 5.4 Rust `git_diff` byte cap (1 MB, cut on a line, says how much was left; huge untracked files are not read in full) with `--stat` fallback and `truncated` flag; `GitLogTab` shows "Diff too large (<size>)"; `cargo test` (under cap, over cap, binary)
- [x] 5.5 `components/studio/TabErrorBoundary.tsx` wrapping every tab body in `ExasolStudio.tsx`; manual check by throwing in a dev-only tab; `ExasolStudio.tsx` line count does not grow
- [ ] 5.6 Soft IPC timeouts with a waiting state — not started (a `withSoftTimeout` helper was written, reviewed as dead surface until wired, and removed; write it together with the wiring)

## 6. Chat composer

- [x] 6.1 `features/assistant/exa/complete-draft.ts` (`lib/fuzzy.ts` already existed and is reused): slash, @schema.table, @table, recent prompt, < 3 chars, no match — tested
- [x] 6.2 `exa/ExaComposerInput.tsx` wraps the assistant-ui input: the completion shows as a hint line under the input (typed + ghost), Tab accepts, never submits; `ExaThread.tsx` untouched
- [x] 6.3 `features/assistant/exa/next-actions.ts`: `suggestNextActions(reply, ctx)`; tests in `next-actions.test.ts` with real reply fixtures (SQL fence, table list, time series, error, prose)
- [x] 6.4 `exa/ExaNextActions.tsx` chips under each finished assistant message — editor actions via the apply-SQL bridge + `studio:run-editor`, visualize via `studio:open-visualizer`/`studio:visualizer-locate`, the rest as follow-up prompts

## 7. Review and ship

- [ ] 7.1 Codex review per group (1+2, 3+4, 5, 6); findings fixed before each commit; notable ones logged in the llm-wiki
- [ ] 7.2 Full suite green, `build-local.sh --bundles app`, binary mtime verified, relaunch; manual pass: Marketplace filters + update-all, visualizer focus on a big schema, builder aggregate preview, 300 MB CSV open, giant diff, one crashing tab, chat completion + chips
- [ ] 7.3 `graphify update .` and `.ua` refresh (wiki page `workbench-scale-and-polish` written)
- [ ] 7.4 (deferred, from Codex round 3) shrink `ExasolStudio.tsx` (3,984 lines). Measured: the tab-body ternary (440 lines) closes over ~60 component-scope values, so a `StudioTabBody` would be a 60-prop pass-through, not a simplification. The real seam is a `useEditorTab()` hook (editor ref, run/explain, inline diff, result paging, history) extracted FIRST; then the SQL-editor branch becomes `<SqlEditorTab {...editor} />` and the file drops well under 3,000
