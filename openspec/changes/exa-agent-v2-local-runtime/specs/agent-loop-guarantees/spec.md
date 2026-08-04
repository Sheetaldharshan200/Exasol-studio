## Purpose

The agent loop is bounded, observable, and type-safe: it always terminates for a stated reason, streams what it is doing as typed events, and validates structured outputs against schemas (the production-engineering ideas evaluated from Brockley, implemented in exa-agent).

## ADDED Requirements

### Requirement: Five-layer bounded execution
Every agent run SHALL terminate via one of: max iterations, max total tool calls, per-iteration tool limit, wall-clock timeout, or stuck detection (no progress across consecutive iterations triggers one reflection, then stop). The termination reason SHALL be reported to the user.

#### Scenario: Stuck loop
- **WHEN** two consecutive iterations produce no new tool results or content
- **THEN** the agent reflects once, and if still stuck, stops and says why

### Requirement: Typed progress events
The loop SHALL emit typed events (iteration start, tool call start/result, evaluation, reflection, completion, termination) that the chat UI renders live; events are also written to the session log for later inspection.

#### Scenario: Live tool card
- **WHEN** the agent calls a tool
- **THEN** the panel shows a live card with the tool name and streaming status before the result arrives

### Requirement: Schema-validated structured output
When a step declares an output schema, the loop SHALL validate the model's output against it and re-prompt once on mismatch before failing with the validation error.

#### Scenario: Malformed structured answer
- **WHEN** the model returns JSON missing a required field
- **THEN** one repair attempt is made; a second failure surfaces the schema error verbatim
