# Tasks — exa-agent-v2 (opencode engine)

## 1. Engine adoption (agent-core)

- [ ] 1.1 Bundle the pinned opencode server binary per platform via the existing runtime-bundle pipeline; record the pin + upgrade procedure in llm-wiki.
- [ ] 1.2 `engine/supervisor.ts`: spawn on a localhost-only port with an isolated config dir, health check, restart with backoff, clean shutdown with the app; `supervisor.test.ts` for the pure state machine (ports, backoff, give-up).
- [ ] 1.3 `engine/bridge.ts`: official SDK client; map sessions/messages/streamed events/permission requests to Studio's engine-agnostic event union; `bridge.test.ts` for the pure event mapping.
- [ ] 1.4 DB-scoped agent profile: engine config exposing ONLY the exasol-studio MCP gateway tools (shell/file disabled); test asserting the profile's tool list.
- [ ] 1.5 Permission mapping into the existing Review/Confirm UX; denial paths reported to the model; classifySql stays enforced in the MCP layer (existing tests keep passing).

## 2. Local Runtime (discovery → engine config)

- [ ] 2.1 Runtime discovery: probe Ollama (11434, `/api/tags`), LM Studio (1234, `/v1/models`), user-added OpenAI-compatible URLs; shape-validated, 300ms timeouts; persisted registry; `runtime-registry.test.ts` (shape validation, dedupe, unreachable).
- [ ] 2.2 Write discovered runtimes/models into the engine's provider config; per-session model selection through the SDK.
- [ ] 2.3 Capability probe (tool-calling y/n per model, cached) → honest reduced-mode messaging; test cache/invalidation.

## 3. Chat panel v2 (frontend)

- [ ] 3.1 `features/assistant/panel/` on assistant-ui (MIT) themed to Studio tokens: SessionList (from engine sessions), per-session ModelPicker in the composer; mounted behind the existing panel entry.
- [ ] 3.2 `@` context providers (schema/table/selection/result/file) → message parts via the SDK; provider resolution reuses sqlCatalog + splitStatements; pure serialization helpers tested.
- [ ] 3.3 Streaming MessageList + ToolCallCard (collapsible args/result/duration/error) driven by bridge events; Stop interrupts via SDK abort and preserves partials.
- [ ] 3.4 Apply-to-editor through InlineSqlDiff for suggested SQL; delete superseded AssistantPanel sections at parity (KISS shrink of the 1,937-line file); retire loop.ts when the old path has no callers.

## 4. Marketplace component + independent versioning

- [x] 4.0 Add `ComponentId::ExaAgent` (own dir + `installed.json`) and a `catalog.json` item (repo, latest, mirrorTag, homepage); engine appears in Managed Components + Updates like other components; `components_update` version-compare tests cover it.
- [ ] 4.1 Supervisor resolves the engine binary from the component dir, falling back to the bundled baseline; overlay (MCP wiring, DB profile, provider ranking, rebrand) resolved from a SEPARATE app-owned dir a component update never writes; test that an engine update leaves the overlay dir untouched.
- [ ] 4.2 Release/mirror wiring: engine gets its own release tag line + mirror job; About surface reports engine version and app version separately.

## 5. exa CLI + packaging

- [ ] 5.1 Bundle the `exa` CLI/TUI binary per platform alongside the server in the runtime-bundle pipeline; both resolved by path (no user-level install read).
- [ ] 5.2 `exa` launcher injects Studio's isolated config dir so app and CLI share config/sessions/MCP tools/provider registry; test the shared-session invariant (session created in one surface is listed by the other).
- [ ] 5.3 "Install exa CLI to PATH" action in the app (symlink/shim per OS, with uninstall); verify dmg/exe/AppImage ship both binaries and work offline with a local model.

## 6. Verification, docs, brand

- [ ] 6.1 tsc + vite build + full suites green; E2E: local model chat with DB tools (app + CLI), In-DB AI path where available, one OpenAI-compatible URL, provider-ranking default, destructive-statement gate in both surfaces, engine crash/restart, offline install from a built installer.
- [ ] 6.2 Licenses/About surface credits opencode (MIT); rebrand pass (Exa / exa naming) without touching upstream copyright headers.
- [ ] 6.3 Codex review; findings fixed; llm-wiki: engine pin/upgrade runbook, CLI+bundling how-to, and the survey verdict (opencode vs codex/gemini-cli/goose/aider/cline/crush/Brockley).
