# Tasks

## 1. Update sync — one truth (smallest, unblocks the Marketplace redesign)

- [ ] 1.1 `features/marketplace/item-state.ts`: `itemState(item, sources)` → `ItemState`; port every boolean from `renderCard` (installed, onSystem, newer, managedUpdate, drift, noHostBuild, dbRunning); tests in `item-state.test.ts` (managed newer / equal / older / opaque drift / addon newer / not installed / no host build / running)
- [ ] 1.2 Make the card, the Updates tab and `use-update-badge.ts` read `itemState` only; delete the duplicated derivations; `updates.test.ts` gains a "card, tab and badge agree" fixture
- [ ] 1.3 `refreshAll()` + `checkedAt` in the Marketplace store; "Checked <relative>" stamp in header and Updates tab; no timers (verify no `setInterval` in marketplace/)
- [ ] 1.4 "Update all" in the Updates tab — sequential, one failure does not stop the rest; `updates.test.ts` covers the sequencing decision (`planUpdateAll(states)`)

## 2. Marketplace page — Docker Hub layout

- [ ] 2.1 `marketplace/CatalogCard.tsx` (row: logo | body | actions), rendering a switch over `ItemState.kind`; primary action per kind, overflow for the rest; no logic beyond the switch
- [ ] 2.2 `marketplace/FilterRail.tsx` + pure `applyFilters(items, states, filters)` in `marketplace/filters.ts`; tests in `filters.test.ts` (compose, empty, search + filter)
- [ ] 2.3 Page header (title, search, result count, Checked stamp); remove the grid/list toggle and the compact mode; `Marketplace.tsx` under 1,200 lines (measure before/after; state the plan for the rest in the PR)
- [ ] 2.4 Manual check in the app: install / update / running states each show exactly one primary action; long names and descriptions clamp; theme-safe in dark mode

## 3. Visualizer — focus and inference

- [ ] 3.1 Move `Visualizer.tsx` into `features/workbench/visualizer/` (Diagram.tsx, Builder.tsx, nodes.tsx, edges.tsx, search.ts, index.tsx) verbatim; tsc + vite build green; no file over 500 lines
- [ ] 3.2 `visualizer/focus.ts`: `focusBounds(nodes, links, id, pad)`; tests in `focus.test.ts` (single, hub, isolated, missing id, padding)
- [ ] 3.3 Wire click → `fitBounds`, pane click / Escape → `fitView`, double-click → pick (unchanged); manual check on a 60-table schema
- [ ] 3.4 `visualizer/infer-links.ts`: `inferLinks(tables, {minScore})` with the three rules, type gate, PK/UNIQUE gate, ambiguity penalty, `singular()`; tests in `infer-links.test.ts` with fixtures: TPC-H, energy (METER_ID), snake vs camel, generic-ID schema, no-PK schema, declared-FK dedupe
- [ ] 3.5 Edge labels show `≈ score`; confidence slider in the toggles row; hidden-link count

## 4. Query builder

- [ ] 4.1 `visualizer/build-sql.ts`: move `buildSql` + `deriveFields` verbatim; tests in `build-sql.test.ts` (quoting, lower-case identifiers, no picks, WHERE group nesting, ORDER BY)
- [ ] 4.2 Add aggregates (COUNT/SUM/AVG/MIN/MAX) with automatic GROUP BY and per-link join type to `buildSql`; extend tests (aggregate + plain, all aggregates, LEFT join on one link)
- [ ] 4.3 Memoise fields per picked set, virtualise column pickers > 60 rows, debounce SQL preview 150 ms; manual check on a 400-column table
- [ ] 4.4 "Preview 100 rows" in the pane via `ipc.executeSql(…, 100, …)`, errors inline

## 5. Large files never take the app down

- [ ] 5.1 Rust `fs_read_table(path, offset, limit)` streaming window + `fs_count_rows`; `TablePreview` gains `offset`, `hasMore`; `cargo test` in `fs.rs` (window in middle, past end, header-only, empty, quoted newline, limit clamp)
- [ ] 5.2 `FilePreviewPanel`: pager (1,000/page), jump-to-row, total from `fs_count_rows` (lazy, cached per path+mtime), "Edit as text anyway" with warning
- [ ] 5.3 `features/workbench/open-file.ts`: `routeOpen({name, size})`; tests in `open-file.test.ts` (small text, 1 MB CSV boundary, 2 MB boundary, non-tabular refuse); `FileExplorer.openPath` uses it and toasts failures; `ExasolStudio.openData` moves here
- [ ] 5.4 Rust `git_diff` byte cap with `--stat` fallback and `truncated` flag; `GitLogTab` shows "Diff too large (<size>)"; `cargo test` (under cap, over cap, binary)
- [ ] 5.5 `components/studio/TabErrorBoundary.tsx` wrapping every tab body in `ExasolStudio.tsx`; manual check by throwing in a dev-only tab; `ExasolStudio.tsx` line count does not grow
- [ ] 5.6 `lib/ipc-timeout.ts`: `withSoftTimeout(promise, ms)`; tests in `ipc-timeout.test.ts` (resolves before, times out, cancel); used by tab-originated calls with the waiting state

## 6. Chat composer

- [ ] 6.1 Move `fuzzyScore` to `lib/fuzzy.ts` (tests `fuzzy.test.ts`); `features/assistant/exa/complete-draft.ts`: `completeDraft(draft, sources)`; tests in `complete-draft.test.ts` (slash, @schema.table, @table, recent prompt, < 3 chars, no match)
- [ ] 6.2 Ghost-text rendering in the ExaThread composer (Tab accepts, Escape dismisses, never submits); `ExaThread.tsx` must not grow — the composer input moves to `exa/Composer.tsx`
- [ ] 6.3 `features/assistant/exa/next-actions.ts`: `suggestNextActions(reply, ctx)`; tests in `next-actions.test.ts` with real reply fixtures (SQL fence, table list, time series, error, prose)
- [ ] 6.4 `exa/NextActions.tsx` chips under each assistant message, dispatching through `useStudioActionBridge`; manual check of each chip

## 7. Review and ship

- [ ] 7.1 Codex review per group (1+2, 3+4, 5, 6); findings fixed before each commit; notable ones logged in the llm-wiki
- [ ] 7.2 Full suite green, `build-local.sh --bundles app`, binary mtime verified, relaunch; manual pass: Marketplace filters + update-all, visualizer focus on a big schema, builder aggregate preview, 300 MB CSV open, giant diff, one crashing tab, chat completion + chips
- [ ] 7.3 `graphify update .` and `.ua` refresh; wiki page `workbench-scale-and-polish`
