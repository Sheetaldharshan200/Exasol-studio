# Tasks

## 1. Remove the second engine
- [x] Studio: `features/dashboard`, `features/artifact`, sidebar panel, tab views, shell open/render, IPC, Rust `dashboards.rs`, assistant actions, notebook button + import menu, agent-client sections, persistence tests.
- [x] agent-core: stores, tools, routes, share server, prompt, routing, rescue rules, skills, tests.

## 2. Host dash-server
- [x] `dash_server.rs`: resolve, start with the connection's environment, adopt, stop on exit, apps via MCP. Pure helpers tested.
- [x] `DashServerTab`: gate (install), connection picker, start/stop, app list, frame, open in browser.
- [x] Shell: `dashboards` view + rail item as a full tab.

## 3. The agent builds there
- [x] Seed the `dash-server` remote MCP; prompt guidance; `ui_open("dashboards")` opens the tab.

## 4. Verify
- [x] Typecheck, node + Rust tests, agent-core tests; Codex review; build; PR.
