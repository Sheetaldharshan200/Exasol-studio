# Results panel + dashboards redesign

## Why
The SQL result experience lags the exasol-vscode reference: result actions are
loose buttons ("Add to dashboard", "Performance"), there's no in-grid search or
CSV export, no cell-value inspector or query statistics, the query-performance
profile opens as a separate tab instead of a Plan view beside the results, and
System dashboards can be deleted/edited by accident.

## What changes
1. **Lock System dashboards.** Panels in `group: "System"` dashboards (and the
   dashboards themselves) cannot be deleted or edited; the delete/edit/add
   affordances are hidden for them. User dashboards stay fully editable.
2. **Result actions become horizontal tabs.** The result area shows tabs
   **Results | Query Performance | Show in Dashboard** instead of buttons.
3. **Richer Results grid.** A "Filter results…" search box, an **Export CSV**
   button, and a right side panel with **Cell Value** (click a cell to inspect
   its full value), **Query Statistics** (Time ms, Rows, Cols, Throughput row/s,
   Avg/Row ms) and the **Query** (SQL + run timestamp).
4. **Query Performance = a Plan view** (exasol-vscode style) built from Exasol
   profiling (`EXA_USER_PROFILE_LAST_DAY` parts; Exasol has no `EXPLAIN`).
5. **Dashboards open as tabs.** Clicking a dashboard opens it in a workbench
   tab bound to its query, rather than only inside the BI surface.

## Non-goals
- No new charting library or viz types (reuse ShadcnChartPanel/ECharts).
- No real `EXPLAIN` — the Plan is derived from profiling parts only.
- No server/schema changes; result stats are computed client-side from the
  existing `ExecuteResponse` (rows, columns, elapsedMs).
- No change to how results are fetched/paginated.

## Files touched (KISS size note — split, don't grow)
- `apps/desktop/src/components/studio/ExasolStudio.tsx` (3,232 lines — already
  near the limit): only WIRING changes (tab state, open-dashboard-as-tab). New
  UI is EXTRACTED, not added here.
- `apps/desktop/src/features/bi/Dashboards.tsx` (2,003 lines — over 1,000):
  add a `locked` path for System dashboards; do not grow materially.
- `apps/desktop/src/components/studio/HistoryDock.tsx` (697 lines): `ResultsGrid`
  gains filter + CSV + cell-select callback, OR is superseded by a new
  `ResultsPanel`.
- New: `apps/desktop/src/features/workbench/ResultsPanel.tsx` (tabs + grid +
  side panel), `apps/desktop/src/features/workbench/result-stats.ts` (pure
  stats/CSV helpers, unit-tested), `apps/desktop/src/features/workbench/QueryPlanView.tsx`
  (Plan from profile parts).
- `apps/desktop/src/features/workbench/QueryProfileView.tsx` (270): feeds the
  Plan view.
