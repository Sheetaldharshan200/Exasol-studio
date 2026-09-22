# Spec Delta

## Purpose
Studio's local database is Exasol Personal 2.3.0, run by the official launcher on Podman on macOS, Linux and Windows; everything Studio does and says about the local database reflects 2.3.0's behaviour.

## ADDED Requirements

### Requirement: Studio installs Exasol Personal 2.3.0 from verified artifacts on every supported platform
Studio SHALL pin Exasol Personal `v2.3.0` and SHALL carry verified artifacts for macOS (arm64, x86_64), Linux (x86_64, arm64) and Windows (x86_64), each checked against the checksums Exasol published for the release before anything derived from the download exists.

#### Scenario: Linux install
- **WHEN** Studio on Linux x86_64 installs the local database
- **THEN** it downloads `exasol-personal_Linux_x86_64.tar.gz` for v2.3.0, verifies its SHA-256 against the locked value, and only then extracts and runs the launcher

#### Scenario: a checksum mismatch
- **WHEN** a downloaded artifact's SHA-256 does not match the lock
- **THEN** the file is discarded and the install stops with a message naming the mismatch

### Requirement: One local engine, chosen by the launcher
Studio SHALL rely on the Exasol launcher for the container engine on every platform and SHALL NOT probe for, install, offer or explain Docker or Colima anywhere; the "Exasol Community (Docker)" Marketplace engine SHALL be removed.

#### Scenario: Podman missing on Windows
- **WHEN** the launcher reports Podman is missing
- **THEN** Studio shows the launcher's own diagnostic and its offer to install Podman, and offers nothing about Docker

#### Scenario: the Marketplace
- **WHEN** the user opens the Marketplace
- **THEN** there is no Community (Docker) database tile

### Requirement: 2.3 behaviours are stated where they matter
Studio SHALL state, where the user can see the relevant setting, that the local database port is bound to `127.0.0.1` only; that confirmations run unattended when Studio drives the launcher; and SHALL describe custom and Rust script language containers and Parquet via `exasol connect` with the exact launcher commands.

#### Scenario: the local database's host
- **WHEN** the user views the local database's connection properties
- **THEN** the host is shown as `127.0.0.1` with a note that 2.3 no longer publishes the port on other interfaces

### Requirement: Virtual schemas are described as available locally
No Studio text or skill SHALL state that virtual schemas require a full Exasol, Community Edition, or Docker; where prerequisites are missing the text SHALL name them (adapter runtime and JARs) and point to the add-data-source flow that installs them.

#### Scenario: the virtual schema panel on Personal
- **WHEN** the user opens the add-data-source flow against the local database with no adapters installed
- **THEN** the flow offers to install the prerequisites rather than stating virtual schemas are unavailable
