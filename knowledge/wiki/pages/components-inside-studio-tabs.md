---
title: Components render inside Studio tabs — dashboards through dash-server, not a second engine
category: architecture
type: decision+gotcha
updated: 2026-09-30
---

# The direction

Studio hosts the ecosystem's components inside its tabs and drives them; it
does not duplicate them. Decided 2026-09-30 (change `dash-server-tab`):

- **Dashboards → dash-server** (exasol-labs/dash-server). Studio's own
  dashboard engine — canvas, document store, agent `dashboard_*` tools,
  live-share server, the notebook's *Open as dashboard* — and the agent's HTML
  *artifact* tool and tab are gone (95 files, −5,250 lines). The notebook
  keeps cells, charts and the built-in **System dashboards** (types now in
  `features/bi/system-dashboards.ts`).
- **Query traceability → Panorama beside Query Performance.** Panorama is a
  lineage canvas (what came from what), not an execution profile; Query
  Performance stays. Panorama's tab needs Studio to act as its *shell*
  (change `panorama-shell`, next): a browser frame cannot reach a
  self-signed local database, Panorama's page asks a Tauri command
  `database_proxy` for a loopback `ws://…/database?token=&target=` bridge
  only when `__TAURI_INTERNALS__` exists.
- **The agent builds dashboards and artifacts in dash-server** through its
  MCP (remote, Streamable HTTP, `http://127.0.0.1:5100/mcp`), seeded into the
  engine config by the sidecar from `EXA_DASH_SERVER_MCP`, and into the
  sidecar's own `McpManager`. When the tools are absent it says to open the
  Dashboards tab and start the server — never builds elsewhere.

# How the Dashboards tab hosts dash-server (`dash_server.rs`)

- Command: **only** `<market>/dash-server/venv/bin/dash-server` (the
  Marketplace pip-release install). Never PATH — the process receives a
  connection's password in its environment.
- Start for a connection: `DASH_SERVER_PORT=5100`,
  `DASH_SERVER_INSTANCE_PATH=<data>/dash-server`, bootstrap
  `DASH_SERVER_EXASOL_PROFILE_NAME=<slug>-<id8>` (unique per connection id),
  `_DSN=host:port`, `_USER`, `_SECRET_ENV_VAR=EXA_PASSWORD`, `EXA_PASSWORD`
  from the vault, `_OVERWRITE=true`, `_TLS_VERIFY=false` unless the profile's
  mode `starts_with("verify")` (`verify_ca` / `verify_identity` — with
  underscores; a hyphen comparison silently disabled verification for both).
- Health/adoption: `resources/read dash://apps` over `/mcp` must return an
  `apps` array. Exited children are reaped (`try_wait`) before any decision.
  A server Studio did not start is used, labelled "started outside Studio",
  never stopped from the tab.
- Apps: `dash://apps` → `{apps:[{name,title,route,status,published}]}`;
  routes must be `/apps/…` or `/preview/…` (checked in Rust and again in
  `apps.ts::appUrl`, which also pins the origin) before the frame gets them.
  The frame is sandboxed (`allow-scripts allow-same-origin allow-forms
  allow-downloads`, no referrer).
- After a start Studio POSTs the sidecar `/mcp/dash-server/reconnect` and
  `/engine/mcp/dash-server/connect` (best effort) so tools appear.

Live-checked here: dash-server v0.1.1 (`uv pip install <tag tarball>`),
`--help` shows `--host/--port/--instance-path`, `/apps/demo` 200, `tools/list`
53 tools incl. `apps_list`, `app_create_exasol_dashboard`.

Codex: 13 findings, 12 fixed; kept: adopting a listener that answers the
inventory (same rule as the decision engine; the agent points at the port
regardless) and the plain JSON-RPC probe without MCP `initialize` (dash-server
answers it; verified live).
