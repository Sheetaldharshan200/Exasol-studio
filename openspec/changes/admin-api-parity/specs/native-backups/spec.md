## Purpose

The Backups tab manages the cluster's own backups — the same operations as Exasol's Admin UI: list archive volumes and backups, start/abort a native backup with progress, manage cluster-executed backup schedules, and restore — alongside (and clearly separated from) Studio's logical CSV backups.

## ADDED Requirements

### Requirement: Native backup listing
With the Admin API connected, the Backups tab SHALL show the cluster's backups (`db_backup_list`) for the connection's database — id, volume, level, timestamp, expiration, usability — and the available archive volumes.

#### Scenario: Backups listed
- **WHEN** the Admin API is connected and the database has backups on an archive volume
- **THEN** the native section lists them with their metadata and a refresh control

#### Scenario: Admin API not connected
- **WHEN** no Admin API session exists for the connection
- **THEN** the native section shows a "Connect Admin API" call to action instead of empty tables, and the Studio logical-backup features remain fully usable

### Requirement: Start and abort a native backup
The user SHALL be able to start a native backup (`db_backup_start`) choosing archive volume, level (0 = full), and optional expiration, watch its progress (`db_backup_progress`), and abort it (`db_backup_abort`).

#### Scenario: Manual native backup
- **WHEN** the user starts a native backup with a chosen volume and level
- **THEN** progress is visible until completion and the backup list refreshes to include the new backup

#### Scenario: Abort
- **WHEN** the user aborts a running native backup
- **THEN** the cluster stops the backup and the UI reflects the aborted state

### Requirement: Cluster backup schedules
The user SHALL manage cluster-executed backup schedules — add (`db_backup_add_schedule` with minute/hour/day/month/weekday cron fields, level, expire, volume), modify (`db_backup_modify_schedule`), enable/disable, and remove (`db_backup_remove_schedule`) — with current schedules read from `db_info`. These SHALL be visually distinct from Studio's own logical (CSV) schedules, including who executes them (cluster vs Studio) and their time basis (cluster clock vs chosen timezone).

#### Scenario: Add a nightly cluster schedule
- **WHEN** the user adds a native schedule for 02:00 daily to a volume
- **THEN** the schedule appears in the cluster's configuration and runs without Studio being open

### Requirement: Guarded restore
Restore (`db_restore`) SHALL require the user to type the database name to confirm, state that current data will be replaced, and report the outcome faithfully.

#### Scenario: Restore confirmation
- **WHEN** the user initiates a restore from a listed backup
- **THEN** nothing runs until the exact database name is typed, and the dialog names the backup and the destructive consequence
