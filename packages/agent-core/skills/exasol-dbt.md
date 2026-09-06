---
name: exasol-dbt
description: Transform and model data with dbt on Exasol — install the official dbt-exasol adapter, write profiles.yml for Exasol Personal (self-signed cert), scaffold a project, run/test models, incremental + partition/distribute configs
---

# dbt on Exasol — the official adapter, wired to THIS database

`exasol/dbt-exasol` is the official dbt-core adapter. It fully works on Exasol
Personal (it is driver + SQL — nothing BucketFS-bound).

## Agentic flow

1. **Check the toolchain** (shell tool): `dbt --version`. If missing or the
   exasol plugin isn't listed, ask, then `pip install dbt-exasol` (a venv or
   pipx if the user prefers isolation).
2. **Write the profile from the CONNECTED database** — real host/port/user from
   the active connection, never invented. For Studio's Personal DB:

   ```yaml
   # ~/.dbt/profiles.yml
   <project>:
     target: dev
     outputs:
       dev:
         type: exasol
         threads: 1
         dsn: 127.0.0.1:8565
         user: sys
         password: "<from the connection — ask the user to fill it, don't echo secrets>"
         dbname: DB            # required by dbt-core; Exasol ignores the value
         schema: <target schema>
         encryption: true
         validate_server_certificate: false   # required: Personal uses a self-signed cert
   ```

3. **Scaffold or adopt**: `dbt init <project>` in the user's workspace, or run
   inside their existing project. `dbt debug` first — show its REAL output
   before claiming the connection works.
4. **Build**: `dbt run` / `dbt test` / `dbt build`; report actual model
   counts + failures from the output.
5. **Close the loop**: results are ordinary Exasol tables/views — offer to
   query them, chart them (`dashboard-builder`), or schedule the run
   (`exasol-scheduling`; note the scheduler daemon cannot execute dbt itself —
   schedule dbt with launchd/cron/CI, or materialize the logic as SQL the
   scheduler can run).

## Adapter facts worth knowing
- Exasol has no multi-database concept: `dbname` is accepted-but-ignored;
  schemas are the namespace.
- ≥1.8.1 supports per-model `partition_by_config`, `distribute_by_config`,
  `primary_key_config` on table/incremental materializations.
- Seed CSVs: the adapter auto-detects the row separator per file; a forced
  wrong `row_separator` fails silently (stray `\r` in the last column, or zero
  rows loaded "successfully") — leave it on auto unless proven necessary.
- SaaS: OpenID `access_token`/`refresh_token` may replace user+password.
- For anything else consult the adapter README (`exasol/dbt-exasol`) rather
  than guessing config keys.
