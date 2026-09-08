# Agentic Architecture Spec — Gaps and the Plan to Close Them

Status: PROPOSED (assessed 2026-09-07 against the real code)
Owner: Exasol Studio agent (`packages/agent-core` + `apps/desktop/src-tauri`)
Scope: the AI answer pipeline — everything between a user message in the Exa
panel and the answer it produces.

The reference architecture this spec measures against:

```
                        ┌─ Metadata
                        ├─ Semantic layer
                        ├─ Tool registry
User → Router → Planner ┼─ Execution DAG
                        ├─ Policy engine
                        ├─ Verification
                        ├─ Observability
                        └─ Evaluation
                                  ↓
                                Answer
```

---

## 0. Honest current state (one table)

| Layer | Status | Where it lives today |
|---|---|---|
| Router | PARTIAL | `loop.ts` turn heuristics (tested), 3-tier skill activation (`skills.ts` recall), `scenario-router` skill |
| Planner | PARTIAL | Implicit LLM planning inside the turn loop; skills prescribe workflows; `compact.ts` |
| Metadata | SOLID | MCP find/describe tools; Studio catalog (`catalog.rs`, `metadata.rs`, EXA_ALL_* search, schema graph) |
| Semantic layer | PARTIAL | Semantic Views (installable, skill-mediated); local KB + embeddings (`kb.ts`, `embed.ts`) |
| Tool registry | SOLID | `tools.ts` flat registry (~40 tools, each small), `capabilities.ts`, MCP gateway to all connected DBs |
| Execution DAG | MISSING | Sequential tool calls only; exasol-scheduler does time-chains in-DB, not agent DAGs |
| Policy engine | PARTIAL | Real gates (`classifySql`, DB-enforced read-only MCP user, app-control, grants, share-gate, audit consent) — code, not config |
| Verification | PARTIAL | Verify-or-refuse installs, SQL classification, `tool-repair.ts`; independent validation exists only as SKILL GUIDANCE |
| Observability | PARTIAL | `audit.ts` (every tool call), session store, live event stream; no run metrics/traces surface |
| Evaluation | MISSING | Unit tests cover pure logic only; zero agent-quality evaluation |

Priority order (trust gained per unit of effort):
**P1 Verification → P2 Explicit plan object → P3 Run observability → P4 Evaluation → P5 Execution DAG.**
Router/Semantic upgrades ride along inside those phases.

---

## 1. P1 — Automated Verification (the trust layer)

### Gap
The agent's final answer is whatever the last tool call returned. The
starter-kit discipline — *show the SQL, run it, validate independently* —
exists as skill text, not machinery. Nothing re-checks a result before the
user sees it.

### Target behavior
Every answer that came from SQL carries a verification badge:
`verified` (independently reproduced), `unverified` (verification skipped or
impossible), or `mismatch` (reproduction disagreed — the answer says so).

### Design
1. **Verification record.** New pure module `packages/agent-core/src/verify.ts`:
   - `planVerification(sqlRuns: SqlRun[]): VerificationPlan` — pure, tested.
     Picks the FINAL result-bearing SELECT of the turn (ignore DDL/exploration),
     caps at 1 verification per turn, refuses statements `classifySql` marks
     as writes.
   - `compareResults(a, b): "match" | "mismatch" | "incomparable"` — pure,
     tested: row count equality; for aggregates, cell-level compare with
     numeric tolerance (1e-9 relative); for large results, compare count +
     checksum of the first N rows sorted.
2. **Independent path.** Re-execute through a SECOND connection route:
   - primary ran via MCP read-only user → verify via Studio's own pool
     (`execute_sql`), or vice versa. Never the same session. Reuse
     `classifySql` as the write-guard on the verification run itself.
3. **Loop hook.** In `loop.ts`, after the model produces its final text and
   before the answer event: run the verification plan (5s budget, abortable);
   attach `{status, elapsedMs, rowCount}` to the answer event.
4. **UI.** Exa panel renders the badge; `mismatch` renders the two numbers
   side by side ("the answer said 1,204; independent re-run returned 1,198").
5. **Exasol assets used.** `EXA_USER_PROFILE_LAST_DAY` — attach the real
   execution profile of the verified query as expandable evidence (already
   wired for the Query Performance tab; reuse the fetch).

### Steps
- [ ] `verify.ts` + `verify.test.ts` (pure: plan selection, compare rules,
      tolerance, incomparable cases — empty result, non-deterministic SQL
      detection by `ORDER BY`-absence + `LIMIT` heuristics)
- [ ] Track `SqlRun` records per turn in `loop.ts` (statement, connection
      route, rowCount, checksum)
- [ ] Verification executor (side-effect wrapper, 5s budget) + answer-event field
- [ ] Badge UI in the Exa thread; mismatch detail view
- [ ] Audit: verification outcomes land in `audit.ts`
- [ ] Skill update: `scenario-router` mentions the badge so the model narrates it

### Acceptance
A "how many customers ordered last month" answer shows `verified` with the
independent row count; deliberately breaking the compare (mock) shows
`mismatch` and both values; a write-bearing turn shows `unverified`, never a
second write.

---

## 2. P2 — Explicit Planner (plan object + preview)

### Gap
Planning is implicit in the LLM turn. There is no inspectable plan, no
approval step for multi-step work, nothing persisted to resume from.

### Target behavior
Multi-step requests produce a visible plan (steps, tools, target objects)
BEFORE execution; the user can approve/edit; each step's status is tracked;
the plan persists with the session.

### Design
1. **Plan schema.** `packages/agent-core/src/plan.ts` (pure, tested):
   `{ id, goal, steps: [{ id, title, tool, args?, dependsOn: string[], status:
   "pending"|"running"|"done"|"failed"|"skipped", evidence? }] }`.
   `dependsOn` is recorded from day one — it is the seam P5 (DAG) executes
   later; until then steps run in order.
2. **Planning turn.** A `propose_plan` tool the model calls for multi-step
   intents (the `scenario-router` skill instructs when); single-step Q&A stays
   plan-free (no ceremony for "how many rows").
3. **Approval gate.** Plans touching writes (`classifySql`) or external
   services require explicit user approval in the panel (reuses the existing
   audit allow/deny surface); read-only plans show but auto-proceed.
4. **Persistence.** Plans go in the session store (`session.ts` / `db.ts`);
   reopening a session shows the plan with its step states.
5. **Step evidence.** Each finished step stores its tool result digest —
   feeds P1 verification and P3 observability.

### Steps
- [ ] `plan.ts` + tests (schema validation, dependency cycles rejected,
      status transitions, write-step detection)
- [ ] `propose_plan` / `update_plan_step` tools in `tools.ts`
- [ ] Loop integration: plan-aware turn (execute next pending step, stop on
      failure, surface to UI)
- [ ] Panel UI: plan card with per-step status + approve/edit for write plans
- [ ] Session persistence + resume
- [ ] Skill updates: scenario-router + federation/ETL skills emit plans

### Acceptance
"Load these 3 CSVs, join them with the orders table and build a dashboard"
shows a 5-step plan first; declining stops it; approving runs steps with live
status; killing the app mid-plan and reopening shows the half-done plan.

---

## 3. P3 — Run Observability (traces, tokens, latency)

### Gap
`audit.ts` records WHAT happened (every tool call, export, deletion) but not
HOW: no per-turn token/cost accounting, no per-tool latency, no trace view.
SQL profiling exists (Query Performance tab) but is not connected to agent
turns.

### Target behavior
Every turn produces a trace: model calls (tokens in/out, provider, latency),
tool calls (name, duration, outcome), verification outcome, plan step — all
inspectable in a "Run details" view, aggregated in a simple usage panel.

### Design
1. **Trace record.** Extend the existing audit path rather than adding a new
   system: `audit.ts` entries gain `{turnId, spanId, parentSpanId, kind,
   durationMs, tokens?: {in, out}, provider?, model?}`. Pure span builder in
   `trace.ts` with tests (parenting, duration math, token summation).
2. **Emission points.** `llm.ts` (model call spans, token counts from provider
   responses), `loop.ts` (turn span), `tools.ts` dispatcher (tool spans) —
   one wrapper each, no per-tool changes.
3. **Storage + view.** Traces live in the session db; the Exa panel gets a
   per-message "Run details" expander (turn timeline, spans, tokens); a
   Settings → Usage section shows totals per day/provider.
4. **SQL evidence join.** For SQL tool spans, link the statement to its
   `EXA_USER_PROFILE_LAST_DAY` profile (same fetch the Query Performance tab
   uses) — one click from trace span to real DB execution profile.
5. **Exasol assets used.** `EXA_USER_PROFILE_LAST_DAY` now; optionally
   `EXA_DBA_AUDIT_SQL` when DB auditing is enabled (join agent spans to DB
   audit rows by session/statement).

### Steps
- [ ] `trace.ts` + tests (span tree, totals)
- [ ] Wrap llm/tool/turn boundaries; persist with the session
- [ ] "Run details" expander UI + Usage totals in Settings
- [ ] Profile link for SQL spans
- [ ] Feed P4: traces are the raw material evals score

### Acceptance
Any answered message can be expanded to show: N model calls (tokens each),
M tool calls with durations, the verification result, and — for SQL — the
DB profile. Settings shows today's token totals per provider.

---

## 4. P4 — Evaluation (the empty layer)

### Gap
Nothing measures answer quality. Regressions in skills, prompts, or model
routing are invisible until a user complains.

### Target behavior
A committed eval suite of golden questions runs on demand (and in CI against
a seeded local DB), scoring answers by deterministic checks first, judge
second; results trend over time.

### Design
1. **Suite format.** `packages/agent-core/evals/*.eval.json`:
   `{ question, setup?: sql[], expect: { kind: "value" | "rowcount" | "sql-contains" | "tool-used" | "refusal", ... } }`.
   Deterministic expectations FIRST (value/rowcount compare via the P1
   comparator); LLM-judge only for free-text criteria, clearly marked.
2. **Runner.** `evals/run.ts` (node:test compatible — the repo's no-framework
   rule): boots agent-core against a seeded Exasol (CI: the same Nano
   container the runtime-components workflow already validates with; local:
   Personal), runs each question through the REAL loop, scores from the P3
   trace + P1 verification records.
3. **Storage in Exasol (dogfood).** Results insert into a `STUDIO_EVALS`
   schema — suite, run id, score, tokens, duration — so trends are one SQL
   query away and the dashboards feature can chart them.
4. **CI.** A workflow job (manual dispatch + weekly) runs the deterministic
   subset; judge-scored cases run locally only (no API keys in CI).
5. **Exasol assets used.** Nano container for CI seeding (already proven in
   `refresh-runtime-components.yml`); exasol-scheduler optionally re-runs the
   suite nightly on a dev machine; a UDF can host custom scorers later.

### Steps
- [x] Eval schema + 10 seed questions — `evals/suites/core.eval.json`
      (metadata Q&A, describe, counts, aggregation, group-by, join, filter,
      rowcount, refusal, tool-check); parsing + scoring is pure and tested
      (`src/evals.ts` / `src/evals.test.ts`)
- [x] Runner: `evals/golden.ts` (`pnpm evals:golden`) — real turns through
      `runTurn` against a discovered local Exasol Personal (or `EXA_EVAL_DSN`),
      scored from the turn evidence (answer text, tool calls, executed SQL,
      P1 `sqlRuns`); CI-against-Nano seeding stays open (needs a model in CI)
- [x] `STUDIO_EVALS.RUNS`/`RESULTS` tables (written by the runner) + the
      "Agent evals" System dashboard (`system-dashboards.ts`)
- [x] CI job: the deterministic tier (`evals/run.ts`, model-free) now gates
      every PR in `ci.yml`; golden tier runs locally where a model exists
- [x] Threshold gate: `evals:golden --min-pass=<rate>` (default 0.8) exits
      non-zero below the gate; deterministic tier is red/green per case

Import→query and federation-clarify seed cases are deferred: the first needs
attachment plumbing in the runner, the second an expectation kind for
clarifying questions — both belong to the next suite iteration.

### Acceptance
`pnpm evals` answers all seed questions against a fresh seeded DB and prints
a scorecard; the same run in CI passes/fails on the deterministic subset;
two runs land as rows in `STUDIO_EVALS` and the trend dashboard renders.

---

## 5. P5 — Execution DAG (last, biggest)

### Gap
Tool calls are strictly sequential within a turn. No parallel steps, no
retries/compensation, no durable runs. The skills ladder covers most
multi-step cases today, which is why this is LAST.

### Target behavior
A plan (P2) with independent steps executes them in parallel with bounded
concurrency, per-step retry policy, and durable state — resumable after a
crash; long chains can hand off to in-DB execution where that is the better
engine.

### Design
1. **Executor over the P2 plan.** `packages/agent-core/src/dag.ts` (pure core
   tested: ready-set computation from `dependsOn`, concurrency cap,
   retry/backoff policy, failure propagation — skip dependents, run
   `onFailure` compensation steps).
2. **Durability.** Step transitions write-through to the session db (P2
   already persists plans); resume = recompute the ready set from stored
   statuses.
3. **In-DB offload.** Steps tagged `engine: "exasol"` compile to the DB's own
   parallel substrate instead of client-side execution:
   - fan-out transforms → `DISTRIBUTE BY` + SET UDFs,
   - iterative chains → Lua execute scripts with `pquery`,
   - time-based continuation → exasol-scheduler `AFTER` chains.
   The agent stays the orchestrator of record; the DB does the heavy graph.
4. **Safety.** Concurrency never bypasses P1/P2 gates: write steps still
   require the approved plan; verification still runs on the final result.

### Steps
- [ ] `dag.ts` pure core + exhaustive tests (cycles, diamond deps, retry
      exhaustion, compensation, resume-from-partial)
- [ ] Executor wiring in the loop (plan → dag when >1 independent step)
- [ ] Durable step transitions + resume path
- [ ] `engine: "exasol"` offload for the three substrates (each behind its
      existing skill)
- [ ] Panel: live DAG status on the plan card

### Acceptance
A 6-step plan with two independent import branches runs both branches
concurrently, survives an app restart mid-run, retries a transient failure
once, and compensates (drops the staging table) when a branch fails hard.

---

## 6. Router & Semantic layer upgrades (ride-along work)

Not separate phases — each lands inside the phase that needs it:

- **Router** (with P2): the plan proposal includes the chosen route
  (`intent`, `skillsUsed`, `confidence: "high"|"low"`); low confidence makes
  the model ask ONE clarifying question first (codified in scenario-router).
  Metadata-aware routing: before planning, a cheap catalog probe (existing
  MCP find tools) grounds table/schema references so plans never name
  objects that don't exist.
- **Semantic layer** (with P1/P4): when Semantic Views are installed, the
  planner PREFERS measures/dimensions from them over ad-hoc SQL (skill
  instruction + a `list_semantic_views` tool); evals include a "used the
  semantic layer when available" expectation. Text AI / Transformers
  extensions remain optional enrichment, explicitly out of scope here.

---

## 7. What already exists and is explicitly NOT rebuilt

- Metadata plumbing (MCP describe/find, EXA_ALL_* search, schema graph) — reused as-is by every phase.
- Tool registry shape (`tools.ts` + `capabilities.ts`) — new tools slot in;
  no registry rewrite.
- Policy gates (`classifySql`, read-only DB identity, app-control, grants,
  share-gate, audit consent) — every phase routes THROUGH them; a
  declarative policy engine is deliberately out of scope until a second
  policy consumer exists (KISS: no speculative abstraction).
- Skills system (3-tier activation) — remains the routing/knowledge substrate.

## 8. Ground rules for every phase (repo law)

- Pure decision logic extracted and tested with `node:test` / `cargo test` —
  no vitest/jest, no test-free logic.
- Files split at ~500 lines; new modules never grow `loop.ts`/`tools.ts`
  past their stated-reason sizes — planners/executors are NEW files.
- Codex review before each phase ships; findings fixed before commit.
- No dead code; every phase lands usable end-to-end or not at all.
