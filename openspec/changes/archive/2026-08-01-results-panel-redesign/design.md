# Design

## 1. Lock System dashboards (contained; ship first)
`SYSTEM_DASHBOARDS` are created with `group: "System"`. Add a derived
`isSystem = dashboard.group === "System"` and thread a `locked` boolean down:
- Dashboard list cards: hide the "Delete dashboard" `Trash2` button when
  `d.group === "System"` (both the top grid and the grouped section).
- Open dashboard (`DashboardView`): when `dash.group === "System"`, pass
  `locked` to each `Panel`; the panel hides its edit + delete buttons; the
  "add panel" affordance and layout persistence are disabled. A small "System —
  read-only" chip replaces the actions so it's clear WHY.
- Defense in depth: `dashboards.remove(id)` / panel-mutating saves are guarded
  in the store so a stale event can't delete a system dashboard.

## 2. Result actions → horizontal tabs
ExasolStudio currently has `resultTab: "results" | "messages"` plus loose
`onChart`/`onProfile` buttons. Replace the button row with a tab strip:
**Results · Query Performance · Show in Dashboard** (Messages stays as an
inline state of Results when a statement errors). Selecting "Query Performance"
runs `profileQuery` inline and renders `QueryPlanView` in the same pane (no new
workbench tab). "Show in Dashboard" runs `sendResultToDashboard` and switches to
the BI surface / opens the dashboard tab (part 5).

## 3. Results grid → `ResultsPanel.tsx` (extracted)
New `ResultsPanel` composes: a header (filter box + row count + Export CSV), the
grid, and a collapsible right side panel. Pure logic lives in
`result-stats.ts`:
- `filterRows(rows, columns, query)` — case-insensitive substring across cells.
- `toCsv(columns, rows)` — RFC-4180 quoting (quotes, commas, newlines; NULL → empty).
- `computeStats({rowCount, colCount, elapsedMs})` → `{ timeMs, rows, cols,
  throughputPerSec, avgMsPerRow }` (guard divide-by-zero).
Side panel sections: **Cell Value** (selected cell's full text, copyable),
**Query Statistics** (from computeStats), **Query** (SQL + `HH:MM:SS` run time).
Cell selection is local state in ResultsPanel; clicking a `<td>` sets it.
Export writes via the existing file/save path (Tauri) or a browser Blob
download on web.

## 4. Query Performance Plan view → `QueryPlanView.tsx`
Exasol has no EXPLAIN, so the "Plan" is the profile: `QueryProfileView` already
parses `EXA_USER_PROFILE_LAST_DAY` into ordered `ProfilePart`s. Render them as a
top-down plan (part name, IN/OUT rows, duration, %-of-wall bar, remarks),
exasol-vscode style, inside the Query Performance tab. Reuse ProfileData/parts;
no new backend.

## 5. Dashboards as tabs
Add a workbench tab view `dashboard` carrying a `dashboardId`. Clicking a
dashboard card (or "Show in Dashboard") opens/focuses that tab and renders the
existing `DashboardView` for that id. Keep the BI activity surface as the
gallery; the tab is a bound, openable instance.

## Risks
- ExasolStudio.tsx is at the size limit — all new markup goes in the extracted
  components; ExasolStudio only gains tab state + a couple of handlers.
- CSV/stats must be pure + unit-tested (KISS rule 3).
