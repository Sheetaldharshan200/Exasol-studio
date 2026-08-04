# Design — admin-api-parity

## Context

ConfD is XML-RPC over HTTPS on port 20003 with HTTP basic auth (`admin` / members of `exaadm`); the documented client call shape is `job_exec(job_name, {'params': {...}})` returning a result struct. The verified job inventory (docs.exasol.com, db/latest): `db_list`, `db_state`, `db_start`, `db_stop`, `db_info`, `db_backup_list`, `db_backup_start` (db_name, backup_volume_name|backup_volume_id, level, expire), `db_backup_progress`, `db_backup_abort`, `db_backup_add_schedule` (backup_name, volume, level, expire, enabled, minute/hour/day/month/weekday), `db_backup_modify_schedule`, `db_backup_remove_schedule`, `db_backups_delete`, `db_restore`, `st_volume_list`. Clusters present self-signed certificates on this port. Studio's existing constraints: passwords never reach the frontend; reqwest (blocking, rustls) is already a dependency; the repo mandates pure-function tests (Rust `#[cfg(test)]`, node:test).

Reachability reality: on-prem/c4 clusters expose 20003; Exasol SaaS does not; Exasol Personal (local) runs c4 in a container where the admin port may not be mapped — the feature must degrade to a "Connect Admin API" state without breaking any SQL-based feature.

## Goals / Non-Goals

**Goals:**
- Native cluster administration (backups, schedules, restore, db start/stop) from Studio wherever ConfD is reachable, with the Admin UI's semantics.
- Zero regression and zero new requirements for connections without ConfD.
- Credentials stay in Rust memory; frontend only ever sees connected/username/host/port.

**Non-Goals:**
- Node/storage/infra management, cluster install/update, Kerberos, snapshot backups, ConfD-based log collection (later changes).
- Persisting admin credentials (v1 re-enters per app session; vault integration is follow-up).

## Decisions

1. **Hand-rolled minimal XML-RPC over reqwest** rather than an xmlrpc crate: we need exactly one method (`job_exec`) plus login semantics, values limited to string/int/bool/double/struct/array. A ~150-line encoder/decoder with `quick-xml`-free manual parsing keeps dependencies flat and is fully unit-testable. Encoder/decoder are pure functions (`encode_call`, `parse_response` → serde_json::Value) with `#[cfg(test)]` round-trip tests.
2. **Session model:** `AppState.admin_sessions: Mutex<HashMap<profileId, AdminSession { host, port, user, pass }>>`. `confd_connect` verifies with `db_list` before storing. `confd_status` returns presence + user/host/port only. `confd_disconnect` clears. Every native command reads the session server-side; the frontend never passes credentials per call.
3. **One generic backend job runner, typed frontend wrappers.** Rust command `confd_job(profile_id, job, params: Value) -> Value` guarded by an allowlist of the jobs in scope (defense against arbitrary job execution from a compromised renderer). ipc.ts exposes typed helpers (`confdBackupList`, `confdBackupStart`, …) over it.
4. **Cron mapping stays a pure TS function** (`nativeScheduleFields(schedule)`) translating the Studio schedule model (daily/weekly/monthly + HH:MM) to ConfD's minute/hour/day/month/weekday fields — tested with node:test. Native schedules run on the CLUSTER's clock; the UI labels this explicitly (no timezone illusion), while Studio's logical schedules keep their timezone semantics.
5. **UI split:** BackupsPanel gets two clearly labeled groups — "Cluster backups (native)" (volumes, backup list, backup now, schedules, restore) and the existing "Studio backups (logical CSV)". A shared `AdminApiConnect` inline form appears wherever a native section is disconnected. HealthPanel gets a "Databases" card using the same status hook.
6. **Destructive guards:** restore requires typing the database name; db_stop requires a confirm dialog naming the database. Both reuse the existing two-step Review/Confirm pattern.

## Risks / Trade-offs

- **ConfD result shapes vary by version.** Mitigation: decode into `serde_json::Value`, map fields defensively in TS, show raw values in a details view rather than failing hard.
- **Blocking reqwest on the async runtime**: run calls in `tokio::task::spawn_blocking` (same pattern as driver_exec).
- **Self-signed TLS acceptance** widens MITM surface for the admin session; scoped to the admin client only (`danger_accept_invalid_certs`), never applied to other HTTP clients, and stated in the connect form.
- **Personal local may not expose 20003** — connect simply fails with a clear message; docs note how to map the port. No auto-probing beyond the user-initiated connect.
- **Allowlist drift**: adding a job requires touching one Rust list — cheap, and prevents the generic runner becoming an arbitrary-admin RPC.
