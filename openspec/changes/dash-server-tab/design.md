# Design

## Hosting dash-server

`dash_server.rs` owns one child: the `dash-server` command of the Marketplace
install (`<market>/dash-server/venv/bin/dash-server`, else one on PATH).
Start takes a connection profile id and runs the command with
`DASH_SERVER_PORT=5100`, `DASH_SERVER_INSTANCE_PATH=<data>/dash-server`, and
the bootstrap variables for that profile: `DASH_SERVER_EXASOL_PROFILE_NAME`
(a slug of the profile name), `_DSN=host:port`, `_USER`, `_SECRET_ENV_VAR=EXA_PASSWORD`
with `EXA_PASSWORD` read from the vault into the child's environment only,
`_OVERWRITE=true` so a changed connection applies, and `_TLS_VERIFY=false`
when the profile's TLS mode does not validate the certificate (dash-server
already skips verification for loopback). Output is discarded; the child is
kept in managed state and killed on exit. Health is `GET /apps/demo`.
A server already answering on the port is adopted only when its MCP answers
`resources/read dash://apps` — the same rule as the decision engine.

Apps come from `dash://apps` through one JSON-RPC call to `/mcp`: name,
title, route, status, published. The tab shows them and renders the chosen
route in a frame: `http://127.0.0.1:5100/apps/<name>`. The frame is the
component's own UI; Studio adds a header (connection, app picker, start and
stop, open in browser) and nothing else.

## The agent

The sidecar seeds a `dash-server` MCP server of type `remote` at
`http://127.0.0.1:5100/mcp` when Rust hands it `EXA_DASH_SERVER_MCP`. The
engine connects when the server runs. The Exa prompt says: dashboards and
artifacts are built with dash-server's tools (`app_create_exasol_dashboard`,
`app_scaffold_from_schema`, `app_create_from_files`, then `app_promote_revision`);
when those tools are absent, tell the person to open the Dashboards tab and
start the server. The notebook-era guidance, the `dashboard_*` and
`render_artifact` tools, their skills, their text-rescue aliases and the
`ui_open("dashboards")` target's meaning (now the dash-server tab) follow.

## What goes

| Studio | agent-core |
|---|---|
| `features/dashboard/*`, `features/artifact/*` | `dashboards.ts`, `artifacts.ts`, `share-server.ts` + tests |
| `DashboardsPanel` in the sidebar, rail `dashboard` as a panel | `dashboard_*`, `render_artifact` tools; `want()` routing; prompt paragraphs |
| `DashboardTab`, `ArtifactTab`, `openDashboard`, `openArtifact`, `TabView` `dashboard`/`artifact`, `dashboardId`/`artifactHtml` | `/v1/dashboards*`, `/v1/artifacts*`, `/v1/gateway/dashboards*`, `/v1/gateway/share/*` routes; `service:dashboards` exposure |
| Rust `dashboards.rs` + IPC | tool-repair dashboard/artifact aliases and JSON rescue + tests |
| assistant `dashboard_*` actions + names + tests; `next-actions` "Add to a dashboard" → "Build a dashboard" | skills `dashboard-builder.md`, `artifact-builder.md`; session event kinds |
| notebook *Open as dashboard*, *Import dashboard*; `agent-client` dashboards/artifacts | `compact.ts` wording |

The `Dashboard` type the System dashboards use moves to `features/bi`.

## Files

- `src-tauri/src/dash_server.rs` (+ pure: env building, slug, apps parsing; tested)
- `features/dashserver/DashServerTab.tsx`, `apps.ts` (pure list parsing)
- `agent-core/src/engine/engine-service.ts` (remote MCP seed, prompt), `loop.ts`, `tools.ts`, `server.ts`, `cli.ts`, `tool-repair.ts`
