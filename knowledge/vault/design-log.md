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
