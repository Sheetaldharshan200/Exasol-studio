---
title: Code quality workflow — Codex review, KISS/SOLID, edge-case tests
category: process
status: active
---

# Code quality workflow (mandatory since 2026-07-26)

Every substantive change to Exasol Studio goes through this loop before it
ships. It is also stated in the repo root `CLAUDE.md` so all AI assistants
inherit it.

## The loop

1. Implement (KISS: simplest thing that works; SOLID where modules/classes
   are involved — single responsibility first, no speculative abstraction).
2. `tsc --noEmit` (frontend) / `cargo check` (Rust) / agent-core typecheck.
3. **Unit tests for new logic, WITH edge cases** — empty input, nulls,
   boundaries, Exasol identifier case-folding (unquoted → UPPERCASE),
   error paths. Never just the happy path.
4. **Codex review** — hand the diff to Codex for an independent code review
   and quality check:
   - In Claude Code: `/codex:rescue <ask>` or the `codex-rescue` subagent.
   - Directly: the `codex` CLI.
5. Any test failure or valid review finding is **fixed before commit** —
   never ship red.
6. Notable findings + fixes are logged back into this wiki.

## Toolchain facts

- Codex CLI 0.145.0, installed globally via `npm i -g @openai/codex`
  (2026-07-26), advanced runtime available.
- Auth: ChatGPT login (sheetaldharshan.a@exasol.com), verified.
- Claude Code plugin: `openai-codex/codex` 1.0.6 — provides `/codex:setup`,
  `/codex:rescue`, the `codex-rescue` subagent, and an optional stop-time
  review gate (`/codex:setup --enable-review-gate`, currently OFF).
- The Codex runtime starts on demand at the first review/task command
  (shared session runtime).

## Why

An independent second model reviewing quality catches what the implementing
model rationalizes away, and edge-case tests are where Exasol specifics
(identifier folding, reserved words, OFFSET-needs-ORDER-BY) actually bite.
