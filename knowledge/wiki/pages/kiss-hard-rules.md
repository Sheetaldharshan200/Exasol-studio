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
imports — it breaks apart along the seams that are already there. **Still
outstanding**; it is a genuine refactor with regression risk, not a cleanup.

## 2. Don't ship code that can't run

Unreachable code is a **defect**, not untidiness.

After copy-pasting a block, verify the copy is actually reachable. In an
`if (…) return …` dispatch chain, a duplicated earlier branch makes every
later copy dead. Delete dead branches, unused exports, and commented-out
blocks in the same change that orphans them.

**Precedent that motivated this rule:** `packages/agent-core/src/server.ts`
was a single ~738-line `createServer` callback. The route block for
`audit` / `mcp` / `dashboards` / `skills` / `artifacts` had been pasted
**four times verbatim** inside it. Because every handler ends in
`return json(…)`, occurrences 2–4 could never execute — 234 unreachable
lines, ~40% of an 807-line file. A misplaced `// Dashboards: …` comment
sitting above the `audit` route was propagated all four times, which is the
fingerprint of blind copy-paste.

Nobody noticed, in a file that gets edited often. That is what oversized
files cost.

**Fixed** in commit `93b1177`: 808 → 574 lines, all 14 route families and 11
session sub-routes verified intact, comment corrected so the next paste has
nothing to propagate. Three dead Rust functions went with it
(`bootstrap_status`, `uv_path`, `uv_tool_installed`); `cargo check` is now
warning-free.

## 3. Keep it small enough to test

If new logic cannot be unit-tested without mounting the whole app, spawning a
sidecar, or calling a live model, **it is too big**. Extract the decision into
a pure function and test that.

"It's hard to test" is a **design finding**, not an excuse to skip the test.

## How tests run

```bash
pnpm test              # agent-core + sql-parser + Rust
pnpm test:coverage     # coverage for the pure logic core
```

**No test framework, deliberately.** Node's built-in `node:test` +
`node:assert/strict` (Node 26 strips TypeScript natively) and Rust
`#[cfg(test)]`. Zero new dependencies, consistent with the repo's existing
framework-free modules (`server.ts`, `tui.ts`). Do not add vitest or jest.
Name files `*.test.ts` beside the module they cover — auto-discovered.

Coverage targets the **pure logic core**, not the React tree. Covering UI
wiring is expensive and catches little; a repo-wide percentage would be a
vanity metric. Chase coverage where bugs actually live.

## What the first test pass found

Written 2026-07-27. 264 tests total (158 agent-core, 79 parser, 27 Rust).
Measured coverage: `csv-import.ts` 100% lines / 97% branches / 100% functions;
`tool-repair.ts` 98% lines / 93% branches / 100% functions.

Two real defects surfaced immediately — both in code that had looked fine for
months:

1. **`looksUnfinished` missed the typographic apostrophe.** Its sibling
   `looksLikeUnacted` matched `i(?:'|’)?`, but `looksUnfinished` only matched
   ASCII `i'?ll` / `let'?s`. Models emit U+2019 constantly, so
   "I’ll now check the columns" was never detected as unfinished and the turn
   finalized half-done — while the identical ASCII sentence was caught. Now
   `['’]` throughout.

2. **`decode_cell` rendered non-NULL values as NULL.** `try_get` gates on the
   column's *declared* type before decoding, so INTERVAL, GEOMETRY and
   HASHTYPE fell through every branch of the type ladder onto `Value::Null` —
   real data silently displayed as NULL in the results grid. Fixed by
   resolving NULL first from the raw value, adding a `try_get_unchecked`
   fallback (Exasol's wire protocol is JSON, so exotic types arrive as JSON
   strings and round-trip fine), and emitting a visible `<unreadable TYPE>`
   marker in the genuinely-undecodable case. A silent NULL is data loss; a
   visible marker is a bug report.

Both are the kind of bug that only a test finds: no crash, no error, just
quietly wrong output.

## Why this was needed

An audit on 2026-07-27 found the monorepo had **one** test runner
(`packages/exasol-sql-parser`), zero frontend tests, zero agent-core unit
tests (`evals/` are live E2E harnesses needing a real model), and 3 of 28 Rust
backend modules with `#[cfg(test)]` — against **four** knowledge-management
systems (graphify, llm-wiki, Obsidian vault, understand-anything).

Four knowledge systems and one test runner. The existing rule — "never commit
red" — was unenforceable, because you cannot commit red when there is nothing
to run.

The macro architecture scored well in that audit (the process boundaries, the
three-tier IPC dispatch in `ipc.ts`, the stdin-pipe sidecar lifecycle, the
Argon2id KEK/DEK vault). The gap was entirely implementation discipline.

## Related

- `dev-workflow-codex` — the surrounding code-quality loop these rules plug into
- `exasol-sql-gotchas` — the Exasol specifics that edge-case tests must cover
