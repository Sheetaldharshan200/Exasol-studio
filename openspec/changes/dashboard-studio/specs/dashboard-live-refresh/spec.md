## Purpose
Live refresh keeps a dashboard's data current on its own: a scheduler re-runs widget queries on
an interval the user controls, so a dashboard left on a screen updates without manual re-running.

## ADDED Requirements

### Requirement: Per-dashboard and per-widget auto-refresh
Auto-refresh SHALL be toggleable with a configurable interval at the dashboard level, and a
widget SHALL be able to override with its own interval or opt out. When on, the affected widgets'
queries SHALL re-run on the interval and update in place.

#### Scenario: Turning on dashboard refresh
- **WHEN** the user enables auto-refresh at 30 seconds on a dashboard
- **THEN** every refreshing widget re-runs its query about every 30 seconds and updates

#### Scenario: A widget opts out
- **WHEN** a widget is set to not refresh while the dashboard refreshes
- **THEN** that widget keeps its last result while the others update

### Requirement: Refresh runs while the app is open and resumes on reopen
The refresh schedule SHALL be persisted with the dashboard and re-armed when the app reopens; it
SHALL run only while the app is open. Data SHALL NOT be represented as newer than the last
successful run — each widget SHALL expose when it last refreshed.

#### Scenario: Schedule resumes after reopen
- **WHEN** a dashboard with auto-refresh on is closed and the app is reopened
- **THEN** the dashboard's auto-refresh resumes without the user re-enabling it

#### Scenario: Last-refreshed is visible
- **WHEN** a widget has refreshed
- **THEN** the time of its last successful refresh is available on the widget

### Requirement: A failed refresh does not blank the widget
If a scheduled refresh fails, the widget SHALL keep its last successful result and surface the
error rather than clearing its data.

#### Scenario: Refresh error keeps prior data
- **WHEN** a scheduled query fails (for example the connection is down)
- **THEN** the widget still shows its last successful result and indicates the refresh failed
