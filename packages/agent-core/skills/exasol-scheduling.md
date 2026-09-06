---
name: exasol-scheduling
description: Schedule and automate anything — "run this every night", recurring SQL jobs, periodic data refresh, dashboard auto-refresh, cron for Exasol — using Studio dashboard refresh, the exasol-scheduler daemon (table-driven SQL jobs), or launchd+exapump on laptops
---

# Scheduling — pick the mechanism that actually fires

## Clarify first (one message)
1. **What runs?** A SQL statement/script? A data re-import? A dashboard that
   should stay fresh? (The scheduler runs SQL ONLY — it never invokes shell,
   dbt, or Python; such steps must become SQL/`EXECUTE SCRIPT` or be scheduled
   outside it.)
2. **Cadence?** (every N minutes / nightly / weekly …)
3. **Does a machine stay awake?** A laptop that sleeps cannot fire anything —
   this decides the mechanism.

## Route

| Situation | Mechanism |
|---|---|
| "Keep this dashboard fresh" | Studio's built-in dashboard auto-refresh (per-dashboard interval; see `dashboard-builder`) — no external scheduler needed |
| Recurring SQL on an ALWAYS-ON host (server, desktop that stays awake) | **exasol-labs/exasol-scheduler** — see below |
| Recurring SQL/loads on a LAPTOP (sleeps) | macOS `launchd` `StartCalendarInterval` running `exapump sql -p <profile> "<sql>"` — launchd REPLAYS a run missed during sleep; the scheduler daemon does not |
| Re-import external data on a cadence | The import statement (see `exasol-import`) wrapped in whichever row above matches the host |

## exasol-scheduler (table-driven SQL jobs)

What it is: a single stateless Rust binary that polls a normal Exasol table of
task definitions and executes each task's `SQL_TEXT` against the DB. Jobs are
managed with plain SQL: `INSERT`/`UPDATE` the task table (hot-reload, no
restart), chain steps with the `AFTER` column (downstream skipped on failure,
finalizers always run), and every execution lands in a history table you can
query.

Agentic setup flow:
1. It is NOT a Marketplace component — build/fetch per the repo README
   (`exasol-labs/exasol-scheduler`; `cargo build --release` or a release
   binary). Ask before installing anything.
2. Start it against THIS database:
   `exasol_scheduler "exasol://<user>:<pw>@127.0.0.1:8565?tls=1&validateservercertificate=0"`
   (Studio's Personal port is 8565, self-signed cert). Credentials come from
   the connected profile — never invent them.
3. Create the job: INSERT the task row (name, cron-style schedule, SQL_TEXT,
   optional AFTER) via run_sql — approval-gated like any write.
4. Verify: query the task + history tables and show the REAL next/last run.

**Honesty rules:** the daemon must stay running (systemd/Docker/launchd — it is
client-side, not inside the DB); missed runs are NOT replayed (next occurrence
is computed from the current time). Say both plainly when the host is a laptop
and steer to the launchd row instead. Never claim a job "will run nightly" on a
machine that sleeps at night.
