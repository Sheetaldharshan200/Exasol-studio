# Exa agent v2: opencode engine (prebuilt, MIT) + Studio-native panel

## Why

We want a production-grade, maintained, trustworthy agent core instead of growing our hand-rolled loop forever. Survey of complete prebuilt agent products (2026-08-04, facts from the repos):

| Product | License | Stars | Lang | Shape | Verdict |
|---|---|---|---|---|---|
| **opencode** (anomalyco/opencode) | **MIT** | **193k** | TS | client/server + typed SDK + protocol + their own desktop app on those surfaces | **Adopt** |
| codex (openai/codex) | Apache-2.0 | 104k | Rust | app-server protocol; OpenAI-centric providers | runner-up |
| gemini-cli (google) | Apache-2.0 | 106k | TS | embeddable core; Gemini-centric | runner-up |
| OpenHands | MIT | 83k | TS | server + sandboxed runtime; heavier ops | no |
| cline / Roo Code | Apache-2.0 | 65k / 24k | TS | VS Code-extension-shaped (Roo quiet since 2026-05) | no |
| goose (Block) | Apache-2.0 | 52k | Rust | whole desktop/CLI product | no |
| aider | Apache-2.0 | 48k | Python | CLI, quiet since 2026-05 | no |
| crush | FSL (not OSI) | 27k | Go | license fails the bar | no |
| Brockley | Apache-2.0 | 17 | Go | server-side control plane, Docker/Postgres | no (evaluated earlier) |

opencode is the only candidate that is simultaneously MIT (rebrandable), enormous and org-backed (24.7k forks, pushed daily), TypeScript (our sidecar skill set), **embeddable by design** (server + SDK are the product's own foundation — their desktop app eats the same dog food), provider-agnostic with local-first support (Ollama / LM Studio / any OpenAI-compatible server → llama.cpp, vLLM, SGLang, TGI), and **MCP-native** — which means Studio's existing exasol-studio MCP gateway plugs our in-database tools straight in.

## What Changes

- **Engine**: agent-core's hand-rolled loop is replaced by an embedded **opencode server** sidecar (pinned version, bundled binary — no Docker, no external installs), spoken to via the official typed SDK (sessions, messages, events, permissions). Rebranded as **Exa** in the UI (MIT permits; upstream attribution kept in licenses).
- **Our moat re-attaches via MCP**: the exasol-studio MCP gateway exposes the DB tools (query, schema, profiling, knowledge base) to the engine; the `classifySql` safety gate stays enforced inside OUR tool layer, so no model or engine change can bypass SQL review.
- **Tool/permission scoping**: opencode is coding-agent-shaped (shell/file tools) — Studio's default agent profile disables shell and scopes filesystem, mapping opencode's permission prompts into Studio's review UI.
- **Local Runtime UX**: runtime/model discovery (Ollama 11434, LM Studio 1234, user-added OpenAI-compatible URLs) surfaced in Studio's model picker, configured into opencode's provider config.
- **Panel**: Studio-native React panel (assistant-ui MIT primitives, continue.dev interaction grammar) rendering opencode sessions/events — opencode's own UI packages are SolidJS, so UI stays ours by design.
- **exa CLI**: the same engine shipped as a terminal experience (`exa` command — the engine's TUI/CLI surface rebranded), sharing the app's isolated config, sessions, MCP tools, and provider registry, so a chat started in the terminal is visible in the sidebar and vice versa. Installable from the app ("Install exa CLI to PATH") and included in every installer.
- **Provider hierarchy — local first**: the model picker and defaults rank (1) **Local Runtime** (Ollama / LM Studio / OpenAI-compatible), (2) **In-DB AI** (Exasol-grounded intelligence: the MCP DB toolset, and in-database inference via the Exasol Text AI / UDF path where installed), (3) cloud providers as explicit options — never the silent default.
- **Packaging**: engine + CLI binaries bundled per platform inside the existing installers (dmg/exe/AppImage) through the runtime-bundle pipeline — no separate download, no Docker, works offline with local models.
- Migration is strangler-style: the new engine mounts behind the existing panel entry; the old loop is removed when parity is reached.

## Capabilities

### New Capabilities
- `agent-engine`: embedded opencode server lifecycle (spawn, health, version pinning, crash recovery), SDK session/message/event bridge, permission mapping, rebrand rules.
- `local-runtime`: discovery, health, and model inventory for Ollama / LM Studio / OpenAI-compatible endpoints, feeding the engine's provider config; provider ranking (Local → In-DB AI → cloud); honest degradation when a model lacks tool calling.
- `chat-panel-v2`: sessions, @ context providers, tool-call cards, per-session model picker, interruption, apply-through-diff — rendered Studio-native from engine events.
- `exa-cli`: the terminal surface of the same engine — shared config/sessions/tools with the app, installed to PATH from the app, bundled in every installer.

### Modified Capabilities
<!-- none: existing behavior remains until superseded feature-by-feature -->

## Impact

- `packages/agent-core` shrinks to: engine supervisor + MCP gateway + Studio-specific tools (classifySql stays here); loop.ts retired at parity.
- `AssistantPanel.tsx` (1,937 lines) replaced by `features/assistant/panel/` on assistant-ui.
- New pinned dependency: opencode release binary per platform (bundled like other runtimes; update cadence controlled by us).
- Risks tracked in design: upstream API velocity (pin + SDK versioning), coding-tool surface (permission profile), binary size.
