# Spec Delta

## Purpose
The Build pane generates correct SQL from picked tables and columns quickly, with aggregates, join types and an in-pane preview, from a pure, tested builder.

## ADDED Requirements

### Requirement: Pure SQL builder
`buildSql(input)` in `workbench/visualizer/build-sql.ts` SHALL produce the SELECT from picked columns, links (join type per link), WHERE (react-querybuilder rule group), aggregates with an automatic GROUP BY, ORDER BY and LIMIT, quoting every identifier and preserving Exasol case-folding.

#### Scenario: Aggregate adds GROUP BY
- **WHEN** `REVENUE` is picked with SUM and `CITY` is picked plain
- **THEN** the SQL is `SELECT "CITY", SUM("REVENUE") … GROUP BY "CITY"`

#### Scenario: Join type per link
- **WHEN** the ORDERS→CUSTOMERS link is set to LEFT
- **THEN** the SQL uses `LEFT JOIN "CUSTOMERS" ON …` for that link and INNER for the others

#### Scenario: Lower-case identifiers stay quoted
- **WHEN** a picked column is `tpep_pickup_datetime`
- **THEN** it appears as `"tpep_pickup_datetime"` and never folded to upper case

### Requirement: Builder performance
Fields and column lists SHALL be memoised per picked-table set, column pickers SHALL virtualise above 60 rows, and the SQL preview SHALL be debounced (150 ms).

#### Scenario: Wide table
- **WHEN** a picked table has 400 columns
- **THEN** opening its picker renders only the visible rows and typing in the WHERE builder does not re-derive fields

### Requirement: Preview in the pane
The Build pane SHALL offer "Preview 100 rows" that runs the generated SQL with `maxRows = 100` and shows the grid below the SQL, reporting errors inline.

#### Scenario: Preview error
- **WHEN** the generated SQL fails
- **THEN** the database error is shown under the SQL and nothing else in the visualizer changes
