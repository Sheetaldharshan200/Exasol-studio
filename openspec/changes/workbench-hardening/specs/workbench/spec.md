## ADDED Requirements

### Requirement: Credentials never leave the process in the clear
Studio SHALL write saved passwords to the OS keychain through the platform API, never as a command-line argument or script text, and SHALL NOT write a password to its own files unless it is encrypted with the vault key.

#### Scenario: Saving a password without a vault
- **WHEN** a connection is saved with a password and no master password is set
- **THEN** the password is stored only in the OS keychain and `connections.json` holds no form of it

#### Scenario: A password with a quote on Windows
- **WHEN** the password contains `'`
- **THEN** it is stored and read back unchanged, and no shell or script is involved

### Requirement: Results are exact and complete
Every page of a result SHALL continue the previous one in the statement's own order; integers SHALL be shown and written back without rounding; timestamps SHALL keep their fractional digits.

#### Scenario: Paging a statement with its own ORDER BY
- **WHEN** a statement with `ORDER BY amount DESC` returns more rows than one page
- **THEN** page 2 starts with the row that follows the last row of page 1, and no row appears twice

#### Scenario: A BIGINT id
- **WHEN** a column holds 9007199254740993
- **THEN** the grid shows 9007199254740993 and an edit on that row matches it

### Requirement: Grid edits change exactly what they show
A grid edit SHALL match NULL key values with IS NULL, SHALL require each statement to affect exactly one row, and SHALL apply the whole batch or none of it.

#### Scenario: One statement matches no row
- **WHEN** a staged UPDATE affects 0 rows
- **THEN** the batch is rolled back, nothing is committed, and the grid names the row that did not match

### Requirement: Work is not lost silently
Closing a tab with unsaved SQL SHALL ask first; a failed save SHALL be reported.

#### Scenario: Close a modified tab
- **WHEN** a tab with unsaved changes is closed
- **THEN** Studio asks to save, discard or cancel

### Requirement: A tab's statements run in one session
All statements, schema changes, commits and rollbacks issued from one SQL tab SHALL run in the same database session, and Stop SHALL not wait for that session to be free.

#### Scenario: OPEN SCHEMA then an unqualified query
- **WHEN** `OPEN SCHEMA RETAIL` runs and then `SELECT * FROM SALES` runs in the same tab
- **THEN** the query reads `RETAIL.SALES`

### Requirement: Every setting on screen is applied
A connection or execution setting shown in the UI SHALL change behaviour, or SHALL NOT be shown.

#### Scenario: Query timeout
- **WHEN** a connection's query timeout is 5 seconds and a statement runs longer
- **THEN** the statement is stopped by the server and the tab says it timed out
