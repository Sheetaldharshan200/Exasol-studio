## Purpose
The dashboard canvas is Studio's freeform, presentation-grade surface: a declarative document
of widgets — text, charts, KPIs, tables, filters — that a user reads and rearranges, and that
the exa assistant authors and edits by patching the document rather than the screen.

## ADDED Requirements

### Requirement: A dashboard is a declarative document
A dashboard SHALL be a single declarative document holding a title, a theme, a set of named
parameters, and an ordered list of widgets; every widget SHALL carry an id, a type, a grid
layout (x, y, w, h), an optional style, type-specific props, and an optional query. Rendering
SHALL be a pure function of the document, so the same document always produces the same
dashboard.

#### Scenario: The document renders deterministically
- **WHEN** a dashboard document is opened on two machines with the same connected data
- **THEN** both render the same widgets in the same positions with the same styling

#### Scenario: An unknown widget type does not break the dashboard
- **WHEN** a document contains a widget whose type is not in the registry
- **THEN** that widget shows an "unsupported widget" placeholder and every other widget renders normally

### Requirement: Open, extensible widget registry
The set of widget types SHALL be an open registry — at minimum markdown/text, chart, KPI, table,
filter, and search — such that a new type is added by registering a renderer without changing the
document model or a fixed enumeration. A text widget SHALL accept free-form user text.

#### Scenario: Adding a text box
- **WHEN** the user adds a text widget and types into it
- **THEN** the text is stored in the document and shown on the dashboard

#### Scenario: The author is not restricted to a preset list
- **WHEN** a widget type is registered
- **THEN** it becomes available to add without any change to the document schema

### Requirement: Freeform layout with drag, resize, and styling
Widgets SHALL be positioned on a grid the user can rearrange by dragging and resizing, and the
dashboard and its widgets SHALL support color/theme styling. Layout and style changes SHALL
persist with the document.

#### Scenario: Rearranging persists
- **WHEN** the user drags a widget to a new position and resizes it, then reopens the dashboard
- **THEN** the widget is at the new position and size

#### Scenario: Theme applies
- **WHEN** the user sets an accent color on the dashboard
- **THEN** the styled widgets reflect that color and the choice persists

### Requirement: Parameters, cross-filtering, and drill-down
A dashboard SHALL support named parameters that filter and search widgets write to; any widget
query referencing a parameter SHALL re-run when the parameter changes. A user SHALL be able to
drill down from a value in one widget into a filtered view.

#### Scenario: A filter cross-filters the dashboard
- **WHEN** the user selects a value in a filter widget bound to a parameter that other widgets' queries reference
- **THEN** those widgets re-run with the new parameter value and update

#### Scenario: Drill-down from a data point
- **WHEN** the user drills down on a chart value
- **THEN** a filtered view scoped to that value is shown

### Requirement: The assistant authors and edits by patch
The exa assistant SHALL create and modify a dashboard by issuing document operations — create,
add a widget, set a widget's layout, set a parameter, restyle — that apply to the document; it
SHALL NOT manipulate rendered DOM. An operation naming an unknown widget or target SHALL fail
with a message and leave the document unchanged.

#### Scenario: The assistant adds a widget on request
- **WHEN** the user asks the assistant to add a bar chart of sales by region
- **THEN** a chart widget with that query appears on the dashboard and is saved

#### Scenario: A bad operation is rejected cleanly
- **WHEN** the assistant issues an operation targeting a widget id that does not exist
- **THEN** the operation is rejected with a message and the dashboard is unchanged

### Requirement: Developer SQL is available, users see the narrative
Each query-backed widget SHALL keep its SQL available to a developer on demand while presenting
only the result (chart, KPI, table) by default, so a non-developer reads narrative and visuals
without SQL.

#### Scenario: Revealing a widget's query
- **WHEN** a developer opens "Show query" on a widget
- **THEN** the widget's SQL is shown and remains editable

### Requirement: Dashboards persist and survive shutdown
A dashboard SHALL be saved to disk with its last successful widget results cached; on reopen it
SHALL restore identically and show the cached results immediately before any refresh.

#### Scenario: Reopen after shutdown
- **WHEN** the user closes the app and reopens a saved dashboard
- **THEN** the dashboard appears identical and shows its last results without waiting for queries to re-run

#### Scenario: First open with no cache
- **WHEN** a dashboard has no cached results yet
- **THEN** its widgets show a loading state and populate as queries return
