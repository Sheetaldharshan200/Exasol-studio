---
title: Codex review findings — dead-code + test-suite commits (2026-07-27)
category: process
status: active
---

# Codex review findings — 2026-07-27

Independent Codex review of three commits (`93b1177`, `8b91d63`, `285de34`) that
had been pushed without one, contrary to the mandatory review step in
`dev-workflow-codex`. Run with `codex exec --sandbox read-only` per commit.

Note for next time: `codex review --commit <SHA>` **rejects a custom prompt**
(`error: the argument '--commit <SHA>' cannot be used with '[PROMPT]'`). To
review a specific commit with your own review instructions, use
`codex exec --sandbox read-only "<prompt referencing the SHA>"` instead. Also,
the `codex-rescue` subagent is a one-way forwarder — it cannot poll status or
retrieve results, so drive the CLI directly when you need the output back.

## Confirmed correct (no action)

- **`decode_cell` (query.rs)** — all four concerns cleared. `try_get_raw` can
  only fail on index/data bounds in sqlx-exasol 0.9.2, and `row_to_json` always
  passes valid indices. `try_get_unchecked` returns `ColumnDecode`; it does not
  panic on a decode mismatch. The `<unreadable TYPE>` marker cannot collide with
  genuine string data because real strings succeed earlier in the ladder. The
  agent's `run_sql` uses a separate TypeScript driver and is unaffected.
- **`looksUnfinished` apostrophe class** — the widening to `['’]` is correct, and
  there is no meaningful catastrophic-backtracking risk: the 220-character tail
  cap bounds the input and the alternatives are effectively fixed-width.
- **`server.ts` route deletion** — verified independently: **no route was lost.**
  All session routes (items, stream, revert, fork, messages, permission,
  ui-result, abort) and gateway routes (databases, services, query, nl2sql,
  dashboards) remain reachable. No deleted hunk contained a unique route.
- **Deleted Rust functions** — `bootstrap_status`, `uv_path`,
  `uv_tool_installed` had no callers, were not `#[tauri::command]`, were absent
  from `generate_handler!`, and no cfg-gated or platform-specific path
  referenced them.

## Findings fixed

### A fifth, partial duplicate survived in server.ts
The original cleanup matched 78-line blocks starting with the
`// Dashboards: …` comment and removed three. A **fourth, skills+artifacts-only**
copy started with `// Skills: …` and was therefore missed — 24 more unreachable
lines. Verified byte-identical to the reachable copy and deleted. `server.ts`
808 → 574 → **551 lines**; 258 dead lines removed in total.

Lesson: when de-duplicating by pattern, the pattern itself is a filter that can
hide instances. Count occurrences of the *handler conditions* (`parts[1] === "x"`),
not the comment markers.

### High — CSV import silently truncated data, and the test blessed it
`cellToLiteral` did `v.slice(0, t.size)` for VARCHAR. Since `buildPlan` infers
types from at most `sampleSize` rows (500k default), a long value beyond the
sample was **silently cut with no error anywhere** — and the new test asserted
that truncation as correct behaviour.

Fixed: `cellToLiteral` now emits the full literal. An oversized value reaches
Exasol, which rejects it, and the caller's per-row retry in `tools.ts` reports
exactly which row was too wide. A visible failure is recoverable; silent
truncation is not. The test now asserts preservation.

### Medium — `looksUnfinished` missed the apostrophe-less form
`next,? (i|let['’]s|we)` **required** an apostrophe while every sibling branch
made it optional, so "Next, lets call run_sql" was not detected. Fixed to
`let['’]?s`; tests added for the missing-apostrophe forms ("lets", "Ill").

### Medium — `extractReadSql` returned truncated SQL that gets executed
`"SELECT a FROM"` passed the gate (it contains `FROM`) and could be handed
straight to `run_sql`, turning a stalled model into a pointless database error.
The FROM check now requires an actual target: `/\bFROM\s+["\w$]/i`.

### Low — `buildInsert` could emit invalid SQL
An empty batch produced `INSERT … VALUES` with no tuples. Callers never pass
an empty slice, so this is a contract guard: it now throws.

### Low — `repairCall` discarded valid arguments on schema-lookup failure
`repairArgs` drops every key not declared in `properties`, so a failed or absent
schema lookup turned a good `{sql: "…"}` into `{}` and the call failed with a
misleading "missing required argument". It now passes parsed args through
untouched when no usable schema is available.

## Untested edges Codex flagged, now covered

- **Calendar-invalid dates.** `DATE_RE`/`TS_RE` only check *shape*, so
  `2024-99-99`, `2024-02-30` and `2023-02-29` inferred a DATE column and then
  `cellToLiteral` NULLed every value — the column silently emptied. Added
  `isCalendarDate` / `isCalendarTimestamp` (round-trip through `Date`, catching
  month/day overflow and non-leap-year Feb 29). Such columns now stay VARCHAR
  and the data survives.
- **Nested bigint.** `valueToCell` called a bare `JSON.stringify` on objects; a
  nested bigint (routine in Parquet) threw "Do not know how to serialize a
  BigInt" and aborted the entire import. Now serialized via a replacer.

## Still open

Fractional values with more than 20 decimal places infer a capped scale but emit
the original literal, so those rows may fail or be skipped
(`csv-import.ts` `inferType`). Not yet fixed — needs a decision on whether to
round the literal or reject the value.

## Related

- [[kiss-hard-rules]] — the rules these violations motivated
- [[dev-workflow-codex]] — the review loop this belongs to
