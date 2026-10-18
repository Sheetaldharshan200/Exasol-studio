# Workbench hardening: from a new connection to the results page

## Why

A QA and R&D audit of the workbench (2026-10-01) compared Studio with
Exasol's own drivers (JDBC, ODBC, pyexasol, WebSocket API, EXAplus) and with
DBeaver, DataGrip and DbVisualizer. Of 93 connection and execution settings,
26 change behaviour, 55 are saved and never read, and about 12 are display
only. Of 24 fields a professional database user treats as mandatory, 6 are
present, 6 partial and 12 missing or inert. Several defects put data or
credentials at risk:

- passwords visible in the process list (macOS `security -w`, a PowerShell
  string on Windows that a quote can break out of), plaintext on disk when no
  vault key exists, a keychain copy that bypasses the master password;
- paging that repeats or skips rows; integers above 2^53 rounded; timestamps
  cut to milliseconds; grid edits that match `"col" = NULL`, never check the
  affected rows, commit half a batch, and re-run the whole editor buffer;
- every run takes a random session from a pool of four, so `OPEN SCHEMA`,
  `ALTER SESSION`, COMMIT and ROLLBACK can land on the wrong session;
- unsaved SQL discarded on tab close; save failures swallowed; a file-write
  command that writes any path.

A user who configures a connection carefully is mostly configuring nothing,
and a developer who trusts the grid can lose data. This change makes every
field on screen do what it says, and adds the fields users expect.

## What

Seven phases, each its own PR with tests and a Codex review (tasks.md):

1. Safety and data correctness.
2. One session per editor tab: autocommit, schema, COMMIT/ROLLBACK, Stop,
   query timeout, reconnect and the open-transaction indicator become real.
3. Every stored setting applied, or removed from the screen.
4. Connection essentials: fingerprint pinning and trust-on-first-use, custom
   CA, no "disabled" encryption, OpenID tokens and SaaS guidance, host
   ranges, validated port, Test in the edit view, password prompt on connect.
5. Production safety: environment tags, read-only connections, confirmation
   before destructive SQL.
6. SSH tunnel and proxy.
7. Daily-use polish: shortcuts, formatter, result grid, export, history,
   monitoring, diagnostics.

## Files

Over 1,000 lines today, and only shrunk by this change (new logic goes into
extracted modules): `apps/desktop/src/components/studio/ExasolStudio.tsx`
(4,075), `apps/desktop/src/features/connection/ConnectionPropertiesTab.tsx`
(1,245). Other files touched are under 1,000: `query.rs` (946),
`profiles.rs` (499), `shared_registry.rs` (473), `connection.rs` (364),
`security.rs` (333), `ResultsPanel.tsx` (597), `use-result-paging.ts`
(159), `files.rs` (147), `edit-dml.ts` (84).

## Non-goals

- Non-Exasol databases as first-class targets (drivers stay as today).
- A second query engine: execution stays on sqlx-exasol and the existing
  driver bridges.
- Collaboration, cloud sync or team sharing of connections.
- Releasing: phases ship as PRs; a release is tagged only on request.
