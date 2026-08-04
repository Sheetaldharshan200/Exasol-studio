# Tasks — admin-api-parity

## 1. ConfD client (Rust)

- [x] 1.1 `src-tauri/src/confd.rs`: pure XML-RPC encoder `encode_call(method, params)` and decoder `parse_response(xml) -> serde_json::Value` (string/int/boolean/double/struct/array/nil; faults → Err with fault text). Tests: `#[cfg(test)]` round-trips incl. nested structs, fault parsing, empty params, non-ASCII.
- [x] 1.2 Admin sessions in AppState: `admin_sessions: Mutex<HashMap<String, AdminSession>>` (host, port, user, pass). Commands `confd_connect` (verifies via `db_list` before storing), `confd_status` (never returns the password), `confd_disconnect`. Blocking reqwest in `spawn_blocking`; TLS with `danger_accept_invalid_certs` scoped to this client.
- [x] 1.3 Command `confd_job(profile_id, job, params) -> Value` with the job ALLOWLIST (db_list, db_state, db_start, db_stop, db_info, db_backup_list, db_backup_start, db_backup_progress, db_backup_abort, db_backup_add_schedule, db_backup_modify_schedule, db_backup_remove_schedule, db_backups_delete, db_restore, st_volume_list); unknown job → error. Register commands in lib.rs. Test: allowlist gate (`#[cfg(test)]`).

## 2. Frontend plumbing

- [x] 2.1 ipc.ts: `confdStatus`, `confdConnect`, `confdDisconnect`, `confdJob` + `AdminApiStatus` type.
- [x] 2.2 `features/connection/AdminApiConnect.tsx`: inline connect form (host prefilled from the connection, port 20003, user `admin`, password) + connected/disconnect chip; self-signed TLS note. Reused by Backups and Health.
- [x] 2.3 `lib/native-schedule.ts`: pure `nativeScheduleFields(schedule)` mapping Studio's daily/weekly/monthly + HH:MM model to ConfD minute/hour/day/month/weekday fields, plus `parseDbInfoSchedules(dbInfo)` defensive reader. Tests: `lib/native-schedule.test.ts` (all three frequencies, weekday numbering, malformed db_info).

## 3. Native backups UI (BackupsPanel)

- [x] 3.1 "Cluster backups (native)" section: AdminApiConnect state; when connected — archive volumes (`st_volume_list`), backup list (`db_backup_list`) with id/volume/level/timestamp/expiration/usable, refresh; existing Studio-logical section relabeled "Studio backups (logical CSV)".
- [x] 3.2 "Backup now (native)": volume picker, level (0 default), optional expire; runs `db_backup_start`, polls `db_backup_progress` until done, Abort button (`db_backup_abort`); notifications on completion/failure; list refresh.
- [x] 3.3 Native schedules: list from `db_info` (`parseDbInfoSchedules`); add via `db_backup_add_schedule` using `nativeScheduleFields`; enable/disable + edit via `db_backup_modify_schedule`; delete via `db_backup_remove_schedule` (trash-icon confirm pattern). Label: "runs on the cluster clock, even when Studio is closed".
- [x] 3.4 Backup deletion (`db_backups_delete`) with confirm; Restore (`db_restore`) behind type-the-database-name guard naming the backup and the destructive consequence.

## 4. Database control (HealthPanel)

- [x] 4.1 "Databases" card: `db_list` + per-db `db_state`, refresh, AdminApiConnect state when disconnected.
- [x] 4.2 Start/stop actions: `db_start` plain; `db_stop` behind a confirm naming the database and warning that sessions terminate; state re-read after the job.

## 5. Verification & docs

- [x] 5.1 tsc + vite production build + full test suite green (node + Rust); manual E2E against Exasol Personal local if 20003 is mapped, else against the connect-failure path.
- [ ] 5.2 Codex review of the diff; fix findings; record notable ones in llm-wiki (`knowledge/wiki`), including the ConfD endpoint/auth/job cheat-sheet.
- [ ] 5.3 Update issue #45 with what shipped; note v2 non-goals (nodes/storage, snapshots, ConfD log collection, credential vault persistence).
