## 2026-08-01 — in-app updater UX, non-destructive restart, local-setup loader; release 2026.1.0
- **Update flow is pull-based**: `UpdateBanner` calls `check()` once on launch (no polling). Publishing a `v*` release doesn't push — devices pick it up on their next start, comparing their `tauri.conf.json` version to `latest.json`. `check()` only returns a strictly-newer build, so it never re-notifies after install. See wiki/pages/in-app-updater-and-fresh-restart.md.
- **Phased UX**: available → downloading → downloaded → installing → installed. `update.download(onEvent)` (byte progress) → `update.install()` → `relaunch()`. Proper status: "Starting the download…" → "Downloading… X.X MB" (no total) → "N%" + thin bar. Minimizable to a corner pill; also surfaced in the notification bell (`studio:notice`, `go:"update"`).
- **GOTCHA**: the "big green circle" during download was `.exa-indeterminate` (position:absolute + glow) escaping its bar because the wrapper lacked `position:relative` → it sized to the whole banner card. Removed the indeterminate animation from UpdateBanner; kept a contained determinate bar. Any `.exa-indeterminate` usage needs a `relative` parent.
- **relaunch() permission**: `relaunch()` → command `plugin:process|restart` → needs `process:allow-restart` (there is no `allow-relaunch`). Restart only works on an installed `.app`, not `tauri dev`.
- **Non-destructive restart**: `lib/workspace-persist.ts` persists tabs/groups/active-tab to localStorage (identity + SQL + object/dashboard ref only; drops results/run-status/plan/artifact) and rehydrates on mount; debounced save + `pagehide`/`beforeunload` flush. Active AI session id remembered + restored in AssistantPanel (sessions also persist server-side).
- **Local-setup loader**: `LocalSetupFloating` shows a determinate bar + only the 3 essentials (Exasol Personal (local) · ExaPump · MCP server). The rest (`pyexasol`, `agent-skills`, `fable-method` = "Fable Method" skill, `semantic_views`) install silently. Verified-download (`local_runtime.rs`) got timeouts + 4-attempt backoff (`retryable_status`) after a transient exapump "error sending request".
- **Fresh wipe**: `kill -9` the `mac-runner-aarch64 __daemon__` (frees 8565/2224), kill Studio `mcp-gateway.cjs`, rm `~/Library/{Application Support,WebKit,Caches}/com.exasol.studio` (~2.8G). Leave the llm-wiki/obsidian MCP servers.
- **Release 2026.1.0**: cut from `agent-sql-casing` (tag `v2026.1.0`); version bumped in package.json + tauri.conf.json + Cargo.toml + Cargo.lock. `main` is protected/squash-merge, so the tag can be ahead of main.

## 2026-07-26 — mandatory code-quality workflow (Codex)
- Codex CLI 0.145.0 installed globally (npm, ChatGPT auth); Claude Code plugin openai-codex/codex 1.0.6 (/codex:setup, /codex:rescue, codex-rescue subagent; review gate available but off).
- Standing rule (CLAUDE.md + wiki/pages/dev-workflow-codex.md): every substantive change → typecheck → unit tests WITH edge cases (empty/null/boundary/identifier-folding/error paths) → independent Codex review → fix all reds/valid findings BEFORE commit → log notable findings in the wiki.
- Style: KISS (simplest thing that works) + SOLID (single responsibility first), no speculative abstraction.

## 2026-07-24 — Connection Properties page + MCP gateway service bus + log polish
- **Connection Properties tab** (`view: "connProps"`, sidebar ⋯ → Properties): DBVis-style Connection (table-based profile editor) + Properties (category rail w/ search: Database Profile, Driver Properties, Authentication, Delimited Identifiers, Qualifiers, Physical Connection, Transaction, Encoding, SQL Statements, Connection Hooks, Color and Border, SQL Editor, Query Builder). Unified info-page design (section cards, label/value rows). Defaults…/Apply bottom bar. See wiki/pages/connection-properties.md; plan in repo-root tasks.md.
- Settings: raw JSON per profile (`connection_settings.rs` → connection-settings.json); frontend owns shape (`ConnSettings`). Rust WIRES: connect/disconnect hooks, keep-alive (pool clone + is_closed), pool size / single shared connection, password policy (clear-at-disconnect / session-only). Rest stored + consumed at SQL emitters (sweep = backlog).
- Accent color paints the sidebar connection row (stripe + icon tint).
- **MCP gateway = service bus**: per-connection services (sql, text_to_sql) + Studio services (dashboards), selectable in Marketplace → AI clients; sidecar 403s per capability; bridge tools generate_sql (never auto-runs), list/get_dashboard.
- Execution log: Exec/Fetch split (stream first-answer vs row streaming), rows "N+" when capped, sortable headers, cell detail modal, SQL cell opens a query tab (existing-or-new).


## 2026-07-23 — marketplace redesign + AI integrations
- Marketplace: horizontal tabs (Kits first → Catalog → Updates/Installing/Installed → Categories ▾ → AI clients); kit contents modal with top-right + install; raw icons.
- AI clients tab: one-click Exasol MCP into Claude/Cursor/Copilot/Gemini configs (backup kept), snippets for Codex/OpenCode; read-only STUDIO_MCP_* identity. Separate from in-app connectors — see wiki/pages/ai-integrations.md.
- agent-core: HTTP MCP transport (StreamableHTTP + SSE fallback) — self-sustained, no Docker.
- Agent prompt: no fabricated sample rows; prompts genericized (no real dataset names). Chat: collapsed-table reflow, no stream caret.
- Schema visualizer icon → ER-diagram glyph.
