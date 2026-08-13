## Purpose

Exa's agent engine is an embedded, version-pinned opencode server: supervised as a sidecar, spoken to through its typed SDK, with tools provided exclusively by Studio's MCP layer and permissions surfaced through Studio's review UX.

## ADDED Requirements

### Requirement: Supervised, pinned engine lifecycle
Studio SHALL bundle a pinned opencode server binary per platform, start it on demand on a localhost-only port with an isolated Studio-owned config directory, health-check it, and restart it with backoff on crash. No user-level opencode installation or config SHALL be read.

#### Scenario: Engine crash
- **WHEN** the engine process dies mid-session
- **THEN** Studio restarts it, restores the session list, and tells the user what happened — no silent hang

### Requirement: DB-scoped tool profile
The default agent profile SHALL expose ONLY Studio's MCP tools (query, schema, profiling, knowledge base); the engine's built-in shell and file tools SHALL be disabled in this profile. SQL execution continues to pass Studio's classifySql gate inside the MCP layer.

#### Scenario: Model asks for shell
- **WHEN** a model attempts a shell tool in the DB profile
- **THEN** the tool is not available and the agent proceeds with the MCP tools; no shell runs

### Requirement: Permissions through Studio review
Engine permission requests SHALL surface in the panel as Studio's two-step review pattern; nothing auto-approves, and denials are reported to the model faithfully.

#### Scenario: Destructive SQL
- **WHEN** the agent proposes a destructive statement
- **THEN** the existing review flow (classifySql + confirm) gates execution exactly as it does for human-typed SQL

### Requirement: Rebrand with attribution
The product surface SHALL present the agent as Exa while retaining opencode's MIT license text and attribution in the app's licenses/About surface; upstream copyright headers are never removed.

#### Scenario: Licenses page
- **WHEN** the user opens the licenses/About surface
- **THEN** opencode (MIT) is credited with its license text
