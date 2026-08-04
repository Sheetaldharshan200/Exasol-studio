# Design — exa-agent-v2-local-runtime

## Context

agent-core is a Node sidecar with a tested loop (`loop.ts`), a flat tool registry with the `classifySql` safety gate, tool repair, and a live DB knowledge base — assets to keep. AssistantPanel.tsx (1,937 lines) is the UI to replace incrementally. Constraint on record: no Docker/external-app dependencies for the agent. Brockley (Go control plane; Docker/Postgres/workers; 17★, single-digit contributors) was evaluated and rejected as the base — its loop-engineering ideas are adopted instead. continue.dev is Apache-2.0; we take its interaction grammar, not its code (its gui is coupled to the continue core message protocol).

## Goals / Non-Goals

**Goals:**
- Local-first models with zero config when Ollama/LM Studio are running; any OpenAI-compatible endpoint addable by URL.
- A loop that cannot run away and always explains its stop; UI that shows the loop truthfully.
- A chat panel that matches continue.dev's usability while staying Studio-native, and that finally splits AssistantPanel per KISS.

**Non-Goals:**
- Rebranding or replacing the sidecar architecture; server-side agent fleets (Brockley's actual domain — separate future change if ever needed); training/finetuning; embedding models management beyond chat models.

## Decisions

1. **One OpenAI-compatible client, N adapters.** `providers/openai-compat.ts` does chat/stream/tools; adapters contribute discovery + inventory: Ollama (`/api/tags`, native port 11434, chat via its `/v1` compat), LM Studio (`/v1/models`, port 1234), generic (user URL + optional key). Runtime registry persisted in agent settings; probe on panel open with 300ms timeouts, never blocking chat startup.
2. **Loop hardening lands inside `loop.ts`** as pure, tested helpers: `TerminationPolicy` (the five layers) evaluated between iterations; `LoopEvent` union emitted through the existing event channel to the panel; `validateStructured(schema, text)` with one repair re-prompt. No rewrite — the current state machine stays, guards wrap it.
3. **Chat panel v2 is a new `features/assistant/panel/` tree** (Composer, SessionList, MessageList, ToolCallCard, ContextChips, ModelPicker) mounted behind the existing AssistantPanel entry; old code is deleted section-by-section as each piece reaches parity. Context providers reuse what Studio already knows: sqlCatalog (schemas/tables/columns), editor selection/statement (splitStatements), result sets, files panel.
4. **Capability detection, not capability pretense**: a per-model capability probe (tools yes/no via a cheap dry call, cached) drives honest reduced-mode messaging instead of retry storms on non-tool models.

## Risks / Trade-offs

- Local models vary wildly in tool-calling quality → the safety gate stays server-side (classifySql) and destructive SQL still requires the existing review path regardless of model.
- Probing ports could hit unrelated services → probes validate response shape (`/api/tags` JSON, `/v1/models` JSON) before listing a runtime.
- Panel rewrite risk → strangler pattern behind the same entry point; each subcomponent ships only at parity, old path remains until then.
