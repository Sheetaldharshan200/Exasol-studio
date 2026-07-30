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

## Part 4 — Query Performance Plan view ✅ DONE
- [x] The existing `QueryProfileView` already renders the exasol-vscode-style
      plan (wall-time totals, measured bottlenecks + recommendations, per-step
      %-of-wall bars, full engine-parts table), and Part 2 now shows it INLINE
      in the Query Performance tab. Per the decision, the visual view is kept
      and its pure math was extracted + tested rather than rebuilt:
- [x] `lib/query-plan.ts`: `partsDurationSum`, `planDenominator`,
      `computePlanRows` (share-of-wall), `analyze` (measured bottlenecks +
      advice), `fmt`, and the `ProfilePart`/`ProfileData` types.
      `QueryProfileView` (271 → 129 lines) imports them and re-exports the
      types. Tests `lib/query-plan.test.ts` (12): null durations, wall-vs-sum
      denominator, divide-by-zero share, and each analyze branch
      (slowest-step, selective scan, join fan-out, net, disk, index remark,
      reassuring note).

## Part 5 — Dashboards as tabs
- [ ] Add TabView `"dashboard"` + `dashboardId`; clicking a dashboard card or
      "Show in Dashboard" opens/focuses that tab rendering `DashboardView`.

## Cross-cutting
- [ ] `pnpm test` green (new *.test.ts files auto-discovered).
- [ ] Codex review the diff; apply valid findings before commit.
- [ ] Build + bundle; verify in the app; no emoji, theme-safe CSS.
