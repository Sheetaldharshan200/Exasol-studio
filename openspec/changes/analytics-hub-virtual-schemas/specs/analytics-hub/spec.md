# Spec Delta

## Purpose
Attached sources are first-class in Studio: virtual schemas appear next to local schemas in the database dropdown, the sidebar and the visualizer, are marked as virtual with their source, open in tabs like everything else, and are queried exactly like local schemas.

## ADDED Requirements

### Requirement: The database dropdown is a door to adding a source
The database dropdown SHALL offer "Add a data source…" which opens the add-data-source tab bound to the active database.

#### Scenario: from the dropdown
- **WHEN** the user opens the database dropdown and chooses "Add a data source…"
- **THEN** a new workbench tab opens with the flow at its first step for the active database, and the dropdown closes

### Requirement: The visualizer offers to add a source
The visualizer's schema picker SHALL show an add tile that opens the add-data-source tab for the visualized database, and SHALL show a newly created virtual schema without the user reopening the visualizer.

#### Scenario: after creating a schema from the visualizer
- **WHEN** the flow reports success for a schema on the visualized database
- **THEN** the schema appears in the visualizer's picker within the same session and can be diagrammed

### Requirement: Virtual schemas are visibly virtual and otherwise ordinary
Wherever schemas are listed, a virtual schema SHALL carry a distinct mark and the name of its source, and SHALL be browsable and queryable exactly like a local schema; a query joining a local and a virtual schema SHALL run through the normal execute path with no special mode.

#### Scenario: joining local and remote
- **WHEN** the user runs `SELECT … FROM LOCAL.T JOIN PG_ORDERS.ORDERS …` where `PG_ORDERS` is a virtual schema
- **THEN** the result renders in the results grid like any other query, with no additional step

#### Scenario: the sidebar shows the source
- **WHEN** a virtual schema attached to PostgreSQL is listed in the sidebar
- **THEN** it is marked virtual and shows "PostgreSQL" as its source

### Requirement: Attached sources can be refreshed and detached
A virtual schema SHALL offer refresh (re-read remote metadata) and drop, each approval-gated, from the same places local schemas offer their actions.

#### Scenario: dropping an attached source
- **WHEN** the user drops a virtual schema
- **THEN** the schema is removed after confirmation, its connection object is left in place unless the user also chooses to remove it, and no remote data is touched
