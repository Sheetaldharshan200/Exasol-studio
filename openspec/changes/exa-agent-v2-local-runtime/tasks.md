# Tasks — exa-agent-v2-local-runtime

## 1. Local Runtime layer (agent-core)

- [ ] 1.1 `providers/openai-compat.ts`: chat + streaming + tool calls against any base URL; pure request/response mappers tested in `openai-compat.test.ts` (message mapping, tool-call chunks, error normalization).
- [ ] 1.2 Runtime adapters + registry: Ollama (`/api/tags` inventory, 11434), LM Studio (`/v1/models`, 1234), generic endpoint (URL + optional key); shape-validated probes with 300ms timeout; persisted registry; `runtime-registry.test.ts` (probe shape validation, dedupe, unreachable).
- [ ] 1.3 Capability probe + cache per model (tools supported?); reduced-mode flag surfaced in responses; test the cache/invalidation logic.
- [ ] 1.4 Model picker data source: merge cloud providers + discovered runtimes; per-session model persisted on the session.

## 2. Loop guarantees (agent-core)

- [ ] 2.1 `loop-guards.ts`: TerminationPolicy (max iterations/tool calls/per-iteration/wall-clock/stuck detection with one reflection) as pure functions; `loop-guards.test.ts` covers every layer + stuck-then-reflect-then-stop.
- [ ] 2.2 `LoopEvent` union + emission at every step through the existing event channel; session log persistence; test event ordering for a scripted run.
- [ ] 2.3 `validateStructured(schema, output)` with single repair re-prompt; tests: pass, repairable, unrepairable (schema error surfaced verbatim).

## 3. Chat panel v2 (frontend)

- [ ] 3.1 `features/assistant/panel/` skeleton: SessionList (history, titles, model, relative time), per-session ModelPicker in the composer; mounted behind the existing panel entry.
- [ ] 3.2 `@` context providers: schema/table/selection/result/file → context chips; provider resolution reuses sqlCatalog + splitStatements; pure chip-serialization helpers tested.
- [ ] 3.3 MessageList with streaming markdown + ToolCallCard (collapsible args/result/duration/error) driven by LoopEvents; Stop interrupts and preserves partials.
- [ ] 3.4 Apply-to-editor through InlineSqlDiff for suggested SQL; delete the superseded AssistantPanel sections as each piece reaches parity (KISS shrink of the 1,937-line file).

## 4. Verification & docs

- [ ] 4.1 tsc + vite build + full suites green; manual E2E: Ollama with a local model (chat, tools-reduced mode), LM Studio, one vLLM/llama.cpp endpoint by URL.
- [ ] 4.2 Codex review; findings fixed; llm-wiki page: local-runtime matrix (what each runtime supports) + the Brockley evaluation verdict for posterity.
- [ ] 4.3 Update the Agentic-AI-pivot direction notes; issue for v2 leftovers (embedding models, server-side fleets if ever).
