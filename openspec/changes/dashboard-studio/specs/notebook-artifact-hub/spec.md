## ADDED Requirements

### Requirement: An assistant dashboard request produces a canvas
When the user asks the exa assistant to create a dashboard, the assistant SHALL produce a
`dashboard-canvas` document — a freeform arrangement of narrative, charts, KPIs, and filters —
rather than a linear notebook. A request to create an analysis notebook SHALL still produce a
linear notebook.

#### Scenario: "Create a dashboard" yields a canvas
- **WHEN** the user asks the assistant to build a dashboard from a schema
- **THEN** a freeform canvas dashboard is created and opened, not a linear cell notebook

#### Scenario: Notebook requests are unaffected
- **WHEN** the user asks the assistant for an analysis notebook
- **THEN** a linear notebook is produced as before

### Requirement: Notebook and canvas share one model and are dual-viewable
The notebook and the dashboard canvas SHALL be two views over one shared block/widget model: the
notebook is the linear, run-order view and the canvas is the freeform view. A document SHALL be
viewable either way without losing its widgets or their results.

#### Scenario: Switching a document between views
- **WHEN** a document authored as a canvas is opened in notebook view
- **THEN** its widgets appear as linear cells with their queries and results intact

#### Scenario: Round-trip preserves content
- **WHEN** the user switches a document from notebook view to canvas view and back
- **THEN** no widget, query, or result is lost
