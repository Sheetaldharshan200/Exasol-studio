## Purpose

The Exa sidepanel adopts the continue.dev interaction grammar — sessions, context providers, tool-call cards, per-session models, interruption — rendered in Studio's own design system.

## ADDED Requirements

### Requirement: Session-first panel
The panel SHALL open on the current session with a one-tap session switcher (history list with titles, relative times, model used), new-session action, and per-session model picker in the composer.

#### Scenario: Resume yesterday's session
- **WHEN** the user opens the session list and picks an older session
- **THEN** its full transcript, context, and model selection are restored

### Requirement: @ context providers
Typing `@` in the composer SHALL offer Studio-native context providers — schema, table (with column summary), the current editor selection/statement, a past query result, a file — inserting a referenced context chip the agent receives as grounded content.

#### Scenario: Table context
- **WHEN** the user attaches @table TESTLAB.CUSTOMERS and asks for a query
- **THEN** the agent answers using that table's real columns without re-discovering them

### Requirement: Tool-call cards and interruption
Tool calls SHALL render as collapsible cards (name, arguments, result preview, duration, error state); generation SHALL be interruptible at any point, preserving the partial transcript.

#### Scenario: Stop mid-run
- **WHEN** the user hits stop while tools are running
- **THEN** the run halts, completed tool cards remain, and the partial answer is kept in the session

### Requirement: Apply-to-editor with review
Code the agent proposes SHALL offer apply actions that go through the existing diff review (InlineSqlDiff) rather than overwriting the editor directly.

#### Scenario: Apply SQL suggestion
- **WHEN** the user clicks apply on a suggested SQL block
- **THEN** the editor shows the reviewable diff; nothing changes until accepted
