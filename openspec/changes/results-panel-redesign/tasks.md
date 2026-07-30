# Tasks

Legend: [ ] todo · [x] done. Each logic task names its test file.

## Part 1 — Lock System dashboards (ship first, contained)
- [ ] `Dashboards.tsx`: derive `isSystem = d.group === "System"`; hide the
      dashboard-delete `Trash2` in BOTH list grids for system dashboards.
- [ ] `Dashboards.tsx` `DashboardView`/`Panel`: add `locked` prop; when the open
      dashboard is System, hide panel edit + delete + add-panel and skip layout
      persistence; show a "System · read-only" chip.
- [ ] Store guard: `dashboards.remove` / panel-save refuse a `group:"System"`
      dashboard. Test: `apps/desktop/src/lib/agent-client.test.ts` (or the
      dashboards store module's `*.test.ts`) covers remove-refusal + a
      normal user dashboard still deletable.

## Part 2 — Result actions become tabs
- [ ] ExasolStudio: replace the results button row with a tab strip
      `Results | Query Performance | Show in Dashboard`; keep "messages" as an
      error state of Results. Wire Query Performance → inline profile; Show in
      Dashboard → sendResultToDashboard + open dashboard tab.

## Part 3 — ResultsPanel (extracted) + pure helpers
- [ ] New `features/workbench/result-stats.ts`: `filterRows`, `toCsv`,
      `computeStats`. Test: `features/workbench/result-stats.test.ts` — cover
      empty rows, NULL cells, commas/quotes/newlines in CSV, 0ms/0-row
      divide-by-zero, unicode, and Exasol UPPERCASE column names.
- [ ] New `features/workbench/ResultsPanel.tsx`: filter box + row count +
      Export CSV + grid + right side panel (Cell Value / Query Statistics /
      Query). Reuse `ResultsGrid` for the table body; add an `onCellClick`.
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
