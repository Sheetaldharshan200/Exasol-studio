---
title: KISS hard rules — file size, reachability, testability
category: process
status: active
---

# KISS hard rules (mandatory since 2026-07-27)

KISS was already in the code-quality workflow as "the simplest thing that
works, no speculative abstraction" (see `dev-workflow-codex`). That framing was
too narrow: it was read as *avoid abstraction*, and nothing else. In practice
the project applied KISS to its architecture and skipped it entirely for its
implementation.

These three rules close that gap. They are stated in the repo root `CLAUDE.md`
and `AGENTS.md` so every AI assistant inherits them.

## 1. Don't let a file reach 5,000 lines

Split at ~500 lines. Over 1,000 needs a stated reason in the PR. Nothing should
ever approach 5,000 again. When adding to a big file, **extract instead of
appending**.

| File | Was | Now |
|---|---|---|
| `apps/desktop/src/components/studio/ExasolStudio.tsx` | 5,089 | **3,223** |
| `apps/desktop/src/features/bi/Dashboards.tsx` | 2,087 | **2,004** |
| `apps/desktop/src/features/assistant/AssistantPanel.tsx` | 2,091 | **1,937** |
| `apps/desktop/src-tauri/src/local_database.rs` | 1,518 | 1,512 |
| `packages/agent-core/src/tools.ts` | 1,461 | 1,461 |
| `packages/agent-core/src/loop.ts` | 1,125 | 1,131 |

Extracted so far, each verified with `tsc` + a real vite **production build** +
the full test suite + an explicit import-cycle check:

- from `ExasolStudio.tsx`: `lib/sql-text.ts`, `studio/tabs.ts`,
  `studio/IconButton.tsx`, `studio/HistoryDock.tsx`, `studio/Sidebar.tsx`,
  `studio/TitleBar.tsx`, `studio/ConnectionSwitcher.tsx`,
  `studio/monaco-theme.ts`
- from `AssistantPanel.tsx`: `assistant/chat-text.ts`
- from `Dashboards.tsx`: `bi/report-export.ts`

### Extract the pure logic FIRST

It is the cheapest cut, carries the least regression risk, and it is where the
bugs are. Every one of these extractions found a real defect the moment the code
became testable — see "What extraction keeps finding" below.

DOM- and library-coupled code stays in its component. `chartPng`,
`buildHtmlReport` and `printHtml` need echarts and a live DOM; moving them buys
nothing and costs risk.

### Practical notes

- `noUnusedLocals` is OFF in this project, so `tsc` will **not** flag imports
  the extraction orphaned. Find them by diffing imported names against the
  remaining body, then re-check that any whole dropped `import` statement was
  not providing a module side-effect.
- `tsc` DOES catch the dangerous direction (used-but-not-imported), and did —
  three times (`Selector`, `MD_ROW_CAP`, `hasLeakedToolCall`/`stripToolJson`).
- Verify with a production build, not just a typecheck: a broken component
  boundary is a runtime failure, not a type error.

## 2. Don't ship code that can't run

Unreachable code is a **defect**, not untidiness.

**Precedent:** `packages/agent-core/src/server.ts` was a single ~738-line
`createServer` callback with one route block pasted **five** times. Because every
handler ends in `return json(…)`, copies 2-5 could never execute. 808 → **551
lines**, 258 dead lines removed across two passes.

The second pass only happened because Codex checked. The first de-dup matched
78-line blocks starting `// Dashboards: …` and missed a skills+artifacts-only
copy starting `// Skills: …`.

> **Lesson: the de-dup pattern is itself a filter that can hide its own misses.**
> Count the handler *conditions* (`parts[1] === "x"`), not the comment markers.

Also removed under this rule: three dead Rust functions (`bootstrap_status`,
`uv_path`, `uv_tool_installed` — `cargo check` is now warning-free) and the
`repairCall` wrapper, whose only reference anywhere was an unused import.

## 3. Keep it small enough to test

If new logic cannot be unit-tested without mounting the whole app, spawning a
sidecar, or calling a live model, **it is too big**. Extract the decision into a
pure function and test that.

"It's hard to test" is a **design finding**, not an excuse to skip the test.

When a function's only impurity is the clock, take it as an optional parameter
(`relTime(ts, now = Date.now())`, `buildMarkdownReport(…, now = new Date())`).
Existing callers are unaffected and the function becomes deterministic.

## How tests run

```bash
pnpm test              # agent-core + desktop + sql-parser + Rust
pnpm test:coverage     # coverage for the pure logic core
```

**No test framework, deliberately.** Node's built-in `node:test` +
`node:assert/strict` (Node 26 strips TypeScript natively) and Rust
`#[cfg(test)]`. Zero new dependencies, consistent with the repo's framework-free
`server.ts` and `tui.ts`. Do not add vitest or jest. Name files `*.test.ts`
beside the module they cover — auto-discovered (the desktop package needs the
glob form, `node --test "src/**/*.test.ts"`; a bare directory argument is
treated as a module and fails).

370 tests. Coverage targets the **pure logic core**, not the React tree:
`csv-import.ts` 100% lines, `tool-repair.ts` 98% lines, 100% functions across
both. A repo-wide percentage would be a vanity metric — chase coverage where
bugs actually live.

## What extraction keeps finding

Every module that became testable immediately yielded a real, silent defect.
None of these crashed; all of them produced quietly wrong output.

1. **`looksUnfinished` missed the typographic apostrophe.** Its sibling matched
   `i(?:'|’)?`; this one matched only ASCII. "I’ll now check the columns" was
   never detected as unfinished, so turns finalized half-done — while the
   identical ASCII sentence was caught. Later also fixed the apostrophe-*less*
   form ("Next, lets"), which the `next,?` branch had required.
2. **`decode_cell` rendered non-NULL values as NULL.** `try_get` gates on the
   column's *declared* type, so INTERVAL/GEOMETRY/HASHTYPE fell through the
   whole ladder onto `Value::Null` — real data shown as NULL in the grid.
3. **`cellToLiteral` silently truncated data, and a test blessed it.** It
   `slice()`d over-long VARCHAR values; inference samples at most 500k rows, so
   longer values beyond the sample were cut with no error anywhere.
4. **Shape-only date validation.** `2024-99-99`, `2024-02-30`, `2023-02-29`
   inferred DATE columns whose values `cellToLiteral` then NULLed — the column
   silently emptied. Now calendar-validated; such columns stay VARCHAR.
5. **A nested bigint aborted the whole Parquet import** via a bare
   `JSON.stringify`.
6. **`extractReadSql` returned truncated SQL that gets executed.** `"SELECT a
   FROM"` passed the gate and could be handed to `run_sql`.
7. **`fmtNumber` rendered NULL as `0`.** `Number(null)` and `Number("")` are
   both `0` and finite, so a NULL database cell showed as **0** in a KPI tile —
   indistinguishable from a genuine zero, and the wrong answer for a revenue or
   count headline. Now an em dash.
8. **The arbitrary DECIMAL scale clamp.** `inferType` clamped scale to 20 and
   precision to 36 while `cellToLiteral` still emitted the full literal, so
   Exasol rounded or rejected those rows. Removing the clamp made 21-35 decimal
   places representable *exactly* (Exasol allows scale up to precision, so
   `DECIMAL(31,30)` is legal); beyond the 36-digit ceiling the column now stays
   VARCHAR so the text is preserved losslessly.

## Related

- [[codex-review-findings-2026-07]] — the review that caught 3, 4, 5, 6
- [[dev-workflow-codex]] — the review loop these rules plug into
- [[exasol-sql-gotchas]] — the Exasol specifics edge-case tests must cover
