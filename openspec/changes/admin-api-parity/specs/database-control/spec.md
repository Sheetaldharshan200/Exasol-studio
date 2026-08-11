## Purpose

The Health tab shows the cluster's databases with their true state and lets an administrator start or stop a database — the Admin UI's "Databases" screen, inside Studio.

## ADDED Requirements

### Requirement: Database list with state
With the Admin API connected, the Health tab SHALL show the cluster's databases (`db_list`) and each one's current state (`db_state`).

#### Scenario: State display
- **WHEN** the Admin API is connected
- **THEN** each database shows its name and live state (e.g., running, setup, stopped), refreshable

### Requirement: Confirmed start/stop
The user SHALL be able to start (`db_start`) and stop (`db_stop`) a database. Stop SHALL require explicit confirmation that names the database and warns that active sessions terminate. Outcomes SHALL be reported faithfully, including failures.

#### Scenario: Stop requires confirmation
- **WHEN** the user clicks stop on a running database
- **THEN** nothing happens until a confirmation naming the database is accepted, and afterwards the shown state reflects the cluster's answer

#### Scenario: Disconnected state
- **WHEN** no Admin API session exists
- **THEN** the Databases card shows the "Connect Admin API" state instead of controls
