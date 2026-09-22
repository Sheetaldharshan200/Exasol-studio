---
name: exasol-etl-orchestration
description: Build ETL/ELT pipelines on Exasol — stage (files, URLs, S3, other DBs, Kafka), transform (SQL / dbt), schedule the pipeline, monitor it — composed from the loading, dbt, scheduling and federation skills; virtual schemas and the cloud-storage extension run on Exasol Personal 2.3 once installed
---

# Pipelines — stage → transform → schedule → monitor

A "pipeline" here is composed from mechanisms you already have. Design it as
four explicit stages, confirm the design in one short message, then build each
stage with tools.

## Clarify first
1. Sources (files? URLs/S3? another DB? a stream?), and how often they change.
2. Transform logic (plain SQL? an existing dbt project? needs modeling?).
3. Cadence + which machine stays awake (decides the scheduler — see
   `exasol-scheduling`).
4. Who consumes the result (a schema? a dashboard? an export?).

## Stage — landing raw data (route per source)
| Source | Mechanism |
|---|---|
| Local/attached files (CSV/Parquet/JSON) | `data-loading-playbook` (import tools, exapump, json-tables) |
| HTTP/S3/cloud URLs | native `IMPORT INTO … FROM CSV AT '<url>'` (see `exasol-import`; named CONNECTION objects for credentials) |
| Another database or bucket | `exasol-federation` — a virtual schema (live) by default; IMPORT FROM JDBC/EXA for a snapshot |
| cloud-storage-extension (Parquet/Avro/ORC/Delta from object storage) | `exasol-cloud-storage-extension` — runs on Exasol Personal 2.3 once its BucketFS artifacts are installed |
| Kafka / streaming | No local streaming connector on Personal — offer micro-batch `IMPORT` on a schedule (`exasol-scheduling`) as the honest equivalent |

Land raw data in a dedicated `STAGE_*` schema; keep transforms out of it.

## Transform
- A few statements → plain SQL (`CREATE TABLE … AS SELECT` / `INSERT … SELECT`
  / views), per `exasol-database` guidance.
- Real modeling (lineage, tests, increments) → `exasol-dbt`.
- Reusable in-DB steps → Lua `EXECUTE SCRIPT` (works on Personal), which the
  scheduler can also call.

## Schedule
Route through `exasol-scheduling`: exasol-scheduler task rows with `AFTER`
chains for multi-step SQL pipelines on an always-on host (downstream steps skip
on failure; finalizers always run — use one for notifications/cleanup);
launchd+exapump on laptops; dashboard auto-refresh when the "pipeline" is
really just a fresh chart. dbt runs are scheduled OUTSIDE the scheduler daemon
(launchd/cron/CI) — it executes SQL only.

## Monitor
- Scheduler history table → a status query, or a small Studio dashboard over it
  (`dashboard-builder`): last run, failures, durations.
- After every build/backfill, report REAL row counts from tool results.

## Ground rules
- One approval per destructive step; never chain silent writes.
- Idempotent stages (`CREATE OR REPLACE`, truncate-and-load, or MERGE) so a
  re-run is always safe.
- State plainly what is snapshot vs live, and when each stage last ran.
