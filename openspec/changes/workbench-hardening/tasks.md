# Tasks — workbench hardening

Source: the 2026-10-01 QA/R&D audit (connection → results). Each phase is one
PR with tests and a Codex review. A task that adds logic names its test file.
`[ ]` open · `[x]` done.

## Phase 1 — Safety and data correctness

### 1.1 Credentials
- [x] 1.1.1 macOS keychain write through `security -i` with the command on stdin (keeps /usr/bin/security as the item's creator, as the exa CLI expects), not `security -w <secret>` (`shared_registry.rs`; test: `shared_registry.rs` tests for the argument builder no longer carrying the secret).
- [x] 1.1.2 Windows: the same PasswordVault entry the CLI uses, password read from stdin inside the script, ids quoted; a password with `'` round-trips (`shared_registry.rs` tests, `cfg(windows)` CI compile).
- [x] 1.1.3 No vault key → the password is not written to `connections.json`; it lives in the keychain and the file holds only `keychain:` (`profile_secret.rs`; test: `profile_secret.rs`).
- [x] 1.1.4 Reading a profile's password falls back to the keychain when the file holds none (`profiles.rs::find_profile`; test: same module).
- [x] 1.1.5 "Clear at disconnect" and deleting a profile remove the keychain copy too (`profiles.rs`, `shared_registry.rs`; test: `profiles.rs`).
- [x] 1.1.6 Password policy "this session only" really keeps the password in memory only (`connection.rs` session map; test: `connection.rs`).
- [x] 1.1.7 `connections.json` and secrets written with 0600 on Unix (`storage.rs::write_json`; test: `storage.rs`).

### 1.2 Exact results
- [x] 1.2.1 Paging continues page to page in the statement's own order: one plan per result: the statement's own ORDER BY plus every column as tie breaker, or every column; own LIMIT or duplicate names are not paged; page 0 re-fetched under the plan (`lib/result-pages.ts`; test: `result-pages.test.ts`, `use-result-paging.test.ts`; SQL shapes verified on a live database).
- [x] 1.2.2 WITH and comment-led statements page like SELECT (`ResultsPanel.tsx::isSingleSelect` → shared helper; test: `use-result-paging.test.ts`).
- [x] 1.2.3 Integers beyond ±2^53 and DECIMALs wider than `rust_decimal` travel as strings (`query.rs::decode_cell`; test: `query.rs` tests).
- [x] 1.2.4 TIMESTAMP keeps fractional seconds as stored (`query.rs`; test: `query.rs`).
- [x] 1.2.5 CSV export: NULL distinct from empty, formula-injection guard, UTF-8 BOM option (`lib/result-stats.ts::toCsv`; test: `result-stats.test.ts`).
- [x] 1.2.6 History records rows affected for DML, not 0 (`lib/result-stats.ts::rowTotal`, `history.rs`; test: `result-stats.test.ts`).

### 1.3 Grid edits
- [x] 1.3.1 NULL key values match with `IS NULL` (`edit-dml.ts::buildDml`; test: `edit-dml.test.ts`).
- [x] 1.3.2 The edit batch runs on one connection in one transaction; any statement that affects ≠ 1 row rolls the batch back and names the row (`grid_edits.rs::apply_row_edits`; test: `grid_edits.rs` rule + live rollback test).
- [x] 1.3.3 After a save the grid re-runs the statement that produced it, not the editor buffer (`ExasolStudio.tsx::commitEdits` → `runMeta.sql`; test: extracted helper in `lib/run-meta.test.ts`).
- [x] 1.3.4 Edits on a truncated or paged result are keyed by the row's own key values only (`edit-dml.ts`; test: `edit-dml.test.ts`).

### 1.4 Files and tabs
- [x] 1.4.1 `write_text_file` refuses relative paths, `..`, hidden files/folders, ~/Library and system folders, non-text types, also through a symlinked folder (`files.rs::write_permitted`; test: `files.rs`).
- [x] 1.4.2 Closing a tab with unsaved SQL asks before discarding (names the tabs); also for close-others / close-all (`ExasolStudio.tsx::closeTab` via `lib/tab-close.ts`; test: `lib/tab-close.test.ts`).
- [x] 1.4.3 Save failures are shown, not swallowed (`ExasolStudio.tsx` save paths).
- [x] 1.4.4 `savedSql` persisted, so restored tabs are not all marked modified (`lib/workspace-persist.ts`; test: `workspace-persist.test.ts`).
- [x] 1.4.5 Strip-comments keeps `--/ … /` script blocks intact (`lib/sql-text.ts::stripSqlComments`; test: `sql-text.test.ts`).

## Phase 2 — One session per editor tab

- [x] 2.1 `AppState.sessions`: tab id → detached connection; open on first run, close on tab close / disconnect (`session.rs`; test: `session.rs` rules + live test).
- [x] 2.2 `execute_sql` takes an optional tab id and runs on that session (`query.rs`; test: `query.rs`).
- [x] 2.3 Autocommit per tab applied to the session (`session.rs`; wire the toolbar toggle and the per-connection default; test: `session.rs`).
- [x] 2.4 COMMIT / ROLLBACK run on the tab's session (`ExasolStudio.tsx::txn`).
- [x] 2.5 Schema selector sends `OPEN SCHEMA` on the tab's session; the selector shows the session's real schema (`ExasolStudio.tsx`; test: `lib/sql-text.test.ts` quoting).
- [x] 2.6 Stop uses a pooled connection while the tab runs on its detached session, so it never waits on it — also in single-connection mode (the session leaves the pool's count).
- [x] 2.7 Query timeout applied with `ALTER SESSION SET QUERY_TIMEOUT` on the tab's session; timed-out statements say so (`session.rs`; test: `session.rs`).
- [x] 2.8 Open-transaction tracking: DML since last COMMIT/ROLLBACK → tab badge (`lib/txn-state.ts`; test: `txn-state.test.ts`).
- [x] 2.9 Confirm on tab close / disconnect / app quit with uncommitted work, honouring `askWhenUncommitted` / `askAlways` (`lib/tab-close.ts`, `lib.rs` `CloseRequested`; test: `tab-close.test.ts`).
- [x] 2.10 Lost session detected on use and reported as rolled back; `lossHandling` re-executes only scripts that only read (`session.rs`, `lib/txn-state.ts`; test: both).
- [x] 2.11 `connect` idempotent under concurrency; the losing pool is closed (`connection.rs`; test: `connection.rs`).
- [x] 2.12 Keep-alive pings every tab session; failures surface as "connection lost" (`session.rs::ping_idle`, `session_cmd.rs::start_keepalive`; live test in `session.rs`). Idle sessions are pinged each minute; a dead one is removed and the page is told what the server rolled back.
- [x] 2.13 Health dot reflects session liveness, not just TCP reachability (`connection.rs::connection_alive`, `Sidebar.tsx`). The title bar has no dot; the sidebar is the one place it shows.
- [x] 2.14 Session id shown is the tab's session (`ExasolStudio.tsx` status bar).

## Phase 3 — Every setting applied or removed

- [ ] 3.1 Max rows: any value 1–100,000 from Settings is honoured (`ExasolStudio.tsx`; test: `lib/exec-settings.test.ts`).
- [ ] 3.2 Stop on error / warning / no rows read by `run()` (`lib/exec-settings.ts`; test: same).
- [ ] 3.3 Split statements setting honoured (`run()`).
- [ ] 3.4 `nullText` used by the grid and the cell viewer (`ResultsGrid.tsx`).
- [ ] 3.5 `connectTimeoutMs` / per-connection login timeout applied to TCP probe and pool acquire (`connection.rs`; test: `connection.rs`).
- [ ] 3.6 `fetchSize` applied where the driver supports it, else removed.
- [ ] 3.7 `showSystemSchemas` hides SYS / EXA_STATISTICS in the tree (`tree-model.ts`; test: `tree-model.test.ts`).
- [ ] 3.8 `keepHistory` / `historyLimit` honoured (`history.rs`; test: `history.rs`).
- [ ] 3.9 `sqlEditor.initialSchema` honoured on connect (`session.rs`).
- [ ] 3.10 `uiFontSize` / `uiDensity` applied or removed.
- [ ] 3.11 Remove settings with no behaviour behind them and no plan: delimited.* , qualifiers.*, sqlTemplates (until 7.x), queryBuilder.*, commitBatchSize, textToBinary, isolation, statementDelimiter, metadataStaleDays, qbDefaultLimit, duplicated global tls/compression/defaultSchema (`ConnectionPropertiesTab.tsx`, `SettingsWindow.tsx`; test: a settings-inventory test asserting every key has a reader — `lib/settings-inventory.test.ts`).
- [ ] 3.12 Driver-properties rows become editable key/value pairs that reach the driver, or are removed.
- [ ] 3.13 Connection URL preview shows the real DSN (TLS, schema, fingerprint), password masked (`lib/connection-url.ts`; test: `connection-url.test.ts`).

## Phase 4 — Connection essentials

- [ ] 4.1 TLS certificate fingerprint pinning (`host/FP:port` and a Fingerprint field) (`connection.rs`, `lib/dsn.ts`; test: `dsn.test.ts`, `connection.rs`).
- [ ] 4.2 Trust-on-first-use: on an unverified certificate show its SHA-256 fingerprint and offer "Trust this certificate" → pinned (`ConnectRunOverlay.tsx`, `connection.rs::server_fingerprint`; test: `connection.rs`).
- [ ] 4.3 Custom CA file (`connection.rs`; test: `connection.rs`).
- [ ] 4.4 Remove "Disabled" encryption (Exasol 8.19+ rejects it); one default ("Verify certificate" with TOFU) for new, edited and imported profiles (`ConnectionPropertiesTab.tsx`, `profiles.rs`; test: `profiles.rs`).
- [ ] 4.5 OpenID access token / refresh token auth (`connection.rs`, `ConnectionPropertiesTab.tsx`; test: `connection.rs`).
- [ ] 4.6 SaaS: personal access token, host from the web console, allow-list hint in errors (`ConnectionPropertiesTab.tsx`, `error.rs`; test: `error.rs`).
- [ ] 4.7 Host lists and ranges `host1..5:8563`, with UI help and tests (`lib/dsn.ts`; test: `dsn.test.ts`).
- [ ] 4.8 Port validated 1–65535 with a clear message (`lib/dsn.ts`, `profiles.rs`; test: `dsn.test.ts`).
- [ ] 4.9 Test Connection in the edit view; it tests the selected driver (`ConnectionPropertiesTab.tsx`, `connection.rs::test_connection`).
- [ ] 4.10 "Save & Connect" saves only after a successful connect (or asks) (`ConnectRunOverlay.tsx`).
- [ ] 4.11 Password prompt on connect when not saved (`ConnectPasswordDialog.tsx`).
- [ ] 4.12 Profile identity: editing host/port/user updates the shared-registry entry instead of resurrecting the old one; real duplicates allowed and a Duplicate action (`profiles.rs`, `shared_registry.rs`; test: `profiles.rs`).
- [ ] 4.13 `ping_server` tries every resolved address (IPv4 and IPv6) (`connection.rs`; test: `connection.rs`).
- [ ] 4.14 Connect hook failures shown to the user (`connection.rs`).
- [ ] 4.15 Paste a JDBC URL / pyexasol DSN to fill the form (`lib/dsn.ts::parseDsn`; test: `dsn.test.ts`).
- [ ] 4.16 Import / export connections as JSON (passwords excluded) (`profiles.rs`; test: `profiles.rs`).

## Phase 5 — Production safety

- [ ] 5.1 Environment tag per connection: Dev / Test / Prod (+ colour), shown on tabs and the title bar (`ConnSettings.env`).
- [ ] 5.2 Read-only connection: client-side guard for write statements (`lib/sql-classify.ts`; test: `sql-classify.test.ts`).
- [ ] 5.3 Confirm before DROP, TRUNCATE, DELETE/UPDATE without WHERE; always on Prod, configurable elsewhere (`lib/sql-classify.ts`; test: same).
- [ ] 5.4 Confirm grid data changes on Prod.

## Phase 6 — Network

- [ ] 6.1 SSH tunnel: host, port, user; password, private key + passphrase, or agent (`ssh_tunnel.rs`; test: `ssh_tunnel.rs`).
- [ ] 6.2 Host-key checking (strict / accept new / ask) and known_hosts.
- [ ] 6.3 Jump host and `~/.ssh/config` host aliases.
- [ ] 6.4 Tunnel keep-alive and connect timeout; tunnel shared across tabs of one connection.
- [ ] 6.5 HTTP/SOCKS proxy (`connection.rs`).

## Phase 7 — Daily-use polish

### 7.1 Editor
- [ ] 7.1.1 Shortcuts: ⌘S save, cancel, ⌘T / ⌘W, ⌃Tab and ⌘1–9, focus tree/editor/results; a shortcut sheet (`lib/shortcuts.ts`; test: `shortcuts.test.ts`).
- [ ] 7.1.2 Resolve ⌘. vs Monaco Quick Fix and the global ⌘K vs Monaco chords.
- [ ] 7.1.3 SQL formatter for Exasol (`lib/sql-format.ts`; test: `sql-format.test.ts`).
- [ ] 7.1.4 `&var` / `:param` substitution with a prompt (`lib/sql-params.ts`; test: `sql-params.test.ts`).
- [ ] 7.1.5 Remove the `NOW()` false-positive lint (Exasol accepts it) (`lib/sql-lint.ts`; test: `sql-lint.test.ts`).
- [ ] 7.1.6 Mixed-case identifiers resolve and insert quoted; completion scope uses `splitStatements`; comma joins resolve (`lib/sql-completion.ts`; test: `sql-completion.test.ts`).
- [ ] 7.1.7 Catalog loaded per schema on demand; refreshed once after DDL, not twice per run nor every 45 s; lint off while incomplete (`lib/sql-catalog.ts`; test: `sql-catalog.test.ts`).
- [ ] 7.1.8 Function signature help and hover.

### 7.2 Results
- [ ] 7.2.1 Virtualized grid; column resize, sort, hide.
- [ ] 7.2.2 Copy cell / row / column / as CSV / Markdown / INSERT (`lib/result-copy.ts`; test: `result-copy.test.ts`).
- [ ] 7.2.3 Export via save dialog: CSV / XLSX / JSON / SQL INSERT; whole result via exapump.
- [ ] 7.2.4 Cell viewer: JSON pretty-print, long text, copy.
- [ ] 7.2.5 Exasol error code and position parsed and marked in the editor (`lib/exa-error.ts`; test: `exa-error.test.ts`).
- [ ] 7.2.6 Fetch all and optional COUNT(*) when truncated.
- [ ] 7.2.7 Cancel for exarrow and bridge drivers.

### 7.3 Navigator
- [ ] 7.3.1 Refresh rebuilds expanded folders from fresh nodes (`DatabaseTree.tsx`; test: `tree-model.test.ts`).
- [ ] 7.3.2 View DDL is the view's text; DDL includes DISTRIBUTE/PARTITION/COMMENT (`ObjectDetailPanel.tsx`, `lib/ddl.ts`; test: `ddl.test.ts`).
- [ ] 7.3.3 Quoted copy name; `q()` / `qualify()` escape `"` (`lib/sql-ident.ts`; test: `sql-ident.test.ts`).
- [ ] 7.3.4 ObjectSearch request token (no stale results).
- [ ] 7.3.5 Keyboard navigation and row virtualization in the tree.
- [ ] 7.3.6 Open-data row count configurable; "Change type" proposes the current type.
- [ ] 7.3.7 Replace the ★ glyph with an icon.

### 7.4 History, files, monitoring, diagnostics
- [ ] 7.4.1 History per connection, searchable, exportable; dashboard runs do not crowd it out (`history.rs`; test: `history.rs`).
- [ ] 7.4.2 Save As via the native save dialog; OS drag-drop of .sql files; recent files.
- [ ] 7.4.3 Monitoring: locks / transaction conflicts, long-running statements, kill one statement.
- [ ] 7.4.4 About dialog with versions, "Open logs", "Copy diagnostics".
- [ ] 7.4.5 Pane sizes remembered; tab controls keyboard-operable.
- [ ] 7.4.6 Import wizard: column mapping, row preview, reject file; export a whole table.
