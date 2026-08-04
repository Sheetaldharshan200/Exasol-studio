# Design — exa-agent-v2 (opencode engine)

## Context

Chosen engine: **opencode** (anomalyco/opencode, MIT, 193k★, pushed daily) — client/server architecture whose own desktop app runs on the same `packages/server` + `packages/sdk` + `packages/protocol` we would embed. Providers ride the AI SDK ecosystem (local: Ollama/LM Studio/OpenAI-compatible; every major cloud). MCP support lets Studio's existing exasol-studio MCP gateway carry our in-database tools unchanged. Constraints intact: no Docker/external installs (we bundle the pinned binary like other runtimes), passwords never to the frontend, KISS file rules. opencode's UI packages are SolidJS — panel stays ours (React/assistant-ui).

Runners-up recorded for posterity: codex (Apache-2.0, Rust, OpenAI-centric), gemini-cli (Apache-2.0, Gemini-centric). Rejected: OpenHands (ops-heavy runtime), cline/Roo (VS Code-shaped), aider (Python, quiet), crush (FSL), goose (whole Rust product), Brockley (server control plane, 17★).

## Goals / Non-Goals

**Goals:**
- Production-grade engine we do not maintain alone; Studio keeps the SQL-domain moat via its own MCP tool layer.
- Local-first models with zero config when a runtime is running; any OpenAI-compatible endpoint addable.
- Studio-native panel with the continue.dev interaction grammar; AssistantPanel finally split per KISS.
- Controlled upgrades: engine version pinned, updated deliberately, changelog-reviewed.

**Non-Goals:**
- Forking opencode (we configure + wrap, never patch upstream in v1); server-side agent fleets; shell-enabled coding profile by default; embedding opencode's Solid UI.

## Decisions

1. **Engine as supervised sidecar.** agent-core gains `engine/supervisor.ts`: spawn the bundled opencode server on a localhost port with a Studio-owned config dir, health-check, restart with backoff, hard version pin (binary shipped per platform in the existing runtime-bundle pipeline). No user-level opencode install is read — Studio's config dir is isolated.
2. **SDK bridge, not raw HTTP.** All panel traffic goes through the official typed SDK (sessions, messages, streamed events, permission requests). A thin `engine/bridge.ts` maps SDK events → Studio's LoopEvent-style union so the panel is engine-agnostic if we ever swap again.
3. **Tools via MCP only.** The engine's shell/file tools are disabled in the default "Exa (DB)" agent profile; capabilities come from the exasol-studio MCP gateway (query/schema/profile/KB) where `classifySql` and the review flow already live. A separate opt-in "developer" profile may enable file tools later.
4. **Permissions mapped to Studio UX.** opencode permission prompts surface in the panel as the existing two-step Review/Confirm pattern; nothing auto-approves.
5. **Local Runtime discovery stays ours** (probe 11434/1234/user URLs with shape validation) and writes the engine's provider config; capability probe (tools y/n) drives honest reduced-mode messaging.
6. **Panel on assistant-ui (MIT)** themed to Studio tokens; @ context providers resolve from sqlCatalog/editor/results and are injected as message parts through the SDK.
7. **Rebrand rules:** product surface says Exa; About/licenses page credits opencode (MIT) and dependencies; we do not remove upstream copyright headers.
8. **One engine, two front ends.** The sidebar (SDK client → server) and the `exa` CLI (opencode's TUI/CLI rebranded) both point at the SAME Studio config dir + session store + MCP layer + provider registry. The CLI is a thin launcher over the bundled binary with Studio's config path injected — a session is identical data whichever surface created it. No second brain, no divergence.
9. **Provider ranking is data, not code branches.** A single ordered registry (Local → In-DB → cloud) drives both the picker and the default-selection rule; "In-DB AI" = the always-present MCP DB toolset plus, where the Exasol Text AI / UDF path is installed, in-database inference exposed as a provider. Cloud is never auto-selected.
10. **Packaging via the existing runtime-bundle pipeline.** Engine server + `exa` CLI binaries are fetched per platform at build time (pinned), placed beside the other bundled runtimes, and referenced by the supervisor and the CLI installer by resolved path — so dmg/exe/AppImage carry everything, install offline, and need no Docker. "Install exa CLI to PATH" symlinks/shims the bundled binary; verified per-OS.

## Risks / Trade-offs

- **Upstream velocity** (daily pushes, fast majors): mitigated by hard pinning + our own smoke suite against the SDK surface before any bump.
- **Coding-agent defaults** (shell, repo assumptions): mitigated by profile scoping at config level and permission mapping; verified by tests that the DB profile exposes only MCP tools.
- **Binary size** (+1 sidecar): acceptable against the runtime bundles we already ship; measured in CI.
- **SDK/protocol drift**: bridge isolates the app from the SDK; the LoopEvent union is ours.
- **If opencode's direction diverges**, the bridge + MCP tool layer keep the exit cost bounded (codex/gemini-cli both speak similar shapes; ACP exists as a neutral protocol).
