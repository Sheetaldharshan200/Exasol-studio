# Design

## Context

- Marketplace state today: `installedMap` (addons), `components` (managed, from `list_components`), `componentUpstream` (live tags), `catalog.items[].latest`, `detected` (on-system probes), `releases` (GitHub assets). The card derives ~10 booleans from them inline (`Marketplace.tsx:932-1010`); the Updates tab and `use-update-badge.ts` re-derive overlapping subsets. `updates.ts` already holds the pure pieces (`isNewerVersion`, `countCatalogUpdates`, `countManagedUpdates`).
- Visualizer: React Flow; `jumpTo` centres at fixed zoom 1.15; inference is exact-name-only (`Visualizer.tsx:626-655`); `buildSql` is a 79-line pure function inside the component; the builder uses react-querybuilder for WHERE.
- Files: `fs_read_text` refuses > 8 MB; `fs_read_table(path, limit)` reads from the top with `limit ≤ 100_000`; `FilePreviewPanel` asks for 5,000; `FileExplorer.openPath` swallows errors; `git_diff` returns the whole diff.
- Errors: `AppErrorBoundary` wraps the whole app in `main.tsx`; nothing per tab.
- Chat: `ExaThread.tsx` owns the composer; `exa/commands.ts` has `SLASH_COMMANDS`, `filterCommands`, `parseSlash`; `@` context chips exist (`ExaComposerContext`).

## Goals / Non-Goals

**Goals:**
- One place decides an item's state; every surface reads it.
- Every new decision is a pure function with a test; components only sequence.
- A failure in one tab, one file, or one IPC call stays in that tab.
- `Marketplace.tsx`, `Visualizer.tsx`, `ExaThread.tsx`, `ExasolStudio.tsx` end smaller than they start.

**Non-Goals:** see proposal.

## Decisions

1. **`item-state.ts` returns a discriminated union, not booleans.** `ItemState = {kind: "installed"|"update"|"drift"|"install"|"onSystem"|"unavailable"|"running", version?, available?, reason?}`. The card renders a switch over `kind`; the badge counts `kind in {update, drift, install}` for managed and `update` for addons — the same function, so they cannot disagree. Alternative rejected: keep booleans and share them — the disagreement is in the derivation, not the sharing.
2. **One `refreshAll()` with a `checkedAt` timestamp**, stored in the Marketplace store and shown in the header and the Updates tab ("Checked 4 min ago · Refresh"). Runs on tab open and on click only (no timers).
3. **Docker Hub layout, Studio tokens.** Rows not tiles: `CatalogCard` is a fixed-structure grid (`56px logo | 1fr body | 200px actions`), min-height 108 px, description clamped to 2 lines, meta line `v2.3.0 · updated 3 d ago · 12k downloads`, tags as small pills. Left rail filters are plain checkboxes (no native selects — repo rule). Compact list mode is dropped: the row IS the compact mode.
4. **Focus math is pure.** `focusBounds(nodes, links, id, pad)` → `{x, y, width, height}` covering the node and its 1-hop neighbours; React Flow's `fitBounds(bounds, {duration: 450, padding: 0.2})` does the animation. Click on the pane → `fitView({duration: 450})`. Double-click keeps "pick". Zoom is derived, never fixed. Tested: single node, hub node with 8 neighbours, node with no links, missing id.
5. **Inference is scored and type-gated.** `inferLinks(tables, {minScore})` returns `InferredLink[]` with `score` and `reason` ("exact PK name", "TABLE_ID convention", "normalised name"). Rules, in order, first match wins per (child column, parent): exact PK name 1.0; `<PARENT>_ID`/`<SINGULAR(PARENT)>_ID`/`<PARENT>ID` → parent PK 0.9; normalised equality (strip `FK_`, `REF_`, `_FK`, `_KEY`, `_NO`, `_NUM`, underscores, case) 0.7; each requires compatible types (numeric family ↔ numeric family; char ↔ char; date/timestamp never) and the parent column to be PK or UNIQUE. If a child column matches more than one parent, all its candidates are multiplied by 0.5 and marked `ambiguous`. Default `minScore` 0.6 with a slider in the toggles row. Singularisation is a tiny rule set (`IES→Y`, `SES→S`, `S→`), not a library.
6. **Builder extraction.** `build-sql.ts` exports `buildSql(input)` (existing behaviour, now tested), `deriveFields(tables, picked)`, `groupByFor(selected)`. New builder features are additive options on the same input type (`aggregates`, `joinTypes`, `limit`). The Preview button runs through the existing `ipc.executeSql(..., maxRows 100)`.
7. **Paged reads.** Rust: `fs_read_table(path, offset, limit)` skips `offset` records via the csv reader (no full materialisation), `limit` clamped to 10_000; `fs_count_rows(path)` streams once and returns the count (cached per path+mtime in the frontend). Parquet: row-group aware offset. `TablePreview` gains `offset` and `hasMore`. Alternative rejected: read everything once and page client-side — that is the hang.
8. **Text-open guard.** `open-file.ts` (pure): `routeOpen({name, size})` → `"text" | "preview" | "preview-with-edit-warning" | "refuse"`. Tabular ext & > 1 MB → preview; any file > 2 MB → preview if tabular else refuse with size; the Monaco path is unchanged for small files. `FileExplorer.openPath` reports failures via the existing toast.
9. **Per-tab isolation.** `TabErrorBoundary` (class component, ~60 lines) wraps `renderTabBody` in `ExasolStudio.tsx`; on error it shows the message, a "Copy details" and "Close tab" button, and logs to the console. `ipcWithTimeout(promise, 60_000)` wraps tab-originated invokes; on timeout the tab shows "Still working — the database or sidecar has not answered in 60 s" with a Cancel that abandons the promise (the Rust side keeps running; that is acceptable and stated).
10. **Git diff cap.** `git_diff` runs `git diff --stat` first; if the sum of changed bytes (`--numstat` lines × avg) or the resulting diff exceeds 1 MB, return the stat with `truncated: true` and the largest files listed. Tested: cap boundary, binary files, zero changes.
11. **Completion and next actions are deterministic.** `completeDraft(draft, {commands, tables, recent})` → `{suggestion, kind} | null`: leading `/` → best `filterCommands`; a `@` token → catalog names ranked by prefix then fuzzy (`fuzzyScore` already exists in Visualizer — move it to `lib/fuzzy.ts`); else the most recent prompt that starts with the draft (≥ 3 chars). `suggestNextActions(reply, ctx)` → up to 3 `{label, action}` from detectors on the reply text: a SQL fence → run/open/explain; a table list (`schema.table` tokens present in the catalog) → visualize; a markdown table with a date-like first column → chart / dashboard; an error → "Fix it"; otherwise `[]`. No model call; both functions have fixtures from real replies in `evals/`.

## Risks / Trade-offs

- Splitting `Visualizer.tsx` and `Marketplace.tsx` is the largest diff; mitigated by moving code verbatim first (tsc + vite build green), then changing behaviour in separate commits.
- Inference false positives on schemas with generic `ID` everywhere — the type gate and the ambiguity penalty exist for this; the slider is the escape hatch.
- Paged Parquet offsets are row-group granular; the pager rounds to the containing row group and states it.
- Soft IPC timeouts cannot cancel Rust work; the UI stops waiting, the command finishes in the background. Stated in the UI text.
