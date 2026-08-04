---
title: Exa agent engine (opencode) — architecture, source of truth, status
category: decision
---

# Exa agent v2 — the opencode engine

**Decision (2026-08-04):** replace the hand-rolled agent loop with **opencode** (github.com/anomalyco/opencode, MIT, 193k★) rebranded in-product as **Exa**. Chosen over codex/gemini-cli/goose/aider/cline/crush/Brockley after a full survey (recorded in the OpenSpec change `exa-agent-v2-local-runtime`). Reasons: MIT (rebrandable), embeddable by design (server + typed SDK), provider-agnostic + local-first, MCP-native so Studio's exasol-studio gateway carries our DB tools with `classifySql` still enforced in OUR layer.

## Source of truth = opencode GitHub Releases
The engine binary comes from opencode's **GitHub Releases** through the same component-mirror mechanism as exasol-personal/exapump — NOT npm. `catalog.json` item `exa-agent` → repo `anomalyco/opencode`, latest `v1.18.12`, `mirrorTag mirror-exa-agent`; Rust `component_repo(ExaAgent)` matches. Per-platform assets (verified v1.18.x): `opencode-darwin-{arm64,x64}.zip`, `opencode-linux-{arm64,x64}.tar.gz`, `opencode-windows-{arm64,x64}.zip` (the `opencode-desktop-*` assets are their Electron app — do NOT embed those). The npm `@opencode-ai/sdk` is ONLY the typed client to the spawned server.

## Two-layer versioning (anti-clash rule)
- **Engine payload** = the release binary, in the component dir, versioned by its own release line, replaced by a component update.
- **Studio overlay** = MCP tool wiring, DB-scoped profile, provider ranking, rebrand strings — app-owned dir a component update NEVER writes.
A component update swaps only the payload; our edits and upstream bumps can't collide. `ComponentId::ExaAgent` gives it its own `installed.json`.

## Architecture
- Server: spawn `opencode serve --hostname 127.0.0.1 --port <n>` (flag spelling pending verification against the pinned release — one place: `engine/spawn-args.ts`), config pinned to Studio's dir via `OPENCODE_CONFIG_DIR`/`XDG_*` so app + `exa` CLI share sessions.
- Client: `@opencode-ai/sdk` `createOpencodeClient({ baseUrl })` → `session.{list,create,prompt,abort}`, `event.subscribe()` (SSE), permissions via `postSessionIdPermissionsPermissionId`.
- Bridge: `engine/bridge-map.ts` maps raw SDK events → `StudioAgentEvent` union so the panel is engine-agnostic (swap cost bounded).
- Supervisor: `engine/supervisor.ts` + pure `supervisor-policy.ts` (port pick, backoff, restart budget, terminal states). Binary absent → clean "not installed" (it's a Marketplace component).

## Provider hierarchy (LIVE)
`providers.ts` ranks Local Runtime → In-DB AI (`in-database` provider) → cloud via `engine/runtime-registry.rankProviders`; `pickDefaultProvider` never makes cloud the silent default.

## Status (this session)
Done + tested (246 agent-core + 65 Rust): component id/catalog, release asset mapping, spawn-args, supervisor(+policy), client(+bridge), runtime registry/ranking (live), capability cache, context chips. NOT yet: per-platform binary download/bundle into the pipeline (4.x), server routes exposing the engine to the frontend, assistant-ui panel (3.x), `exa` CLI install/packaging (5.x), DB-profile config + permission UI wiring (1.4/1.5), E2E against a real binary. These need the vendored binary + `@assistant-ui/*` dep + platform build env.
