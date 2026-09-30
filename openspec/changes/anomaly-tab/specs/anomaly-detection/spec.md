## ADDED Requirements

### Requirement: Decisions run on this machine through a Studio-managed engine
The Anomalies tab SHALL answer typed questions about rows through a local decision-model daemon that Studio installs from the Marketplace and starts itself when it is not running. A daemon already running SHALL be adopted rather than started again. No row SHALL leave the machine.

#### Scenario: The engine is not installed
- **WHEN** the tab opens and no engine binary is found in Studio's bin directory or on PATH
- **THEN** the tab says so and offers the engine's Marketplace item; nothing else is offered

#### Scenario: The engine is installed but not running
- **WHEN** a decision run starts and nothing answers on the engine's port
- **THEN** Studio starts the daemon, waits for it to answer, and runs; the daemon is stopped when Studio exits

#### Scenario: A daemon started outside Studio
- **WHEN** something already answers on the engine's port
- **THEN** Studio uses it and starts nothing

### Requirement: Models are pulled by name through the engine's own tool
Models SHALL be pulled through the engine's command, streamed to the log, and a model name SHALL be one `name[:tag]` of lowercase letters, digits, dots, dashes and underscores before it reaches a command or a request.

#### Scenario: A malformed model name
- **WHEN** a model name contains a space, a slash or a quote
- **THEN** nothing is run and the name is refused

### Requirement: Every row is one state, every question typed
Each row SHALL be sent as an object of column name to value, with the questions as typed `noul`, `choice` or `score` entries with instructions and, for choice and score, criteria. Answers SHALL be shown per row with their probability, and a failure SHALL name the row.

#### Scenario: A choice question with too few options
- **WHEN** a choice question has fewer than two options
- **THEN** the run does not start and the editor marks the question

#### Scenario: One row fails
- **WHEN** the engine rejects the state of one row
- **THEN** the error names that row and the rows already answered keep their answers

### Requirement: Any decision can flag, and the flag is a number the person sets
A flag value in [0, 1] SHALL be derived from every answer type — a yes/no probability, a score's expected level scaled to its range, a choice's probability of not being its first option — and the person SHALL choose which decision flags and at which threshold. Flagged rows SHALL sort first and be counted, and the result SHALL be exportable as CSV.

#### Scenario: Threshold changes
- **WHEN** the threshold moves
- **THEN** the flagged count and order update without re-running the model

### Requirement: The tab writes nothing to the database
The Anomalies tab SHALL run only the person's SELECT for its source and SHALL NOT create, alter or write any database object.

#### Scenario: Exporting results
- **WHEN** results are exported
- **THEN** a CSV file is produced and the database is untouched
