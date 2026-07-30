# Tasks

Legend: [ ] todo · [x] done. Each logic task names its test file.

## Part 1 — Lock System dashboards (ship first, contained) ✅ DONE
- [x] `Dashboards.tsx`: derive `locked = dash.group === "System"`; hide the
      dashboard-delete `Trash2` (read-only chip instead) for system dashboards.
- [x] `Dashboards.tsx` `DashboardView`/`Panel`: `locked` prop hides panel
      viz-switcher/resize/edit/delete + add-panel + History; disables grid
      drag/resize; no-ops `persistLayout` and `saveDash` (the mutation choke
      point); auto-refresh shown as a static badge; "System · read-only" chip.
- [x] Store guard: `dashboards.delete()`, `save()` and `rollback()` refuse an
      existing `group:"System"` dashboard (blank-id seeding still works).
      Tests: `packages/agent-core/src/dashboards.test.ts` — remove-refusal,
      overwrite-refusal, seeding, rollback no-op, user dashboard still mutable.

## Part 2 — Result actions become tabs ✅ DONE
- [x] Extracted the result area into `components/studio/ResultsPanel.tsx`
      (ExasolStudio.tsx 3232 → 3129). Tab strip
      `Results | Query Performance | Show in Dashboard`; errors render in the
      Results grid (dropped the separate "messages" tab). `resultTab` →
      `resultView`. Query Performance renders the plan inline (empty-state →
      "Profile this query"); `profileQuery` now patches the current tab's
      `profileData` instead of spawning a "profile" tab (removed that TabView).
      Show in Dashboard empty-state → `sendResultToDashboard` (full
      dashboard-as-tab is Part 5). Removed dead `onChart`/`onProfile` from
      `ResultsGrid`.

## Part 3 — Results tab enrichment + pure helpers (core done)
- [x] `lib/result-stats.ts`: `filterRows`, `toCsv`, `computeStats`, `cellText`.
      Tests `lib/result-stats.test.ts` — empty rows, NULL cells,
      commas/quotes/newlines in CSV, 0ms/0-row divide-by-zero, negative clamp.
- [ ] `ResultsPanel.tsx` Results view: filter box + Export CSV + right-hand
      side panel (Cell Value inspector / Query Statistics / Query SQL) using the
      helpers above. Reuse `ResultsGrid` for the table body; add `onCellClick`.
- [ ] `HistoryDock.tsx` `ResultsGrid`: add optional `onCellClick(value)` and a
      `highlight` filter without regressing existing callers.

## Part 4 — Query Performance Plan view
- [ ] New `features/workbench/QueryPlanView.tsx`: render ordered profile parts
      as a plan (name, IN/OUT rows, duration, %-of-wall bar, remarks). Fed by
      existing `ProfileData`. Test: `features/workbench/QueryPlanView` logic
      (part-ordering / %-of-wall) extracted to `query-plan.ts` +
      `query-plan.test.ts`.

## Part 5 — Dashboards as tabs
- [ ] Add TabView `"dashboard"` + `dashboardId`; clicking a dashboard card or
      "Show in Dashboard" opens/focuses that tab rendering `DashboardView`.

## Cross-cutting
- [ ] `pnpm test` green (new *.test.ts files auto-discovered).
- [ ] Codex review the diff; apply valid findings before commit.
- [ ] Build + bundle; verify in the app; no emoji, theme-safe CSS.
