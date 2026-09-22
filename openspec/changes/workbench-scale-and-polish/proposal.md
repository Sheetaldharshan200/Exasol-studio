# Proposal

## Why

Six things the user runs into every day in the workbench are rough or fragile, and one of them can take the whole app down:

1. **Marketplace cards and page** — the catalog renders as a dense `minmax(250px,1fr)` tile grid with a two-line header; names truncate, descriptions are cut, the install/update state is hard to read at a glance. The reference the user named is Docker Hub: wide, uniform result rows with logo, name, publisher, one-paragraph description, meta (version, downloads/stars, last updated), tags, and a single clear action — under a page header with search and a left filter rail.
2. **Updates are not one truth** — installed / latest / "update available" is computed in three places (the card, the Updates tab, the badge) from overlapping state (`installedMap`, `components`, `componentUpstream`, `catalog.items[].latest`). They can disagree after an install or a refresh, and "synced" state is not shown anywhere (no "checked 5 min ago", no single refresh that updates all three).
3. **Visualizer focus** — clicking a table selects it but the viewport does not move; the only auto-center is the search jump (`jumpTo`, fixed zoom 1.15). Large schemas leave the clicked table off-screen or tiny; there is no way back to the overview except the fit button.
4. **Relationship inference is naive** — `Visualizer.tsx:626-655` infers a link only when a child column has EXACTLY the parent's single-column PK name. `CUSTOMER_ID → CUSTOMERS.ID`, `CUST_ID`, `CUSTOMERID`, singular/plural, prefixes (`FK_`, `REF_`), type mismatches (a VARCHAR "ID" matching a DECIMAL PK) are all missed or wrong, and there is no confidence, so every dashed edge looks equally trustworthy.
5. **Query builder** — the Build pane recomputes react-querybuilder fields, the SQL text and the column lists on every render; picking tables with hundreds of columns stutters; `buildSql` (79 lines) lives untested inside a 1,300-line component; there is no aggregate/group-by, no join-type choice, no result preview.
6. **Large files hang the app** — opening a big CSV from the file tree reads the WHOLE file into a Monaco text tab (`fsReadText`, 8 MB Rust cap but still one string into the renderer); the grid preview loads a fixed 5,000 rows with no paging and no total; a failed open is silently swallowed (`/* ignore unreadable file */`); the Git panel's `git_diff` returns an unbounded string; and nothing isolates a crashing tab — one render error in a tab unmounts the whole workbench (`AppErrorBoundary` is app-level only).
7. **Chat composer** — there is no completion while typing (slash commands exist, `@` chips exist, but no ghost-text/table-name completion) and no "what next" after an answer; the user has to think of the follow-up themselves.

## What Changes

- **Marketplace page**: a Docker-Hub-style layout — page header (title, search, result count), left filter rail (kind, official/labs, installed/updatable, runtime), and a single-column list of uniform `CatalogRow` cards (logo · name · publisher/verified badge · description · meta line · tags · one action + overflow). The card is extracted to `marketplace/CatalogCard.tsx`; the pure "what state is this item in" decision to `marketplace/item-state.ts` (tested) so the card has no branching of its own. `Marketplace.tsx` (2,101 lines) shrinks; it must not grow.
- **Update sync**: one pure `updateState(item, sources)` in `marketplace/updates.ts` (extending the existing `isNewerVersion`/count helpers) returns `{installed, available, action: "none"|"install"|"update"|"drift", source}` and is the ONLY thing the card, the Updates tab and the badge read. One `refreshAll()` that refetches installed + catalog + upstream together, a visible "Checked <relative time>" stamp, and an "Update all" that runs the same per-item path. Fetch-on-demand policy unchanged (no polling — user rule).
- **Visualizer focus**: click a table → the viewport animates to fit that table AND its linked neighbours (`focusBounds(nodes, links, id)` pure, tested); click empty canvas or press Esc → animate back to fit-all; double-click → pick for the query builder (current behaviour preserved). Zoom levels are computed from the bounds, not fixed.
- **Relationship inference**: `workbench/visualizer/infer-links.ts` — declared FKs first; then scored candidates: exact PK-name match (1.0), `<TABLE>_ID`/`<SINGULAR>_ID`/`<TABLE>ID` → parent `ID` or `<TABLE>_ID` (0.9), normalised-name match after stripping `FK_`/`REF_`/`_FK`/`_KEY`/`_NO` and case/underscore differences (0.7), all gated by type compatibility (numeric↔numeric, char↔char with compatible length) and by the target being a PK or UNIQUE column; ambiguous targets (two parents) drop to 0.4 and are hidden below the confidence slider. Edges carry the score; the label shows `≈ 0.9`. Tested against fixtures (TPC-H, an energy schema, a snake-case vs camel-case schema, a no-PK schema).
- **Query builder**: `buildSql` and the field/option derivations move to `workbench/visualizer/build-sql.ts` (pure, tested, including quoting and case-folding); the builder memoises fields per picked-table set; column pickers virtualise above 60 rows; SQL preview debounced (150 ms); new: aggregate per column (COUNT/SUM/AVG/MIN/MAX) with automatic GROUP BY, join type per link (INNER/LEFT), a "Preview 100 rows" run inside the pane. `Visualizer.tsx` is split into `workbench/visualizer/` (Diagram, Builder, nodes/edges, search) — none over 500 lines.
- **Large-file resilience**: Rust `fs_read_table(path, offset, limit)` streams the requested window and returns `{rows, columns, offset, total?: number}` (total counted lazily in a second call `fs_count_rows`); the preview pages 1,000 rows at a time with a pager and a "Jump to row"; text-open of a tabular file above 1 MB (or any file above 2 MB) is redirected to the preview with an explicit "Edit as text anyway" that warns; unreadable files surface an error toast instead of nothing; `git_diff` gains a byte cap (1 MB) and falls back to `--stat` + "diff too large" for huge blobs; every workbench tab body renders inside a `TabErrorBoundary` that shows the error and a "Close tab" — the rest of the app keeps working; all Tauri `invoke` calls from tabs get a 60 s soft timeout with a visible "still working…" state so a stuck sidecar cannot freeze the UI.
- **Chat composer**: inline completion (ghost text, Tab to accept) fed by a pure `completeDraft(draft, sources)` that ranks slash commands, `@schema.table` / `@table` names from the active connection's catalog cache, and the user's own recent prompts; after every assistant reply, up to three next-action chips from a pure `suggestNextActions(reply, context)` (e.g. reply contains SQL → "Run it" / "Open in editor" / "Explain the plan"; reply lists tables → "Visualize these"; reply has numbers over time → "Chart it" / "Add to a dashboard"). Deterministic, no extra model call; both functions tested.

## Capabilities

### New Capabilities
- `marketplace-catalog-page`: the Docker-Hub-style catalog page — header, filter rail, uniform rows, one action per row, extracted card with a tested state decision.
- `component-update-sync`: a single source of truth for installed/available/action per item, one refresh for all surfaces, a visible checked-at stamp, update-all.
- `visualizer-focus-and-inference`: click-to-focus / click-away-to-overview viewport behaviour, and scored, type-checked relationship inference with confidence.
- `visual-query-builder`: the tested SQL builder with aggregates, join types, virtualised pickers and an in-pane preview.
- `large-file-resilience`: paged tabular reads, size-guarded text opens, capped git diffs, per-tab error isolation, soft IPC timeouts.
- `assistant-composer-suggestions`: ghost-text completion and next-action chips in the Exa engine chat, both deterministic and tested.

### Modified Capabilities
- (none — `notebook-artifact-hub` is untouched)

## Impact

Files touched, with the KISS size rule in view (over 1,000 lines today, must shrink or at least not grow):
- `apps/desktop/src/components/studio/ExasolStudio.tsx` (3,960) — only the tab body wrapper (`TabErrorBoundary`) and the `openData` size guard; extraction of `openData`/file-open helpers to `workbench/open-file.ts`.
- `apps/desktop/src/features/marketplace/Marketplace.tsx` (2,101) — card, filters and update state extracted out; target under 1,200 after this change, with a stated plan for the rest.
- `apps/desktop/src/features/assistant/exa/ExaThread.tsx` (1,912) — composer gains the completion hook; suggestion chips render from a new `NextActions.tsx`; ExaThread must not grow.
- `apps/desktop/src/features/workbench/Visualizer.tsx` (1,300) — split into `features/workbench/visualizer/*`.
- `apps/desktop/src/features/assistant/ExaEnginePanel.tsx` (850), `FileExplorer.tsx` (600), `GitLogTab.tsx` (389), `FilePreviewPanel.tsx`.
- Rust: `fs.rs` (paged reads, row count), `git.rs` (diff cap). IPC: `ipc.ts`/`ipc-mock.ts` gain `fsReadTable(path, offset, limit)`, `fsCountRows`.
- Tests: `node:test` for every new pure module; `cargo test` for the paged CSV reader (window boundaries, empty file, header-only, quoted newlines) and the diff cap.

## Non-goals

- No polling or background version checks (fetch on open / on tab click only — existing user rule).
- No new model calls for suggestions or completion; both are deterministic.
- No change to what the Marketplace installs or how (install paths, verification, launcher) — presentation and state only.
- No general virtualised text editor for huge files: files over the guard open as a paged grid, and "Edit as text anyway" keeps today's behaviour with a warning.
- No change to the agent-core loop or the MCP gateway.
