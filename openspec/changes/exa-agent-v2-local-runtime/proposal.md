# Exa agent v2: local runtime + continue.dev-grade chat (Brockley evaluated, not adopted)

## Why

The ask was to replace agent-core with Brockley AI and rebrand it. Due diligence (2026-08-03) says no — but the goals behind the ask are right and land here as first-class work.

**Brockley findings** (github.com/brockleyai/brockleyai): Go, Apache-2.0 — license fine. But it is a **server-side control plane** for production agent fleets: Postgres + horizontally scaling workers via Docker Compose, Terraform deploys, a web console. Its "Superagent" is a workflow-graph node, not an embeddable chat agent. Adopting it would (a) bolt a Docker/Postgres server deployment onto a self-contained desktop app — violating Studio's recorded constraint that the agent must not depend on Docker/external apps; (b) bet the core UX on a project that is 4 months old, 17 stars, 2 forks, last pushed 2026-06 — one bus factor; (c) discard exa-agent's genuinely differentiating assets (SQL safety gate `classifySql`, live DB knowledge base, tool repair, Studio-native tools) to then re-patch them into a foreign Go codebase. Category mismatch, not an upgrade.

**What we take instead**: Brockley's best loop-engineering ideas (bounded execution, observable event stream, schema-validated structured output) get ported INTO exa-agent; the Local Runtime layer and the continue.dev-quality chat panel get built properly.

## What Changes

- **Local Runtime layer** in agent-core's provider tier: one OpenAI-compatible chat/completions client with runtime adapters — **Ollama** (native API + model list/pull), **LM Studio**, and **generic OpenAI-compatible endpoints** (covers llama.cpp server, vLLM, SGLang, TGI). Runtime discovery (probe default ports), model inventory, health status, and per-chat model pick — all local-first, zero cloud requirement.
- **Loop hardening (from Brockley)**: five-layer termination (max iterations, max tool calls, per-iteration tool limit, wall-clock timeout, stuck detection → reflection), a typed event stream for every loop step (iteration/tool/eval/completion) consumed by the UI, and JSON-Schema-validated structured outputs.
- **Chat panel refresh, continue.dev-informed** (Apache-2.0; patterns, not a code drop — their gui is coupled to their IDE protocol): session-first sidepanel with history switcher, per-session model picker, `@` context providers (schema/table/query/file), streaming tool-call cards with collapsible args/results, apply-to-editor actions with diff review (we already have InlineSqlDiff), and interruptible generation.
- exa-agent name and process model (Node sidecar) stay; no rebrand.

## Capabilities

### New Capabilities
- `local-runtime`: discovery, health, and model inventory for Ollama / LM Studio / OpenAI-compatible endpoints; chat + streaming through one client; graceful failover messaging.
- `agent-loop-guarantees`: bounded execution, typed progress events, schema-validated structured output.
- `chat-panel-v2`: sessions, context providers, tool-call cards, model picker, interruption — the continue.dev interaction grammar on Studio's design system.

### Modified Capabilities
<!-- none: existing agent behavior remains until superseded feature-by-feature -->

## Impact

- `packages/agent-core/src` provider layer + loop.ts (already tested pure helpers — extend, don't rewrite); `AssistantPanel.tsx` (1,937 lines — v2 panel is the moment to split it per KISS).
- No new server/Docker dependencies; everything ships in the sidecar/binary. Brockley remains a candidate for FUTURE server-side scheduled agent fleets (separate change, if ever).
