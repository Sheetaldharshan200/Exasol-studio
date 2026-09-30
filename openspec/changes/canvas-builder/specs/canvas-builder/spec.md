## ADDED Requirements

### Requirement: Every box is a real result set and every arrow says where it came from
The Visualizer's Build mode SHALL be an infinite canvas of boxes. A box SHALL be a stored table, a SQL step on other boxes, or a chart on a box. Arrows SHALL be derived from each box's sources, never stored separately, and SHALL carry a marker naming the relationship.

#### Scenario: A table is opened from the explorer
- **WHEN** a table is clicked in the explorer
- **THEN** a table box appears showing its columns, types and first rows, placed without overlapping any existing box

#### Scenario: A query is built on a table
- **WHEN** *Query with SQL* is pressed on a table box
- **THEN** a query box appears flush right of it, seeded with `SELECT * FROM derived_table`, with an arrow marked `SQL` from the table to the query

### Requirement: SQL steps chain and refresh downstream
`derived_table` and named sources in a query box SHALL resolve to their source boxes as CTEs. Running a box SHALL mark boxes built on it stale and re-run them.

#### Scenario: An early step changes
- **WHEN** the SQL of a query box that feeds a chart is edited and run
- **THEN** the chart's data is re-run from the new step and the chart redraws

### Requirement: A chart carries its evidence
A chart box SHALL show, on request, the lineage it was built from: the source table, each SQL step in order, and the field mapping, with the compiled SQL copyable.

#### Scenario: Evidence
- **WHEN** *Evidence* is pressed on a chart built on a query on a table
- **THEN** the box lists the table, the query's SQL and the chart mapping (by, measure), and *Copy SQL* copies the compiled statement

### Requirement: The rows behind a selection are one press away
Selecting marks on a chart SHALL enable *Show the rows behind the selection*, which opens a query box filtered to the selected categories, arrowed `≡` from the chart.

#### Scenario: Two bars selected
- **WHEN** two categories are selected on a bar chart of `region`
- **THEN** a query box appears with `WHERE "region" IN (...)` over the chart's source, and its rows are shown

### Requirement: The canvas never waits on the database
A box whose rows have not arrived SHALL show a placeholder with its identity, never an empty grid; errors SHALL be shown in the box.

#### Scenario: A slow query
- **WHEN** a query box is run and the database takes seconds
- **THEN** the box shows a running state and the rest of the canvas stays interactive

### Requirement: The agent can add to the canvas
Pressing *Ask* SHALL open the assistant with the canvas as context, and a ```canvas fence in the agent's answer SHALL render as an *Add to canvas* card that adds its query and chart boxes to the open canvas.

#### Scenario: Agent proposes a chart
- **WHEN** the agent answers with a canvas fence naming a query on a table box and a chart on that query
- **THEN** pressing *Add to canvas* creates both boxes, arrows included, and runs them

### Requirement: The canvas is kept per connection
The layout and boxes SHALL be saved per connection and restored when the Visualizer's Build mode opens again; results SHALL be re-run, not stored.

#### Scenario: Reopen
- **WHEN** Studio restarts and the Build mode opens for the same connection
- **THEN** the boxes are where they were, with placeholders until they run
