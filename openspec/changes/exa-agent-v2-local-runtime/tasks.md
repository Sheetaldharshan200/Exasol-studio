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

## 4. Verification, docs, brand

- [ ] 4.1 tsc + vite build + full suites green; E2E: Ollama local model chat with DB tools, LM Studio, one OpenAI-compatible URL (vLLM or llama.cpp), permission flow on a destructive statement, engine crash/restart.
- [ ] 4.2 Licenses/About surface credits opencode (MIT); rebrand pass (Exa naming) without touching upstream copyright headers.
- [ ] 4.3 Codex review; findings fixed; llm-wiki: engine pin/upgrade runbook + the survey verdict (opencode vs codex/gemini-cli/goose/aider/cline/crush/Brockley).
