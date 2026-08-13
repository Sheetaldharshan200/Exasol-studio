---
title: Exa agent engine (opencode) — architecture, source of truth, status
category: decision
---

# Exa agent v2 — the opencode engine

**Decision (2026-08-04):** replace the hand-rolled agent loop with **opencode** (github.com/anomalyco/opencode, MIT, 193k★) rebranded in-product as **Exa**. Chosen over codex/gemini-cli/goose/aider/cline/crush/Brockley after a full survey (recorded in the OpenSpec change `exa-agent-v2-local-runtime`). Reasons: MIT (rebrandable), embeddable by design (server + typed SDK), provider-agnostic + local-first, MCP-native so Studio's exasol-studio gateway carries our DB tools with `classifySql` still enforced in OUR layer.

## Source of truth = opencode GitHub Releases
The engine binary comes from opencode's **GitHub Releases** through the same component-mirror mechanism as exasol-personal/exapump — NOT npm. `catalog.json` item `exa-agent` → repo `anomalyco/opencode`, latest `v1.18.12`. Per-platform assets: `opencode-darwin-{arm64,x64}.zip`, `opencode-linux-{arm64,x64}.tar.gz`, `opencode-windows-{arm64,x64}.zip` (the `opencode-desktop-*` assets are their Electron app — do NOT embed). npm `@opencode-ai/sdk` is ONLY the typed client. Pin lives in TWO places that must agree: `catalog.json` (runtime component update) and `scripts/fetch-runtime.mjs` `EXA_ENGINE_TAG` (bundled baseline).

## Two-layer versioning (anti-clash rule)
- **Engine payload** = the release binary. `resolve_engine_binary` = installed component copy (`<data>/…/exa-agent/bin`) → bundled baseline (`resources/runtime/exa-engine`). A component update replaces only the payload.
- **Studio overlay** = MCP wiring, DB profile, provider ranking, rebrand — app-owned dir a component update NEVER writes.
`ComponentId::ExaAgent` gives it its own `installed.json` + independent release line.

## Architecture (all built)
- Install: Rust `engine_install(tag)` downloads the release asset (`engine.rs::asset_for`, parity-tested with `opencode-release.ts`), extracts to the component dir, records `installed.json`. Baseline bundled by `fetch-runtime.mjs` → `resources/runtime/exa-engine` for offline first-run.
- Supervisor (`agent-core engine/supervisor.ts` + pure `supervisor-policy.ts`): spawns `opencode serve --hostname 127.0.0.1 --port N` (flag spelling: `engine/spawn-args.ts` — verify against the pinned release), config pinned via `OPENCODE_CONFIG_DIR`/`XDG_*`. Sidecar gets `EXA_ENGINE_BIN`/`EXA_ENGINE_CONFIG_DIR` from `agent.rs spawn_sidecar`.
- Client (`engine/client.ts`) over `@opencode-ai/sdk` — MANAGEMENT ONLY (sessions list, providers, auth/OAuth, MCP). Chat is NOT proxied: the webview talks to the engine directly.
- Routes: agent-core `server.ts` `/v1/engine/{status,sessions,providers,auth,mcp,oauth,…}` — management routes only. The old chat proxy (prompt/abort/permission/messages replay, `/v1/engine/events` SSE, Rust `engine_stream` → `engine-event`, `bridge-map.ts`/`replay-map.ts`) was DELETED 2026-08-06 when chat moved to the official runtime.
- Panel: `features/assistant/ExaEnginePanel.tsx` — install gate, engine status, model/provider management, sessions sidebar data, modes/chips/slash commands. Chat renders in `exa/ExaThread.tsx` on **@assistant-ui/react-opencode** (`useOpenCodeRuntime`): the webview holds an opencode SDK client (`exa/engine-client.ts`) built on **tauri-plugin-http**'s fetch (Rust-side requests, streaming Response body → SSE works; capability-scoped to `http://127.0.0.1:*`). The runtime owns messages/streaming/sessions/permissions; `defaultAgent: "exa"` pins the guardrail agent. `exa` CLI: `engine_install_cli` shims the binary to PATH sharing the config dir.
- Provider hierarchy LIVE: `providers.ts` ranks Local → In-DB (`in-database`) → cloud; cloud never the silent default.

## Status
Code-complete + green (244 agent-core + 69 Rust tests, tsc + builds): install, supervisor, client/bridge, routes/SSE, panel, CLI install-to-PATH, provider ranking, component id/catalog, installer bundling. NOT E2E-verified here (needs a real platform build + the ~30 MB binary): the live download/extract, `opencode serve` flag spelling, live chat, and the CI build actually fetching the baseline. 2026-08-06: chat swapped onto the official `@assistant-ui/react-opencode` runtime (registry thread UI + `useOpenCodeRuntime`); the hand-rolled external-store bridge and its whole proxy chain were removed.
