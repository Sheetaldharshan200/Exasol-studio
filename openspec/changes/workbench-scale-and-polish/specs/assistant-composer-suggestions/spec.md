# Spec Delta

## Purpose
The chat composer completes what the user is typing and, after each answer, proposes the obvious next steps — without an extra model call.

## ADDED Requirements

### Requirement: Inline completion
`completeDraft(draft, sources)` SHALL return a single ghost-text suggestion: for a leading `/` the best slash command, for an `@` token the best catalog name (schema, table, `schema.table`), otherwise the most recent prompt that starts with the draft (draft ≥ 3 characters). Tab accepts; Escape dismisses; the suggestion never submits.

#### Scenario: Table mention
- **WHEN** the draft ends with `@cust` and the catalog has `RETAIL.CUSTOMERS`
- **THEN** the ghost text completes to `@RETAIL.CUSTOMERS`

#### Scenario: Recent prompt
- **WHEN** the draft is `show rev` and a recent prompt was `show revenue by city for 2025`
- **THEN** that prompt is suggested as ghost text

#### Scenario: Nothing to suggest
- **WHEN** no source matches
- **THEN** no ghost text is shown and typing is unaffected

### Requirement: Next-action chips
After an assistant reply, `suggestNextActions(reply, context)` SHALL return up to three deterministic actions derived from the reply: a SQL block → Run / Open in editor / Explain the plan; table references → Visualize; a time-series table → Chart it / Add to a dashboard; an error → Fix it. Clicking a chip performs the action through the existing studio action bridge.

#### Scenario: Reply with SQL
- **WHEN** the reply contains a ```sql fence
- **THEN** the chips are "Run it", "Open in editor", "Explain the plan"

#### Scenario: Plain prose
- **WHEN** the reply has no SQL, tables, series or error
- **THEN** no chips are shown
