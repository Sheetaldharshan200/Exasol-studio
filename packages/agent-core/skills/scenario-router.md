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
| A semantic layer / governed metrics / "define revenue once" | `load_skill('exasol-semantic-analyst')` (Marketplace component `semantic-views`) |
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
3. **Act with tools** — real tool calls, approval-gated writes; never narrate
   fake commands or invent SQL dialect (no EXA_PUMP SQL, no CALL import_csv).
4. **Verify with real results** — report actual row counts / job rows /
   query output from tool results; never fabricate.
5. **Finish the loop** — after the mechanism works, offer the next step in the
   chain (loaded → visualize it; federated → dashboard it; scheduled → show
   the history query).
