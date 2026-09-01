
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


## [2026-08-04] review | Exa continue.dev-style panel — Codex findings fixed (chip dedup, prompt-injection, stale-tab Apply)
Rebuilt features/assistant/ExaEnginePanel.tsx into continue.dev grammar: exa/ChatComposer (mode pill + inline ModelMenu + @-context + send), exa/context.ts (pure @-providers: query/results/table/schema/connection/history, 22 node:test cases), exa/ChatMarkdown (shiki/streamdown + Apply-to-editor on SQL blocks).
Codex review of 48eba47 raised 3 valid findings, all fixed in 494b48a:
1. context.ts chip id preserved identifier casing while table/schema lookup is case-insensitive -> SALES.ORDERS vs sales.orders bypassed addChip dedup. Fix: case-fold id (.toUpperCase()), keep human label.
2. buildPrompt interpolated editor SQL / result data unescaped -> a literal </context> inside a chip body prematurely closed the wrapper. Fix: replace /<\/(context)>/gi with entity form before wrapping.
3. ExasolStudio applySqlToEditor was useCallback([activeTab]) but patchTab/openSqlTab close over connKey -> with the shared WELCOME_TAB across empty buckets, Apply could target a stale connection's tabs. Fix: make it a plain (non-memoized) function so connKey is read at call time.
DB context reaches the panel via getExaSnapshot() (schema/schemas/sqlCatalogRef/editorSql/lastResult/history) passed to both mount sites (side dock + full tab).


## [2026-08-05] review | Exa assistant-ui thread — Codex findings fixed + demo-grade restyle (8482e21)
Adopted @assistant-ui/react 0.15.4 external-store runtime for the Exa thread (exa/ExaThread.tsx); parts-based message model in ExaEnginePanel.
Codex findings fixed: (1) tool.result cloned every message/part -> now touches only the owning message so assistant-ui's converted-message cache stays warm; (2) partComponents keyed on onApplySql identity remounted all assistant messages -> component types created once, handlers behind refs; (3) messageText dropped tool parts and joined text without separator -> tool parts serialize as '> tool: name' lines.
Gotcha: MessagePrimitive.Error takes no className in 0.15.4. Gotcha: assistant-ui's global SpeechRecognition augmentations collide with local declare-global blocks (fixed in ai-elements/prompt-input.tsx by casting at construction).
Styling grammar: centered max-w-[44rem] column, avatar chip + hover ActionBar (Copy works via ActionBarPrimitive.Copy data-copied), BranchPicker hidden when single branch, suggestion cards on empty state.


## [2026-08-05] feature | Exa: engine-as-source-of-truth for providers — auth.json keys, models.dev catalog, session commands (5d0ae5c)
API keys saved in the Exa UI now write into opencode's own auth.json (engine/auth-store.ts; XDG_DATA_HOME pinned at spawn so path = <configDir>/opencode/auth.json, 0600) and restart the engine — previously keys only configured the sidecar and opencode never saw them.
Full provider catalog (200+) comes from models.opencode.ai/api.json — the SAME source opencode uses — via engine/catalog-map.ts (pure, popular pinned: opencode/openai/github-copilot/anthropic/google), 10-min cache, GET /v1/engine/catalog; UI 'Connect a provider…' browser in the model menu.
opencode TUI command parity where GUI-applicable: /new /compact (session.summarize via POST /v1/engine/sessions/:id/compact) /export; TUI-only (themes/editor/exit) skipped deliberately.
Model selector UX fixes: key-input row min-w-0 so Save fits the submenu; search filters IN PLACE above the provider list (no separate view).


## [2026-08-06] feature | Exa engine fork — Sheetaldharshan200/exa with CI releases; Studio switched to v1.18.12-exa.1 (ab95994)
Fork model: exa-main = upstream anomalyco/opencode tag + MINIMAL patch series (currently 1 patch: oauth callback page brands as Exa). MIT license/attribution preserved; EXA.md in the fork documents patch policy + rebase runbook (fetch upstream tag -> cherry-pick patches -> tag vX.Y.Z-exa.N).
CI: single ubuntu runner; the upstream build script cross-compiles ALL targets via bun and self-uploads assets when OPENCODE_RELEASE=1 + OPENCODE_VERSION + GH_REPO are set. Asset names unchanged (opencode-<os>-<arch>.zip/tar.gz) so Studio's installer needed only repo+tag switched (engine.rs OPENCODE_REPO, local_database.rs, marketplace/catalog.json, fetch-runtime.mjs, ENGINE_TAG).
v1.18.12-exa.1 built green first run; binary verified: --version = 1.18.12-exa.1, patched strings present, upstream strings absent.
Also this session: live-streaming root fix (engine emits message.part.updated SNAPSHOTS at properties.part.text; bridge now maps message.upsert/part.snapshot and the panel upserts by messageId/partId with a role registry), headerless panel with floating control cluster, Exa logo+name on the workbench tab.


## [2026-08-06] review | Codex review of the assistant-ui/react-opencode runtime swap — 6 findings, all applied
Change: Exa chat swapped from the hand-rolled external-store bridge onto @assistant-ui/react-opencode (commit fd6ef2c on agent-sql-casing); dead proxy chain deleted (engine_stream, /v1/engine/events, prompt/abort/permission/messages routes, bridge-map/replay-map).
HIGH — session-switch race: sidebar click persisted the id before runtime.threads.switchToThread resolved; on failure localStorage/UI pointed at a session the runtime never opened. Fix: persist in .then(), log in .catch().
MED — quote context dropped: the custom ExaSendButton bypasses composer.send(), so the composer's quote (selection-toolbar Quote) never reached expandForSend. Fix: read s.composer.quote, pass its text, clear via setQuote(undefined).
MED — stale SDK client: the client-bootstrap effect bailed once engineClient was set, so an engine restart on a DIFFERENT port left the runtime on the dead port. Fix: always call engineClientFor(status.port) when a port is reported — it caches per port, so same-port is a no-op and a port change swaps a fresh client.
LOW x3: dead ExaPart/ExaMessage/messageText types removed; exa-agent-engine.md wiki page updated (it still described the deleted bridge); trailing blank line at agent.rs EOF.
Lesson: when a custom send path replaces ComposerPrimitive.Send, every piece of composer state it bypasses (quote, attachments) must be carried explicitly — the runtime only auto-includes them through composer.send().


## [2026-08-06] fix | Engine config is boot-time-only + AgentConfig.tools is inert — two live-verify findings, both fixed
Finding 1: /instance/dispose does NOT reload opencode.json — the engine caches global config with an infinite TTL (config.ts cachedInvalidateWithTTL(…, Duration.infinity)); only its own TUI worker invalidates. A 2-day-old survivor engine kept the pre-seed agent list after dispose. Fix: ensureSeedConfig/syncLocalProviders now restart the engine on config change (restartForConfig), and supervisor.stop() kills ADOPTED survivors by port (identity-checked via GET /path, then lsof/SIGTERM or netstat/taskkill) so restart cannot silently re-adopt the stale process.
Finding 2: AgentConfig's `tools: Record<string,boolean>` exists in the SDK schema but v1.18.12 NEVER reads it (agent config merge consumes only value.permission) — the seeded exa guardrail's tool lockdown was inert. Fix: seed uses `permission` (per-tool "deny"; "edit" aliases write/patch) with in-place migration of old seeds. Verified live: /agent shows the deny ruleset.
Finding 3: small local models fail when ANY tools are attached — llama-server enforces its native tool-call grammar and Llama 3.2 3B errors every turn ("peg-native format"); it answers fine without tools. opencode never strips tools by capability (tool_call flag is metadata only). Fix: new `exa-chat` agent with permission {"*": "deny"} (same shape as opencode's own title/compaction agents); Chat mode sends defaultAgent exa-chat. Verified live: exa-chat + builtin 3B answers, identifies as Exa, declines codebase refactoring.
Commits: fd6ef2c (runtime swap), 10f1dd5 (restart-on-config-change + survivor kill), 525d8ca (permission guardrail + exa-chat).


## [2026-08-12] feature | Independent components, structured questions, sandbox model, fork CLI branding (exa.3)
Managed-components concept removed: bootstrap installs DB+ExaPump+MCP server; component failures notify-and-continue (warn closure in local_database.rs setup; DB + python validation stack stay fatal). Updates tab = plain Components list vs each component's own latest official release (digest-verified).
Engine question tool enabled for the exa agent + questionnaire card UI (useOpenCodeQuestions + replyToQuestion); prompt directs the agent to look up real options (list databases via MCP) before asking. Seed migrations keep permission+prompt current on drift.
Sandbox: webfetch/websearch denied by default in the exa agent seed; AI Settings → Guardrails 'Exa sandbox' toggle flips them via new /v1/engine/network route (single-writer config + engine restart). CRUD grants: shield control next to mode switcher (READ always; C/U/D checkboxes persisted, ride as a hard directive).
Fork v1.18.12-exa.3: TUI ASCII logo (exa in upstream's block font), terminal DEFAULT_TITLE, CLI scriptName — three central points only; identifiers/config filenames stay upstream for merge safety.
Also this arc: attachments via OpenCodeAttachmentAdapter (multi-select; composer.send() path carries them), paste>4k→text attachment, ui/attachment card system for files+@-chips (horizontal strip, click file → editor tab), tokens row in timing popover, user-message Copy, borderless reasoning + wheel-based scroll unpin (position heuristics swallowed scrolls during streaming growth).


## [2026-08-12] review | Codex review of the sandbox/questionnaire/observability arc — 6 findings, all applied
HIGH supervisor.ts: start() SIGTERM'd an 'ours' survivor, waited 3s, spawned anyway — waitOurs then re-adopted the stale process. Now: SIGTERM → wait → SIGKILL → wait → REFUSE (state failed) if the port never frees.
HIGH engine-service.ts: restartForConfig raced ensureClient start() — stale ready/crash over newer state. Fixed with a withLifecycle promise-chain mutex (cached-client fast path stays lock-free).
HIGH upstream.rs: 8-char suffix let '-aarch64' match a LINUX asset for a macOS lock name when the platform asset is missing (digest can't catch wrong-OS). Min suffix 12 + tie refusal + tests.
MED thread.tsx: user-message Copy copied RAW text → leaked hidden <exa_context> directives to clipboard; custom copy strips.
MED context.ts: user-typed sentinel tags could hide their own text / swallow the message; neutralizeSentinels() on send (same as buildPrompt </context>), tested.
MED local_database.rs/Marketplace: failed bootstrap component reported verified version as installed → 'shows latest, no retry'. Failed → installed:None + Install button.
Also this arc: run watchdog (poll session status while UI running; engine idle → resync — recovers lost event streams), webview.log console tee + append_app_log, force-abort side channel on Stop, machine-context sentinel, ENGINE_BASELINE_TAG precedence over stale component copies, exa.4 CLI branding (wordmark + by Exasol).


## [2026-08-29] review | Codex review of question-stepper/persona-sync (Studio PR #67) — 4 findings fixed
personaFromAnswers: 'who is/are' matched audience questions ('Who is this report for?') — persona must only follow the USER's own role; audience/target/recipient/reader questions are now excluded.
personaFromAnswers: positive-only substring matchers assigned personas from negated text ('not a developer') — a negation guard (not/n't/except/non-) now skips those answers.
ExaQuestionnaireCard: options/custom input stayed editable while replyToQuestion was in flight, desyncing the sent snapshot — inputs now disabled while busy.
ExaQuestionnaireCard: step index could point past a changed question set — now clamped against the live count.
Also shipped: web market_detect in exa studio-ipc (CLI-installed Personal shows detected/running), personal_local_status fetch+poll in web sidebar (was Tauri-only), web settings as expandable modal, Docs button icon+label.


## [2026-08-31] release | v2026.5.0 desktop release + CI merge gate; llama.cpp latest is now a semver marker
CI (.github/workflows/ci.yml) is now a REQUIRED check on main: js job (tsc, vite build, desktop/agent-core/parser node:test) + rust job (cargo test with stubbed frontendDist and stubbed tauri bundle-resource paths — tauri-build verifies each path exists).
llama.cpp gotcha: /releases/latest now redirects to a semver marker release (v0.3.0) whose only asset is nightly-tag.txt naming the blessed b#### tag; binaries live on b-tags. fetch-runtime.mjs resolves through the marker (PR #70). v2026.5.0 first failed on ALL 5 targets with 404 llama-v0.3.0-bin-*.
exa releases now pin STUDIO_REF to a Studio release tag (v2026.5.0) in exa-release.yml and gate asset upload on a web smoke test (shell + hashed asset + /ipc/vault_status + /docs/exa). exa v2026.1.81 shipped 12 assets; only npm publish failed (EOTP — token doesn't bypass npm 2FA; needs a granular/automation token).


## [2026-09-01] ingest | Git Log dock tab (GitDesktop port), MCP icon sync, dynamic marketplace metadata, SQL history filter/dup fixes (PRs #94, #95)
PR #94: GIT LOG dock tab right of SQL HISTORY, ported from Apache-2.0 theBGuy/GitDesktop (attribution: THIRD-PARTY-NOTICES.md + licenses/GitDesktop-Apache-2.0.txt). New Rust commands git_log_rich/git_commit_details/git_commit_files/git_commit_file_diff in git.rs with parser tests. Codex findings fixed: stale-response guards on selection + per-file diff, rename pathspecs (numstat oldPath), search cap labeled.
PR #94: MCP glyph single-sourced — boxicons 'mcp' now carries the official MCP mark paths; brand/McpMark wraps <Icon name=mcp>; ActivityRail's local duplicate deleted; ExaMcpPanel + marketplace mcp-server card use it.
PR #94: marketplace catalog moved to catalog-data.ts — entries are {id, repo, kind, install}; name/About/homepage resolve from GitHub via market_repo_meta (24h disk cache in Rust market.rs, localStorage snapshot, repo-tail fallback). Adding an addon = one registry line. Engine web parity: market_repo_meta added to exa studio-ipc.ts (cache ~/.exasol/repo-meta.json).
PR #94: Updates view no longer claims 'everything is up to date' while IndependentComponents is loading/listing — actionableComponents() shared predicate, onActionable prop, totalUpdates badge.
PR #95 root cause: history ids were h-<timestamp-millis>; same-millisecond runs collided and duplicate React keys duplicated rows on sort. Fix: atomic sequence suffix + stable original-position render keys for legacy dups. Status/Command headers now value-filter dropdowns (checkbox multi-select + explicit sort items).

