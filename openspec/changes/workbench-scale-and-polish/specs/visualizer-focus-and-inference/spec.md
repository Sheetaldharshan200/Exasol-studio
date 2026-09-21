# Spec Delta

## Purpose
Clicking a table in the schema diagram brings it and its neighbours into view; clicking away returns to the overview; inferred relationships are scored and type-checked instead of guessed by exact name.

## ADDED Requirements

### Requirement: Click to focus, click away to overview
Clicking a table node SHALL animate the viewport to fit that table and its directly linked tables (`focusBounds`, pure); clicking the empty canvas or pressing Escape SHALL animate back to fit all tables. Double-click SHALL keep its current meaning (pick for the builder).

#### Scenario: Table with neighbours
- **WHEN** the user clicks a table linked to three others
- **THEN** the viewport animates so all four are visible with padding, zoom derived from their bounds

#### Scenario: Isolated table
- **WHEN** the clicked table has no links
- **THEN** the viewport centres on it at a zoom that shows the whole node

#### Scenario: Back to overview
- **WHEN** the user clicks empty canvas or presses Escape
- **THEN** the viewport animates to fit every table

### Requirement: Scored relationship inference
`inferLinks(tables, {minScore})` SHALL return candidate links with a score in [0, 1] and a reason, applying in order: exact PK-name match (1.0), `<PARENT>_ID` / `<SINGULAR>_ID` / `<PARENT>ID` convention (0.9), normalised-name match after stripping `FK_`, `REF_`, `_FK`, `_KEY`, `_NO`, `_NUM`, underscores and case (0.7). Every candidate SHALL require type-family compatibility and a parent column that is a primary key or unique.

#### Scenario: Convention match
- **WHEN** `ORDERS.CUSTOMER_ID DECIMAL(18,0)` and `CUSTOMERS.ID DECIMAL(18,0)` is a PK
- **THEN** a link ORDERS.CUSTOMER_ID → CUSTOMERS.ID with score 0.9 is returned

#### Scenario: Type gate
- **WHEN** `EVENTS.ID VARCHAR(36)` and `USERS.ID DECIMAL(18,0)` is a PK
- **THEN** no link is inferred between them

#### Scenario: Ambiguity penalty
- **WHEN** a child column matches PKs of two different parents
- **THEN** both candidates are returned with their score halved and marked ambiguous, and are hidden below the default threshold

#### Scenario: Declared keys win
- **WHEN** a declared foreign key already covers a pair
- **THEN** no inferred duplicate is emitted for that pair

### Requirement: Confidence is visible
Inferred edges SHALL show their score in the edge label (e.g. `≈ 0.9`) and the toggles row SHALL offer a minimum-confidence slider (default 0.6).

#### Scenario: Slider hides weak links
- **WHEN** the slider is set to 0.8
- **THEN** edges scored below 0.8 are not rendered and the count of hidden links is shown
