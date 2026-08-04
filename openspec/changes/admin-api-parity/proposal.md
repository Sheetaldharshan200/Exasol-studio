# Admin API parity (ConfD)

## Why

Issue #45 asked for the full Exasol Admin UI experience inside Studio. Everything a SQL connection can do is done (Logs, Health, BucketFS, logical backups + schedules), but native cluster administration — real database backups to archive volumes, backup schedules the CLUSTER executes, restore, database start/stop — was left as an "admin layer" boundary. That boundary is not magic: Exasol's Admin UI (port 8443) is a thin client over **ConfD**, the administration daemon that exposes an XML-RPC API on port 20003 (basic auth, `admin`/`exaadm` users, `job_exec(job, {params})`). Studio can speak that protocol and close the gap.

## What Changes

- A Rust ConfD client (XML-RPC over TLS via the existing reqwest, self-signed certificates tolerated) with per-connection admin credentials that are entered in the UI, held only in backend memory, and never sent back to the frontend.
- The Backups tab gains a **Native backups** section: archive volumes, the cluster's backup list, "Backup now (native)" with level/expire/volume, live progress and abort.
- Native backup **schedules** (cluster-executed cron) managed from Studio via `db_backup_add_schedule` / `db_backup_modify_schedule` / `db_backup_remove_schedule`, listed from `db_info`. Studio's existing timezone-aware logical (CSV) schedules remain, clearly labeled as Studio-run.
- **Restore** (`db_restore`) behind a typed-confirmation guard.
- A **Databases** card in the Health tab: `db_list`/`db_state` with start/stop actions (confirmed).
- Graceful degradation everywhere: no admin credentials / unreachable 20003 (SaaS, Personal local without a mapped admin port) → a clear "Connect Admin API" state; all existing SQL-based features keep working unchanged.

## Capabilities

### New Capabilities
- `confd-client`: Rust XML-RPC client for ConfD — connect/authenticate, run jobs, poll job results; credential handling rules.
- `native-backups`: list volumes/backups, start/abort native backups with progress, manage cluster backup schedules, guarded restore.
- `database-control`: list databases with state; start/stop a database with explicit confirmation.

### Modified Capabilities
<!-- none — existing logical-backup behavior is unchanged; native features are additive -->

## Impact

- New Rust module `src-tauri/src/confd.rs` (+ commands registered in lib.rs); reqwest already a dependency.
- `BackupsPanel.tsx` grows the Native backups section; `HealthPanel.tsx` gains the Databases card; a small shared `AdminApiConnect` credential form.
- ipc.ts: `confdStatus`, `confdConnect`, `confdJob`-backed typed wrappers.
- Security: admin credentials never reach the frontend after entry; not persisted in v1 (re-entered per app session); vault persistence is follow-up.
- Non-goals (v2+): node/storage management, cluster install/update, Kerberos, snapshot backups, log collection via ConfD.
