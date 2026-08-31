# Data deviation & data quality — knowledge graph + semantic views + in-DB AI

Issue #28: research how our stack (knowledge graph, semantic views,
in-database AI, Studio agent) makes a credible data-quality / data-deviation
offering — something that convinces a head of data, not a demo.

## What "data deviation" means operationally

Two families, both computable IN the database (no data leaves):

1. **Structural drift** — schema changed, column type widened, table stopped
   refreshing, row counts flatlined or spiked.
   - Sources we already read: `SYS.EXA_ALL_TABLES.TABLE_ROW_COUNT`,
     `EXA_ALL_COLUMNS`, `EXA_STATISTICS` (DB size, usage over time — the
     Storage & size / Query performance system dashboards already query
     these).
2. **Statistical drift** — null-rate, distinct-cardinality, min/max/mean and
   distribution shift between time windows. All expressible as plain Exasol
   SQL profiling queries (`COUNT`, `COUNT(DISTINCT)`, `APPROXIMATE_COUNT_DISTINCT`
   for billions of rows, `MIN/MAX/AVG/STDDEV`, `GROUP BY` histograms) —
   exactly the aggregation shape Exasol is fastest at, which is the pitch:
   **profiling a billion-row table is an interactive query here, not a batch
   job.**

## Why the knowledge graph + semantic views matter

Raw drift numbers don't convince anyone; *explained* drift does.

- **Semantic views** give columns meaning ("this is a dosage in mg", "this is
  a settlement amount") — so a null-rate jump is reported as "3% of
  settlements this week are missing amounts", not "COL_17 null-rate +3pp".
- **The agent's schema knowledge graph** (agent-core `kb`, crawled per
  connection) knows relationships — so a deviation in a fact table can be
  traced to the dimension or upstream virtual-schema source it joins.
- **The in-app agent / MCP gateway** turn checks into conversations: any AI
  client can ask "what deviated this week and why", grounded in the graph,
  read-only, with SQL shown before it runs.

## Proposed shape (incremental, each step useful alone)

1. **Profile snapshots** — a `STUDIO_DQ` schema with one statement per run:
   `INSERT INTO dq_profile SELECT CURRENT_TIMESTAMP, table, column, count,
   nulls, approx_distinct, min, max, avg FROM …` — generated from the
   catalog, scheduled via dashboards' refresh or connection hooks.
2. **Deviation views** — plain SQL views comparing the latest snapshot to a
   trailing window (z-score on null-rate / row-count deltas). These become
   panels in a "Data quality" system dashboard group — the same dashboard
   machinery that ships today.
3. **Agent narration** — a skill that reads the deviation views + the KB
   graph + semantic views and writes the "what changed, where it came from,
   who should care" summary. Exposed to external clients through the gateway
   as a Studio service (like dashboards).
4. **In-database AI** (where licensed) — anomaly scoring as UDFs next to the
   data for cases where SQL z-scores aren't enough.

## The pitch to a data head (grounded claims only)

- Checks run **inside** the warehouse: no samples exported, DB RBAC enforced,
  read-only gateway for AI access.
- Profiling scale is Exasol's home turf — full-column checks over billions of
  rows at interactive speed instead of sampled checks.
- Explanations are semantic (views) and causal-ish (graph lineage across
  virtual schemas), and reachable from whatever AI client the team already
  uses — no captive chatbot.

## Follow-ups

- Ship step 1+2 as a Marketplace kit ("Data quality starter").
- Deviation events → the notification system + execution-log style table.
- Per-check ownership metadata in semantic views (who to alert).
