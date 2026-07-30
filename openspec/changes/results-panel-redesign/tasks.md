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
- [x] `ResultsPanel.tsx` Results view (`ResultsView`): filter box + Export CSV +
      collapsible right-hand inspector (Cell Value / Query Statistics /
      Query SQL) using the helpers above. Reuses `ResultsGrid` for the table.
- [x] `HistoryDock.tsx` `ResultsGrid`: optional `filterQuery`, `onCellClick`,
      `selected`, `hideToolbar` — no regression for existing callers. Edit
      (double-click) is disabled while a filter is active (edit addresses
      unfiltered rows); selection clears on filter change (Codex findings).

## Part 4 — Query Performance Plan view ✅ DONE (rebuilt as an exact exasol-vscode port)
- [x] Superseded the earlier recommendations view: the Query Performance tab is
      now a faithful port of the exasol-labs/exasol-vscode plan tab (user asked
      for "exactly like vscode, no dashboard nothing"). Removed the old
      `QueryProfileView.tsx` and `lib/query-plan.ts`.
- [x] `lib/plan-model.ts` (pure, 11 tests): operator taxonomy + traits,
      per-node collapse (IPROC), system-step-aware cost %, warnings
      (spill / large-redistribution / row-skew / duration-straggler), and
      `normalizeProfileRows` — ported 1:1 from the vscode plan module.
- [x] `lib/plan-format.ts` (pure, 17 tests): badges/colors, formatters,
      category breakdown, hottest node, sorted warnings, scan selectivity,
      and a plain-text `buildPlanText` export.
- [x] `profileQuery` (ExasolStudio): fetches the per-node detail view
      (`$EXA_PROFILE_DETAILS_LAST_DAY`, IPROC) richest-first, falls back to
      `EXA_USER_PROFILE_LAST_DAY`, builds a `Plan`; per-node skew warnings now
      fire. Tab carries `planData` (was `profileData`).
- [x] `QueryPlanView.tsx`: horizontal operator flow (cost rings, connector
      arrows with row counts, wrapping), click popovers (full metric set),
      right rail (Warnings summary→jump, Profile overview, Time-by-category
      bar, Legend), Query-text toggle + Copy-as-text. Codex-reviewed; fixed the
      popover viewport-clamp (flips above / caps height near the screen edge).

## Part 5 — Dashboards as tabs ✅ DONE
- [x] `tabs.ts`: new TabView `"dashboard"` + `SqlTab.dashboardId` + icon.
- [x] `ExasolStudio.tsx`: `openDashboardTab(id, title?)` opens/focuses a tab
      (dedupe by dashboardId); render branch for `view === "dashboard"` →
      `<DashboardTab onClose={closeTab} />`; `"dashboard"` added to the
      special-tab (no SQL toolbar) guard. `openSavedDashboard` (agent path) and
      both `sendResultToDashboard` opens now call `openDashboardTab`.
- [x] `Dashboards.tsx`: `DashboardsTab` gained `onOpenDashboard`; an `openDash`
      helper routes every open (cards, new-dashboard, seed-System) to a tab
      when wired, else the inline path (standalone). New exported `DashboardTab`
      loads a dashboard by id → `DashboardView` (loading/error states).
- [x] Retired `lib/dashboard-bus.ts` (the tab model replaces the open-in-list
      race it worked around); removed all usages.

## Cross-cutting
- [ ] `pnpm test` green (new *.test.ts files auto-discovered).
- [ ] Codex review the diff; apply valid findings before commit.
- [ ] Build + bundle; verify in the app; no emoji, theme-safe CSS.
