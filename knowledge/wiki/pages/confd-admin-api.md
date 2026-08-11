---
title: ConfD Admin API — endpoint, auth, jobs (admin-api-parity)
category: how-to
---

# ConfD Admin API cheat-sheet

Exasol's Admin UI (port 8443) is a thin client over **ConfD**, the administration daemon. Studio talks to it directly (`src-tauri/src/confd.rs`, change `admin-api-parity`).

## Endpoint & auth
- **XML-RPC over HTTPS, port 20003** on the first active cluster node; self-signed certs are the norm (Studio accepts them for the admin client ONLY).
- **Basic auth**: `admin` (created at deployment) or any member of the `exaadm` group.
- One method matters: `job_exec(job_name, {"params": {...}})`.
- Exasol SaaS does not expose 20003. Exasol Personal (local exakit/c4) only if the container maps the admin port — otherwise the connect fails with a clear message and only SQL-based features apply.

## Jobs Studio uses (allowlist in confd.rs)
`db_list`, `db_state`, `db_start`, `db_stop`, `db_info`,
`db_backup_list` (db_name, show_foreign), `db_backup_start` (db_name, backup_volume_name|backup_volume_id, level, expire "#m #w #d #h"),
`db_backup_progress`, `db_backup_abort`,
`db_backup_add_schedule` (backup_name, volume, enabled, level, expire, minute/hour/day/month/weekday — cluster-clock cron, weekday 0=Sun),
`db_backup_modify_schedule`, `db_backup_remove_schedule` (schedules readable from `db_info` → config.backups),
`db_backups_delete` (backup_ids), `db_restore` (db_name, backup_id), `st_volume_list`.

## Gotchas learned
- Result shapes vary by version → decode into JSON values and map fields defensively (see `parseDbInfoSchedules` / the `bkField` helper), never hard-fail on a missing key.
- The XML-RPC codec is hand-rolled and pure (`encode_call`/`parse_response`, 7 unit tests) — one method, six value kinds; don't add an xmlrpc crate for this.
- **Admin credentials never reach the frontend**: sessions live in `AppState.admin_sessions` (memory only, per app session); `confd_status` returns host/port/user only. The generic `confd_job` command is gated by the job allowlist so a compromised renderer can't run arbitrary admin RPCs.
- Studio's own timezone-aware schedules (logical CSV backups) and ConfD's cluster-clock cron schedules are different systems — the UI labels who executes what; don't merge them.
