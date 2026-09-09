---
name: scenario-router
description: THE master intent router — for every user request ("load this data", "schedule this", "combine these sources and show me X", "build a pipeline", "use dbt", "visualize this", "is there a tool for…") pick the right Exasol tool/skill instead of guessing, ask the right clarifying questions first, and act agentically end-to-end
---

# Scenario router — from intent to the right tool, agentically

You have real tools and a curated skill library. NEVER guess or improvise a
mechanism: route the request with the matrix below, load the named skill for
the details, and execute with tools. When a request is ambiguous, ask the
scenario's clarifying questions FIRST (one short message, all questions at
once), then act without further hand-holding.

## Intent → route

| The user wants… | Route |
|---|---|
| Load a file / "here is my data" (CSV, TSV, Parquet, JSON, folder) | `load_skill('data-loading-playbook')` — import_csv / import_attachments / exapump / json-tables / IMPORT AT url |
| See data ACROSS two or more places ("I have data here and a source there, show me…") | `load_skill('exasol-federation')` — clarify sources, then import+join (Personal) or virtual schemas (full Exasol) |
| Schedule / automate / "run this every…" / recurring refresh | `load_skill('exasol-scheduling')` — dashboard auto-refresh, exasol-scheduler daemon, or launchd+exapump |
| Model / transform with dbt, "dbt project", incremental models | `load_skill('exasol-dbt')` — the official dbt-exasol adapter |
| A pipeline: stage → transform → schedule → monitor (ETL/ELT) | `load_skill('exasol-etl-orchestration')` |
| A chart / dashboard / "visualize this" / live report | `load_skill('dashboard-builder')` — Studio's dashboard ops on this doc |
| A semantic layer / governed metrics / "define revenue once" | `load_skill('exasol-semantic-analyst')` (Marketplace component `semantic-views`) — when installed, call `semantic_models` FIRST and prefer published measures/dimensions over ad-hoc SQL; the models are revalidated (and their surfaces refreshed) automatically after every schema change or data load you make, so surface open validation issues to the user instead of querying around them |
| A NEW dataset just loaded and `semantic_models` shows it under `schemasWithoutModel` | OFFER to draft a semantic model for it (one sentence, don't push). On yes: NEVER guess script syntax — `SELECT SCRIPT_NAME, PARAMETER_NAME, CALL_TEMPLATE FROM SEMANTIC_CATALOG.ADMIN_SCRIPT_PARAMETERS` has every signature. Bootstrap the graph with `semantic_admin` (`CREATE_MODEL` → `ADD_ENTITY` per table with its real grain → `ADD_RELATIONSHIP` + `ADD_UNIQUE_KEY_WITH_COLUMNS` + `ADD_RELATIONSHIP_KEY_MAPPING` per join → `ADD_SEMANTIC_OBJECT` → `ADD_DIMENSION` per attribute), then shape facts/metrics with `semantic_apply_definition` — DRY-RUN first, commit only after STATUS is clean — and finish with `VALIDATE_MODEL`. The model stays a reviewable DRAFT: call `PUBLISH_MODEL` only when the user explicitly says publish |
| The user says "continue", "do it", "finish the todo list" with an open plan | The current plan IS the todo list: read it (gateway: `current_plan`), finish its pending steps, or supersede a malformed plan with a corrected proposal — never ask what they meant when a plan is open |
| Export data out (files, another system) | `load_skill('exasol-export')` / `export_tables` tool |
| Plain SQL work: query, schema design, profiling, tuning | `load_skill('exasol-database')` |
| ML / embeddings / text AI | `load_skill('exasol-distributed-ml')` or `exasol-text-ai` — mind the Personal limits below |
| "Is there an Exasol tool/connector/driver for X?" | `load_skill('exasol-ecosystem')` — the org-wide catalog; never recommend archived repos |

## Know what is installed — check, don't assume

Optional capabilities (json-tables, semantic-views, exapump, dash/BI addons)
are Marketplace components. Before telling the user to use one, VERIFY it:
`studio_control` action `component_status {id}`; offer `install_component {id}`
(always ask before installing). exapump availability is also probed by the
import tools themselves — trust their result over assumptions.

## Know which database you are on — capabilities differ

Most users here run **Exasol Personal (local)** — Studio's managed DB on
127.0.0.1:8565 (self-signed TLS). On Personal: everything driver + SQL (+ Lua
scripts, + official-SLC UDFs) works; **virtual schemas, BucketFS uploads,
kafka-connector and cloud-storage-extension do NOT** (no user BucketFS).

**NEVER answer "we can't do that."** When a scenario needs a blocked
capability, there are always two working paths — offer both:
(a) the Personal-native equivalent (usually import+join / IMPORT-AT-URL), and
(b) the escalation ladder in `load_skill('exasol-community-upgrade')` — check
Docker, install it with permission if missing, deploy Exasol Community Edition
with permission, and run the real capability there.

## Agentic ground rules (every scenario)

1. **Clarify once, up front** — collect all unknowns in one question set
   (source locations, credentials, live vs snapshot, cadence, target schema).
2. **Plan in one visible line** — say which mechanism you chose and why.
   For MULTI-STEP work (3+ dependent actions: load files then query then
   chart, federation setups, migrations) call `propose_plan` FIRST — the plan
   renders live in Studio with per-step status. Update each step with
   `update_plan_step` (running → done/failed with a short note) as you work.
   A plan containing WRITE steps needs the user's explicit yes: present it,
   wait, then `approve_plan` — never approve on their behalf. Single-step
   questions get NO plan (zero ceremony). When every remaining step carries
   SQL and 2+ are independent, run them with `execute_plan` (parallel, retry,
   skip-on-failure, `onFailure` compensation) instead of one-by-one — and
   give a risky step an `onFailure` compensation step (drop the staging
   table) when there is state to clean up. When one step can fan out INSIDE
   the database, prefer that: bulk transforms via `DISTRIBUTE BY` + SET UDFs,
   iterative chains via a Lua script with `pquery`, time-based follow-ups via
   the exasol-scheduler's AFTER chains — the database is the better engine
   for its own graph.
3. **Act with tools** — real tool calls, approval-gated writes; never narrate
   fake commands or invent SQL dialect (no EXA_PUMP SQL, no CALL import_csv).
4. **Verify with real results** — report actual row counts / job rows /
   query output from tool results; never fabricate. For a numeric or
   result-backed final answer, run the ANSWER-BACKING query with
   `verify: true` (run_query) — Studio reproduces it on an independent
   database session and returns a `verification` stamp. Quote the stamp:
   "verified on an independent session" / on `mismatch`, present BOTH numbers
   and say they disagree — never hide it. Exploration queries stay unverified
   (no verify flag) to keep them fast.
5. **Finish the loop** — after the mechanism works, offer the next step in the
   chain (loaded → visualize it; federated → dashboard it; scheduled → show
   the history query).
