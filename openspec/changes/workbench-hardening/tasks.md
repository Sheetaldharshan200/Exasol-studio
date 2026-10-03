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

- [x] 3.1 Max rows: any value 1–100,000 from Settings is honoured (`ExasolStudio.tsx`; test: `lib/exec-settings.test.ts`). Any value 1–100,000; the toolbar shows the current value next to the presets.
- [x] 3.2 Stop on error / warning / no rows read by `run()` (`lib/exec-settings.ts`; test: same). Stop on error and stop on no rows reach the backend (`query.rs::StopPolicy`, tested); "Stop on SQL warning" removed — the driver reports no warnings. Error position/statement markers implemented (`lib/error-markers.ts`, tested).
- [x] 3.3 Split statements setting honoured (`run()`). `splitsFor` in `lib/exec-settings.ts`; also a toolbar toggle.
- [x] 3.4 `nullText` used by the grid and the cell viewer (`ResultsGrid.tsx`). Grid and cell viewer through `NullTextContext`; `lib/null-label.test.ts`.
- [x] 3.5 `connectTimeoutMs` / per-connection login timeout applied to TCP probe and pool acquire (`connection.rs`; test: `connection.rs`). Global connect timeout (no per-connection one exists) for the TCP probe and pool acquire/login; `connection.rs` test.
- [x] 3.6 `fetchSize` applied where the driver supports it, else removed. Removed: the driver's fetch size is a byte budget, not rows; max rows already caps a run.
- [x] 3.7 `showSystemSchemas` hides SYS / EXA_STATISTICS in the tree (`tree-model.ts`; test: `tree-model.test.ts`). Default on (the folder always showed); `features/workbench/tree-folders.ts`, tested in `tree-model.test.ts`.
- [x] 3.8 `keepHistory` / `historyLimit` honoured (`history.rs`; test: `history.rs`). Was a fixed 300; `history.rs` test.
- [x] 3.9 `sqlEditor.initialSchema` honoured on connect (`session.rs`). default / none / most recently used, applied when a tab session opens; `session.rs` test.
- [x] 3.10 `uiFontSize` / `uiDensity` applied or removed. Removed: the UI uses fixed pixel sizes, so neither could do anything.
- [x] 3.11 Remove settings with no behaviour behind them and no plan: delimited.* , qualifiers.*, sqlTemplates (until 7.x), queryBuilder.*, commitBatchSize, textToBinary, isolation, statementDelimiter, metadataStaleDays, qbDefaultLimit, duplicated global tls/compression/defaultSchema (`ConnectionPropertiesTab.tsx`, `SettingsWindow.tsx`; test: a settings-inventory test asserting every key has a reader — `lib/settings-inventory.test.ts`). Global and per-connection; retired app keys (incl. a plaintext `aiApiKey`) scrubbed from disk, retired connection keys dropped on load; `lib/settings-inventory.test.ts` covers both.
- [x] 3.12 Driver-properties rows become editable key/value pairs that reach the driver, or are removed. The two parameters that reach the driver stay editable (pool size, query timeout); the fake `clientname`, the duplicated encryption/compression and `fetchsize` rows and the disabled "Edited" checkbox are gone.
- [x] 3.13 Connection URL preview shows the real DSN (TLS, schema, fingerprint), password masked (`lib/connection-url.ts`; test: `connection-url.test.ts`). `lib/connection-url.ts` mirrors `build_connect_options`; fingerprint support ready for 4.1.

## Phase 4 — Connection essentials

- [x] 4.1 TLS certificate fingerprint pinning (`host/FP:port` and a Fingerprint field) (`connection.rs`, `lib/dsn.ts`; test: `dsn.test.ts`, `connection.rs`). A pinned connection runs through a loopback tunnel whose TLS completes only with the pinned leaf certificate (`pin_tunnel.rs`, `tls_trust::PinVerifier`): the driver cannot pin, and its CA option only adds to its public roots. The agent checks the pin at its WebSocket TLS upgrade; Panorama after its handshake; exapump gets `--certificate-fingerprint`. Parsing in `lib/dsn.ts`.
- [x] 4.2 Trust-on-first-use: on an unverified certificate show its SHA-256 fingerprint and offer "Trust this certificate" → pinned (`ConnectRunOverlay.tsx`, `connection.rs::server_fingerprint`; test: `connection.rs`). Live-tested against the local database: untrusted → pinned → connects; a different pin → certificate changed.
- [x] 4.3 Custom CA file (`connection.rs`; test: `connection.rs`). Native driver (`ssl-ca`); other drivers say so plainly.
- [x] 4.4 Remove "Disabled" encryption (Exasol 8.19+ rejects it); one default ("Verify certificate" with TOFU) for new, edited and imported profiles (`ConnectionPropertiesTab.tsx`, `profiles.rs`; test: `profiles.rs`). "Disabled" maps to "Required"; new connections default to "Verify certificate and host". The agent's own connect encrypts without verifying (it cannot answer the trust question).
- [x] 4.5 OpenID access token / refresh token auth (`connection.rs`, `ConnectionPropertiesTab.tsx`; test: `connection.rs`). Native driver; bridge drivers refuse token sign-in with the reason.
- [x] 4.6 SaaS: personal access token, host from the web console, allow-list hint in errors (`ConnectionPropertiesTab.tsx`, `error.rs`; test: `error.rs`). The PAT goes in the password field; `error.rs::with_saas_hint` adds the allow-list cause.
- [x] 4.7 Host lists and ranges `host1..5:8563`, with UI help and tests (`lib/dsn.ts`; test: `dsn.test.ts`). Ranges as the driver reads them; comma lists refused with the range form (the driver has none).
- [x] 4.8 Port validated 1–65535 with a clear message (`lib/dsn.ts`, `profiles.rs`; test: `dsn.test.ts`). `lib/dsn.ts::checkPort` and `profile_check.rs`.
- [x] 4.9 Test Connection in the edit view; it tests the selected driver (`ConnectionPropertiesTab.tsx`, `connection.rs::test_connection`). Uses the stored secret when none is typed; bridges and exarrow run the same two reads.
- [x] 4.10 "Save & Connect" saves only after a successful connect (or asks) (`ConnectRunOverlay.tsx`). The draft is tested first; on failure "Save without connecting".
- [x] 4.11 Password prompt on connect when not saved (`ConnectPasswordDialog.tsx`). `ipc.connect` asks through the registered prompt for every connect path; "Save it" only when the policy saves.
- [x] 4.12 Profile identity: editing host/port/user updates the shared-registry entry instead of resurrecting the old one; real duplicates allowed and a Duplicate action (`profiles.rs`, `shared_registry.rs`; test: `profiles.rs`). Phase 1 already removed the old shared entry on an address change; a new profile merges only with the same name and address (`profile_check::same_connection`); Duplicate copies secret and settings.
- [x] 4.13 `ping_server` tries every resolved address (IPv4 and IPv6) (`connection.rs`; test: `connection.rs`). `reach_any`, tested with an IPv6 address that fails and an IPv4 one that answers.
- [x] 4.14 Connect hook failures shown to the user (`connection.rs`). Connect hook failures come back in `ServerInfo.hookErrors`, disconnect ones from `disconnect`; shown as a notice and in the connect window's log.
- [x] 4.15 Paste a JDBC URL / pyexasol DSN to fill the form (`lib/dsn.ts::parseDsn`; test: `dsn.test.ts`). Pasting into the server field fills the form; passwords are never read from a paste.
- [x] 4.16 Import / export connections as JSON (passwords excluded) (`profiles.rs`; test: `profiles.rs`). `profile_io.rs`: versioned format, settings and pin included, secrets never; existing connections skipped.

## Phase 5 — Production safety

- [x] 5.1 Environment tag per connection: Dev / Test / Prod (+ colour), shown on tabs and the title bar (`ConnSettings.env`). `ConnSettings.safety.env`; badge in the title bar and on SQL tabs, tab edge in the environment colour unless an accent is set (`EnvBadge.tsx`).
- [x] 5.2 Read-only connection: client-side guard for write statements (`lib/sql-classify.ts`; test: `sql-classify.test.ts`). Enforced in the backend for every app path (`safety.rs`: execute_sql, grid edits) and in agent-core's write paths; the client guard (`lib/sql-classify.ts`) explains it first.
- [x] 5.3 Confirm before DROP, TRUNCATE, DELETE/UPDATE without WHERE; always on Prod, configurable elsewhere (`lib/sql-classify.ts`; test: same). DROP, TRUNCATE, DELETE/UPDATE without a top-level WHERE; Prod always, "Confirm destructive statements" elsewhere.
- [x] 5.4 Confirm grid data changes on Prod. `editsQuestion`; declining keeps the edits in the grid.

## Phase 6 — Network

- [x] 6.1 SSH tunnel: host, port, user; password, private key + passphrase, or agent (`ssh_tunnel.rs`; test: `ssh_tunnel.rs`). System OpenSSH (`ssh -N -L`); a password or passphrase through an askpass helper and the child environment, never argv. Live-tested against a real sshd forwarding to Exasol.
- [x] 6.2 Host-key checking (strict / accept new / ask) and known_hosts. Ask: the fingerprint is shown and only exactly that key is stored (Studio's own known_hosts, read with ~/.ssh/known_hosts); accept new; strict. Live-tested.
- [x] 6.3 Jump host and `~/.ssh/config` host aliases. Native via OpenSSH: `-J` and every ~/.ssh/config setting; "ask" resolves aliases with `ssh -G`. Through a jump host "ask" cannot show the key and says so.
- [x] 6.4 Tunnel keep-alive and connect timeout; tunnel shared across tabs of one connection. ServerAliveInterval, ConnectTimeout = the app's connect timeout; one tunnel per connection (its pool), shared by its tabs; a forward the server refuses is reported.
- [x] 6.5 HTTP/SOCKS proxy (`connection.rs`). `proxy_tunnel.rs`: SOCKS5 (RFC 1928/1929) and HTTP CONNECT with Basic; TLS stays end to end. End-to-end test through a SOCKS5 proxy.

## Phase 7 — Daily-use polish

### 7.1 Editor
- [x] 7.1.1 Shortcuts: ⌘S save, cancel, ⌘T / ⌘W, ⌃Tab and ⌘1–9, focus tree/editor/results; a shortcut sheet (`lib/shortcuts.ts`; test: `shortcuts.test.ts`).
- [x] 7.1.2 Resolve ⌘. vs Monaco Quick Fix and the global ⌘K vs Monaco chords. Quick Fix is ⌥⏎ (⌘. runs the statement); ⌘K searches only outside the editor; the macOS menu has no Close Window on ⌘W.
- [x] 7.1.3 SQL formatter for Exasol (`lib/sql-format.ts`; test: `sql-format.test.ts`).
- [x] 7.1.4 `&var` / `:param` substitution with a prompt (`lib/sql-params.ts`; test: `sql-params.test.ts`).
- [x] 7.1.5 Remove the `NOW()` false-positive lint (Exasol accepts it) (`lib/sql-lint.ts`; test: `sql-lint.test.ts`).
- [x] 7.1.6 Mixed-case identifiers resolve and insert quoted; completion scope uses `splitStatements`; comma joins resolve (`lib/sql-completion.ts`; test: `sql-completion.test.ts`).
- [x] 7.1.7 Catalog loaded per schema on demand; refreshed once after DDL, not twice per run nor every 45 s; lint off while incomplete (`lib/sql-catalog.ts`; test: `sql-catalog.test.ts`).
- [x] 7.1.8 Function signature help and hover (`lib/sql-signatures.ts`; test: `sql-signatures.test.ts`). Signatures checked live on Exasol; table hover only in table positions, CTE names shadow tables.

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
