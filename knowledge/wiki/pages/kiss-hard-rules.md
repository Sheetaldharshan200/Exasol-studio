---
title: KISS hard rules — file size, reachability, testability
category: process
status: active
---

# KISS hard rules (mandatory since 2026-07-27)

KISS was already in the code-quality workflow as "the simplest thing that
works, no speculative abstraction" (see `dev-workflow-codex`). That framing
turned out to be too narrow: it was read as *avoid abstraction*, and nothing
else. In practice the project applied KISS to its architecture and skipped it
entirely for its implementation.

These three rules close that gap. They are stated in the repo root `CLAUDE.md`
and `AGENTS.md` so every AI assistant inherits them.

## 1. Don't let a file reach 5,000 lines

Split at ~500 lines. Over 1,000 needs a stated reason in the PR. Nothing
should ever approach 5,000 again.

A file that large is not "the main one", it is a landfill: nobody reviews it,
nothing in it is testable, and defects hide in it indefinitely. When adding to
a big file, **extract instead of appending**.

Known offenders — shrink these, never grow them:

| File | Lines |
|---|---|
| `apps/desktop/src/components/studio/ExasolStudio.tsx` | 5,084 |
| `apps/desktop/src/features/assistant/AssistantPanel.tsx` | 2,090 |
| `apps/desktop/src/features/bi/Dashboards.tsx` | 2,086 |
| `apps/desktop/src-tauri/src/local_database.rs` | 1,518 |
| `packages/agent-core/src/tools.ts` | 1,461 |
| `packages/agent-core/src/loop.ts` | 1,125 |

`ExasolStudio.tsx` is mostly wiring between feature modules it already
imports — it breaks apart along the seams that are already there.

## 2. Don't ship code that can't run

Unreachable code is a **defect**, not untidiness.

After copy-pasting a block, verify the copy is actually reachable. In an
`if (…) return …` dispatch chain, a duplicated earlier branch makes every
later copy dead. Delete dead branches, unused exports, and commented-out
blocks in the same change that orphans them.

**Precedent that motivated this rule:** `packages/agent-core/src/server.ts`
is a single ~738-line `createServer` callback. The route block for
`audit` / `mcp` / `dashboards` / `skills` / `artifacts` was pasted **four
times verbatim** inside it. Because every handler ends in `return json(…)`,
occurrences 2–4 can never execute — roughly 350 unreachable lines, ~40% of an
807-line file. A misplaced `// Dashboards: …` comment sitting above the
`audit` route was propagated all four times, which is the fingerprint of
blind copy-paste.

Nobody noticed, in a file that gets edited often. That is what oversized
files cost.

## 3. Keep it small enough to test

If new logic cannot be unit-tested without mounting the whole app, spawning a
sidecar, or calling a live model, **it is too big**. Extract the decision into
a pure function and test that.

Parsing, decoding, splitting, routing, and repair logic are always
pure-function-shaped. Good candidates already in the tree:

- `query.rs::split_statements` — quote/comment-aware statement splitter
- `query.rs::decode_cell` — the 7-branch type ladder (note: it silently
  returns `Null` for any type outside the ladder, so `INTERVAL`, `GEOMETRY`
  and `HASHTYPE` are indistinguishable from real NULL — exactly the kind of
  thing a test would have caught)
- `tool-repair.ts` — hallucinated tool names, aliased arg keys,
  double-encoded JSON
- `loop.ts::looksUnfinished` / `looksLikeUnacted` / `extractReadSql`

"It's hard to test" is a **design finding**, not an excuse to skip the test.

## Why this was needed

An audit on 2026-07-27 found the monorepo had:

- **one** test runner (`packages/exasol-sql-parser`), zero frontend tests,
  zero agent-core unit tests (`evals/` are live E2E harnesses needing a real
  model, not unit tests), and 3 of 28 Rust backend modules with `#[cfg(test)]`
- **four** knowledge-management systems (graphify, llm-wiki, Obsidian vault,
  understand-anything)

Four knowledge systems and one test runner. The existing rule — "never commit
red" — was unenforceable, because you cannot commit red when there is nothing
to run.

The macro architecture scored well in that audit (the process boundaries, the
three-tier IPC dispatch in `ipc.ts`, the stdin-pipe sidecar lifecycle, the
Argon2id KEK/DEK vault). The gap was entirely implementation discipline. These
rules target that gap specifically.

## Related

- `dev-workflow-codex` — the surrounding code-quality loop these rules plug into
- `exasol-sql-gotchas` — the Exasol specifics that edge-case tests must cover
