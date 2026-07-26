# Consolidating data + AI on Exasol — where it fits, honestly

Issue #27 asks the real question enterprises (pharma, finance) have: they own a
zoo of warehouses, every platform ships its own captive AI (Databricks Genie,
Snowflake Cortex, …), and users still end up in Claude/ChatGPT anyway. What is
the consolidation story where Exasol is used *properly* — not forced?

## Where Exasol genuinely fits

Exasol's durable edge is **interactive aggregation over very large row counts
on modest hardware** — in-memory columnar MPP, automatic indexes, no tuning
ceremony. Our own benchmark in this repo: 38.3M rows loaded at ~532K rows/s
via `exapump` on a laptop-class nano container, and the profiler shows
billion-row `GROUP BY`s staying interactive. That makes Exasol the right
**speed layer / aggregation engine**, not necessarily the system of record.

Use it for:
- **Hot aggregates over billions of rows** — the dashboards, the "which
  cohort deviated this week" questions, the AI agent's `GROUP BY` workloads.
- **Consolidation via virtual schemas** — Postgres/other warehouses mounted
  as schemas (Studio ships the VS wizard + driver upload), so data can be
  *queried together* before anyone commits to moving it.
- **Bulk landing** — `exapump` for CSV/Parquet at six-digit rows/s.

Do NOT force it for: unstructured blobs, document stores, streaming event
buses, or as a data lake replacement. The honest pitch is "your aggregation
and BI/AI serving layer over whatever you keep elsewhere".

## The consolidation architecture Studio already ships

The pieces exist in this repo today — the story is wiring, not vaporware:

1. **Federate** — virtual schemas mount external systems next to native
   schemas; one SQL surface.
2. **Land the hot paths** — `exapump` bulk loads what needs Exasol speed.
3. **Describe** — Semantic Views (auto-refreshed per schema) give every
   consumer — human or model — column meanings, units, and relationships.
4. **Serve every AI, not a captive one** — this is the anti-Genie move:
   - The **in-app agent** (agent-core) plans over the schema knowledge graph
     and runs SQL with approval gates.
   - The **Studio MCP gateway** (`exasol-studio` entry) exposes *all*
     connected databases to Claude, Cursor, Copilot, Gemini, Codex, OpenCode —
     read-only, per-connection service selection (SQL / text-to-SQL), plus
     Studio services (dashboards). Users keep the AI they already use; the
     data stays governed in the database (RBAC is the DB's, not the client's).

That last point is the differentiator versus Genie-style lock-in: **the
consolidation point is the database + gateway, not the chatbot.** Any MCP
client gets the same grounded, read-only, schema-aware access.

## What "billions of rows + aggregate" means for the agent

- The gateway and agent never fetch raw billions — row caps + the rule that
  models write `GROUP BY`/aggregates and inspect SQL before running.
- The profiler (`Performance` button, EXA_USER_PROFILE_LAST_DAY) shows where a
  big aggregation spends time, so the agent can propose *measured* rewrites.
- Text-to-SQL (`generate_sql`) is grounded in `SYS.EXA_ALL_COLUMNS`, returns
  SQL for inspection, never auto-executes.

## Gaps / follow-ups (tracked, not hand-waved)

- Cross-database JOIN guidance in the agent (today: one database per query
  through the gateway; virtual schemas are the join path).
- Cost/row-count guardrails surfaced *before* running (estimate via
  TABLE_ROW_COUNT and warn).
- A packaged "consolidation kit" (VS + exapump + semantic views + gateway
  setup as one Marketplace kit).
