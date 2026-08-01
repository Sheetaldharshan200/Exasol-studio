
## [2026-07-23] benchmark | exapump bulk-load benchmark + multi-file gotcha (NYC Taxi 38M rows)
Loaded NYC Yellow Taxi 2023 (12 monthly Parquet, 614 MB) into NYC_TAXI.YELLOW_TRIPS via exapump 0.11.2 against local nano (8563, sys, ?tls=1&validateservercertificate=0).
Result: 38,310,226 rows in 72 s total = ~532K rows/s; ~6 s per ~3.2M-row month.
GOTCHA: `exapump upload f1 f2 ... f12 --table T` only imports the FIRST file (exit 0, one row count). Load one file per upload call to append the full set.
GOTCHA: Parquet-header columns are created quoted-lowercase => must reference as "tpep_pickup_datetime"; unquoted folds to upper and errors 42000.
Long-running query for QA: location-pair self-join on Dec data = 137.7 s, 9.9B intermediate rows. See docs/qa/manual-validation-big-data.md.


## [2026-07-24] ingest | Connection Properties page shipped — new page connection-properties; ConnSettings shape + Rust wiring documented
Wired in Rust: hooks, keep-alive, pool size, password policy. Stored-only items tracked in repo tasks.md.
Also this session: MCP gateway service bus (per-connection sql/nl2sql caps + dashboards service), execution log Exec/Fetch/sort/cell-detail.


## [2026-07-26] ingest | Mandatory code-quality workflow adopted — Codex review + KISS/SOLID + edge-case unit tests; new page dev-workflow-codex
Codex CLI 0.145.0 installed globally (npm, ChatGPT auth); plugin openai-codex/codex 1.0.6 (/codex:rescue, codex-rescue subagent).
Rule also added to repo CLAUDE.md ('Code quality workflow (mandatory)') and Claude memory (codex-review-workflow).


## [2026-07-27] review | Codex catch-up review found 6 real defects; all fixed. New pages kiss-hard-rules + codex-review-findings-2026-07
Reviewed 93b1177 + 8b91d63 (pushed without the mandatory review). Codex CONFIRMED decode_cell correct, the ['’] apostrophe widening correct with no backtracking risk, no server.ts route lost, and the 3 Rust deletions safe.
HIGH: cellToLiteral silently sliced over-long VARCHAR values and the new test asserted that as correct — buildPlan only samples 500k rows, so values beyond the sample were quietly truncated. Now emits full literals; Exasol rejects visibly and the per-row retry names the row.
Found a FIFTH partial duplicate in server.ts that the original de-dup pattern missed (started with '// Skills:' not '// Dashboards:'). 24 more dead lines; 808 -> 551 total.
Also fixed: looksUnfinished required an apostrophe in the 'Next, lets' branch; extractReadSql returned truncated 'SELECT a FROM' that gets sent to run_sql; buildInsert emitted invalid empty INSERT; repairCall dropped valid args on schema-lookup failure; DATE_RE accepted 2024-99-99 (now calendar-validated); nested bigint crashed JSON.stringify in Parquet conversion.
TOOLING GOTCHA: `codex review --commit <SHA>` refuses a custom prompt — use `codex exec --sandbox read-only` instead. The codex-rescue subagent is a one-way forwarder and cannot retrieve results.
ExasolStudio.tsx 5089 -> 4062 via lib/sql-text.ts (+38 tests), studio/tabs.ts, studio/IconButton.tsx, studio/HistoryDock.tsx. 308 tests total, all green.
STILL OPEN: fractional values with >20 decimal places infer a capped scale but emit the original literal (csv-import.ts inferType).


## [2026-07-27] review | Codex found two classifySql gate bypasses (SELECT INTO TABLE, read-prefixed batch); gate hardened + 30 tests. OpenSpec installed
CRITICAL: classifySql whitelisted every SELECT, but Exasol's SELECT ... INTO TABLE t creates a table — the agent auto-ran a mutation without approval. HIGH: 'SELECT 1; DROP TABLE t' classified as read (only the first token was examined).
Fix: classifySql now blinds string literals and quoted identifiers first (so contents can neither fake nor hide signals), then rejects any batch with content after a semicolon and any read-classified statement containing top-level INTO. Unterminated literals stay visible = fail closed. tools.classify.test.ts pins both bypasses + string-blinding edges (30 tests).
The gate defects were 9th and 10th silent bugs found by testing previously-untested pure logic — and classifySql was only tested because 'do the remaining works' pushed testing into tools.ts.
Also: humanizeProviderError + summarize exported from loop.ts and tested (precedence chain incl. combined-field cases per Codex nit). Stated reasons for the three remaining >1,000-line files recorded in CLAUDE.md instead of forced splits: local_database.rs is a linear I/O bootstrap orchestrator, tools.ts is a flat tool registry, loop.ts is one turn state machine — their pure decision logic is tested in place.
OpenSpec (@fission-ai/openspec 1.6.0) installed for Claude Code/Codex/Cursor/Gemini: /opsx:propose -> apply -> archive; openspec/config.yaml carries project context + artifact rules (Non-goals section; tasks name their test file). Codex verified vendored files carry no machine-local paths/credentials.
396 tests total (185 agent-core, 105 desktop, 79 parser, 27 Rust).


## [2026-08-01] ingest | In-app updater flow, non-destructive restart, local-setup loader + fresh-wipe; release 2026.1.0
Filed page: in-app-updater-and-fresh-restart (pull-based updater, phased download/install/restart, workspace persistence, AI session restore).
Gotcha recorded: .exa-indeterminate needs a position:relative parent or its glow escapes into a big green blob (the UpdateBanner 'green circle').
relaunch() -> plugin:process|restart -> needs process:allow-restart (not allow-relaunch).
Local setup loader trimmed to Personal-local/ExaPump/MCP; verified-download got retry+backoff (retryable_status).
graphify re-indexed: 9968 nodes / 20583 edges.

