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
  per-link join types. The pane's controls for those are still to come.

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
