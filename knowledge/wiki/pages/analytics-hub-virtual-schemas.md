---
title: Analytics hub — virtual schemas, one file per adapter
category: architecture
updated: 2026-09-21
---

# Analytics hub: attach any database or bucket to one Exasol

Exasol Personal 2.3 (GA 2026-09-21) enabled virtual schemas on local
deployments, so one local Exasol can federate PostgreSQL, MySQL, S3, another
Exasol, … and the user queries everything from the editor, the visualizer or
the agent. This page records the decisions behind Studio's implementation so
they are not re-derived.

## Where things live

- `apps/desktop/src/features/connection/virtual-schemas/`
  - `adapters/<source>.ts` — **one file per upstream adapter**, 23 of them,
    the set pinned to the non-archived `exasol/*-virtual-schema*` repos by
    `adapters/index.test.ts` (a new or archived upstream repo fails the test).
    Each carries the release tag + asset pattern, fields, connection/property
    builders, driver source and a prove mode.
  - `ddl.ts` — pure DDL text (connection, adapter script, import UDF, virtual
    schema, prove, drop). Passwords never appear in `CREATE VIRTUAL SCHEMA`.
  - `prereqs.ts` — `missingPrerequisites(adapter, probe)`: what must exist
    before the DDL can succeed. Exact `vs/<file>` path matching — a basename
    match once let a stale JAR in another directory count as installed.
  - `plan.ts` — `buildPlan` → the ordered statements the flow runs;
    `readyToCreate` → whether the prerequisites step may advance.
  - `AddSourceFlow.tsx` + `steps/*` — the tab: source → credentials →
    options → prerequisites → create and prove.
- `apps/desktop/src-tauri/src/virtual_schema_install.rs` — `vs_stage_adapter`
  and `vs_local_state`.
- `apps/desktop/src-tauri/tests/virtual_schema_live.rs` — the opt-in live
  proof (`EXASOL_LIVE_PASSWORD=… cargo test --test virtual_schema_live -- --include-ignored`).

## Decisions

**Created means proved.** The create step is not finished after
`CREATE VIRTUAL SCHEMA` succeeds; it then lists the remote tables and reads
rows from the first one. A schema whose read fails is shown as a failure with
the adapter's own message and a one-click "Remove what was created"
(`DROP VIRTUAL SCHEMA … CASCADE` + `DROP CONNECTION`). The agent skill
`exasol-federation` carries the same rule.

**Files go through `/exa`, not BucketFS HTTP.** The 2.3 guide exposes the
deployment's `/exa` at `<deployment>/local/runtime/exa`. Studio writes the
adapter JAR to `exa/bucketfs/bfsdefault/default/vs/` (SQL sees
`/buckets/bfsdefault/default/vs/…`) and a JDBC driver to
`exa/jdbc/<DRIVERNAME>/` + `settings.cfg`, runs
`exasol --auto-approve slc install java --no-restart`, and restarts once.
A deployment created under 2.2 gains `/exa` after one stop/start with the
2.3 launcher (verified live on 8565). No BucketFS password is needed and
nothing is probed over HTTP.

**Lua adapters are inlined.** `exasol-virtual-schema-lua` and the Databricks
adapter ship a `.lua`; the released source goes straight into
`CREATE LUA ADAPTER SCRIPT`. No JAR, no driver, no language container — which
is why the live test attaches the local database *to itself* through it: the
proof depends on nothing but a running database. Inside the container the
database reaches itself at `localhost:8563` (Podman publishes 8565 on the
host); `EXASOL_LIVE_SELF_ADDRESS` overrides that.

**Statements are never split.** The flow calls `executeSql(…, split=false)`
per statement: adapter scripts contain `;` in `%scriptclass`/`%jar` lines
and a Lua body, and the splitter would shred them.

**Driver sources.** Open-source JDBC drivers come from Maven Central
(`maven_urls` in Rust builds the URL, latest version via `maven_latest_version`).
Vendor drivers (Oracle, Db2, HANA, Sybase, Simba for BigQuery/Athena) are
"user-supplied": the flow links the vendor page and asks for the local JAR
path. A remote (non-managed) Exasol cannot be written to, so the flow asks
for the name of the file the user uploaded and generates DDL against it.

**Not managed ≠ unsupported.** On a database Studio does not manage, only
the scripts (which the plan creates) can be reported missing — bucket
contents are unknown, so the flow does not pretend to know them.

## Gotchas found while landing it

- `reqwest::blocking` inside a `#[tokio::test]` panics ("Cannot drop a
  runtime in a context where blocking is not allowed") — use the async client.
- `uv run --no-sync --project <python-stack>` on a machine that never synced
  creates an EMPTY venv and `import pyexasol` fails; CI syncs first
  (`uv sync --locked`), the local verify script now lets uv sync and points
  `UV_PROJECT_ENVIRONMENT` outside the repo.
- exarrow pulls `aws-lc-rs`; Studio installs `ring` as the process default
  provider before the first connection (also in the live test).

## Codex review findings (2026-09-21) and their fixes

1. **Lua adapters are not all self-contained.** Databricks is `runtime: "lua"` *with* a JDBC driver. "Lua = fetch anywhere" therefore over-reached: on a remote database the flow would have tried to stage the driver into Studio's local `/exa`. Fix: only the Lua *source* is fetched for a remote database (`driver` omitted from the stage request), the driver is a manual registration the user confirms, and `readyToCreate` requires both (`plan.test.ts`).
2. **A registered driver needs a restart whatever the adapter runtime.** The restart was gated on `runtime == "java"`, so a Lua+driver stage could create the schema before the ETL layer had read `jdbc/<NAME>/settings.cfg`. Fix: `needs_restart = driver_file.is_some() || java_slc_installed`. Also the JDBC prefix for `settings.cfg` is now computed for every `kind: "jdbc"` adapter, not only Java ones (Databricks got `PREFIX=jdbc:` before).
3. **"Scripts exist" must cover the import UDF.** The plan skipped script creation when only the adapter script existed, leaving a document adapter without its `IMPORT_FROM_*` UDF. Fix: pure `needsScriptInstall(missing, staged)` over both script kinds, tested with the S3 fixture.

Rule of thumb that falls out of it: classify by *what gets written where* (`writes_files = java || driver`), never by the adapter's language.
