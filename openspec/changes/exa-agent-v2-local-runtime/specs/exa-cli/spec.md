## Purpose

The same Exa agent is available as a terminal command (`exa`), sharing the desktop app's configuration, sessions, MCP tools, and provider registry — one agent, two front ends (sidebar and CLI), fully offline with local models.

## ADDED Requirements

### Requirement: Shared brain across app and CLI
The CLI SHALL use the same isolated Studio config directory, session store, MCP tool layer, and provider/runtime registry as the desktop app.

#### Scenario: Cross-surface session
- **WHEN** a session is started in the CLI and the app is opened
- **THEN** that session appears in the sidebar's session list with its transcript and model, and continuing it in either surface updates both

### Requirement: Install from the app, bundled in installers
The desktop app SHALL offer "Install exa CLI to PATH", and every platform installer (dmg / exe / AppImage) SHALL include the CLI binary — no separate download.

#### Scenario: Fresh install
- **WHEN** the user installs Exasol Studio and runs the CLI install action
- **THEN** `exa` is available on PATH and runs against the same engine without any extra setup

### Requirement: Local-first and safe in the terminal too
The CLI SHALL default to the Local Runtime provider ranking (local → in-DB → cloud) and SHALL apply the same SQL safety gate (classifySql + confirmation) for destructive statements as the app.

#### Scenario: Destructive statement from the CLI
- **WHEN** the agent proposes a destructive statement in the CLI
- **THEN** it is gated by the same review/confirm rule, not executed silently
