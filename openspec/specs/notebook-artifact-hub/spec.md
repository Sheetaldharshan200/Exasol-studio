# notebook-artifact-hub Specification

## Purpose
The Notebook is Studio's single surface for analysis artifacts: SQL results, text, diagrams, charts, and KPIs live as cells; dashboards are consumed and authored here; the exa assistant designs and modifies artifacts on request.

## Requirements

### Requirement: Every chart kind is available from a visual picker
A SQL cell SHALL offer every supported visualization — bar, hbar, line, area, pie, donut, radar, radial, scatter, heatmap, funnel, treemap, gauge, and a KPI tile — from a dropdown whose entries are visual tiles (mini-chart art plus the kind's name), and table (the plain grid) SHALL remain the default when no kind is chosen.

#### Scenario: Picking a kind renders the cell as that chart
- **WHEN** the user opens the chart picker on a SQL cell with a result and selects "heatmap"
- **THEN** the cell renders the result as a heatmap and the choice persists with the notebook

#### Scenario: Clearing the kind returns to the grid
- **WHEN** the user selects "table" in the picker
- **THEN** the cell shows the result grid again

### Requirement: Per-cell database choice
A SQL cell SHALL run against a cell-selected connected database, defaulting to the app's active connection when no choice is made; the selected connection SHALL be visible on the cell and persist with the notebook.

#### Scenario: Cell runs on a chosen connection
- **WHEN** two databases are connected and the user sets a cell's connection to the non-active one and runs the cell
- **THEN** the SQL executes against the chosen connection

#### Scenario: Chosen connection is gone
- **WHEN** a cell's stored connection is no longer connected and the cell runs
- **THEN** the cell reports the missing connection instead of silently using another one

### Requirement: Ask exa about a cell
Each cell SHALL have an action that opens the assistant and sends a prompt carrying the cell's SQL and current chart kind, so exa can create or modify the design; the same mechanism SHALL serve any feature that needs to send a prompt to exa.

#### Scenario: Cell design request reaches exa
- **WHEN** the user clicks a cell's "Ask exa" action
- **THEN** the assistant panel is visible and a message containing the cell's SQL has been sent

### Requirement: System dashboards from the notebook
The notebook SHALL show a "System" control at the bottom listing the built-in System dashboards (Query performance, Sessions, Database size); choosing one SHALL open it as an auto-running notebook without deleting or altering the stored System dashboards.

#### Scenario: Opening a System dashboard
- **WHEN** the user picks "Sessions" from the System control
- **THEN** a notebook opens whose cells are the Sessions dashboard's panels and every SQL cell has run

### Requirement: Dashboards activity removed
The Dashboards rail activity and its tabs SHALL no longer exist; agent-saved dashboards SHALL remain importable into the notebook, and the `/v1/dashboards` API SHALL be unchanged.

#### Scenario: Old persisted dashboard tab
- **WHEN** a workspace persisted before this change contains a dashboards tab
- **THEN** the workspace loads without error and without that tab
