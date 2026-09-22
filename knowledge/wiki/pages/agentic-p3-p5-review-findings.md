---
title: Agentic P3–P5 — Codex review findings and their fixes
category: reviews
created: 2026-09-08
---

# Agentic P3–P5 — review findings worth inheriting

Findings from the Codex review rounds (and one live smoke) while shipping
P3 (observability), P4 (evaluation) and P5 (execution DAG) of
`docs/agentic-architecture-spec.md`. Each was fixed before its phase merged.

## The one only a live run could catch

**Parallel DAG steps must never share the pooled websocket driver.** The
Exasol websocket protocol is strictly request-response per session; two
concurrent statements interleave frames and hang forever. The pure DAG tests
and the stub-DB executor tests were all green — the hang only appeared when
`execute_plan` ran a real 6-step plan against Personal. Fix:
`DbRegistry.queryIsolated` / `executeIsolated` (one throwaway session per
step, closed in `finally`, same pattern as `verifyQuery`); the gateway route
passes that pair as the executor's `StepDb`. Rule of thumb: anything that
parallelizes DB work gets its own sessions, full stop.

## Observability (P3)

- Failure paths must be traced too: failed gateway queries and failed/aborted
  turns produced NO span, silently overstating reliability. Both now emit
  `ok:false` spans.
- Streaming tool-input starts can carry a different id than the finished tool
  call (`tc.id ?? tc.name` provisional key) — pairing them leaks open spans.
  Provisional `tool-start` events are flagged and excluded from span pairing.
- Retention by file COUNT is not retention by days when usage is sparse —
  prune and read windows are calendar-date based; reads are capped (20k spans).

## Evaluation (P4)

- Empty expectation values/patterns match EVERYTHING — suite validation
  rejects them (an eval that can't fail is worse than no eval).
- `tool-start` fires BEFORE the permission ask, so "a write ran" must be
  distinguished from "a write was attempted and the gate held" (`deniedSql`
  evidence). A denied attempt is refusal-behavior working, not a violation.
- The runner's ProviderRegistry must read the REAL config (keys/base URLs)
  while `runTurn` keeps a throwaway config — providerLimits writes must never
  touch the user's real config.
- Never echo a DSN in an error — redact the password first.

## Execution DAG (P5)

- Re-entry needs a lock: a second `execute_plan` on a running plan would
  treat live `running` steps as crashed and re-run them (`activeRuns` set).
- Compensation steps are full citizens: they respect the concurrency budget,
  retry with backoff like normal steps, may not have dependencies (their
  owner FAILED — deps could never be satisfied), and must carry SQL if
  pending (checked up front, not at trigger time).
- Persistence is best-effort by contract: a failed disk write must never
  re-classify SQL that already ran (transition applied outside the SQL try).
- `execute_plan` honors the same `writePolicy: deny` guardrail as `run_sql` —
  plan approval authorizes writes only under policy "ask".
