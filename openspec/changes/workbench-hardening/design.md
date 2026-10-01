# Design

## Phase 1 — safety and data correctness

- **Credentials.** The OS keychain is written through the platform API, never
  a command line: `security-framework` (already in the dependency tree) on
  macOS, Windows Credential Manager through `windows-sys`, `secret-tool` on
  stdin on Linux (already the case). With no vault key a password is not
  written to `connections.json` at all: it lives only in the keychain, and the
  profile records that. Clearing a password clears the keychain copy too.
- **Paging.** One deterministic order for every page: the user's statement is
  never re-ordered; pages come from `ROWNUM` over the statement as written,
  page 0 included, so page n continues page n-1. WITH and comment-led
  statements page like SELECT.
- **Exact values.** DECIMAL with scale 0 beyond ±2^53 and every DECIMAL wider
  than `rust_decimal` travel as strings; TIMESTAMP keeps its fractional
  digits. The grid shows them verbatim; edits write them back verbatim.
- **Grid edits.** NULL keys compare with `IS NULL`; each statement must touch
  exactly one row or the batch rolls back; the batch runs in one transaction
  on one connection; after a save the grid re-runs the statement that
  produced it, not the editor buffer.
- **Files.** `write_text_file` accepts only paths under the workspace folder
  or a path the user picked in a save dialog this session.
- **Tabs.** Closing a tab with unsaved SQL asks; save failures are shown;
  `savedSql` is persisted so restored tabs are not all dirty.

## Phase 2 — one session per editor tab

Each SQL tab owns a pooled connection detached from the pool for its life
(`AppState.sessions: tab id → connection`). Run, OPEN SCHEMA, COMMIT,
ROLLBACK, autocommit, query timeout and the session id all go through it;
Stop uses a separate short-lived connection so it never waits on the busy
one. A lost session is detected on use, the tab says so, and the
`lossHandling` setting decides between reconnect and reconnect-and-rerun.
DML since the last commit drives an open-transaction badge and a confirm on
disconnect, tab close and app quit.

## Phases 3–7

Specified in tasks.md; each phase gets its own design note in its PR when the
shape is not obvious from the task.
