# Spec Delta

## Purpose
A guided flow that attaches another database or object store to an Exasol as a virtual schema — source, credentials, options, prerequisites, then a proved result — so a user never uploads a JAR or writes adapter DDL by hand.

## ADDED Requirements

### Requirement: The flow asks in the order a person thinks
The flow SHALL proceed source → credentials → source-specific options → prerequisites → create and prove, asking only for fields the chosen adapter declares, and SHALL open as a workbench tab.

#### Scenario: choosing PostgreSQL
- **WHEN** the user picks PostgreSQL
- **THEN** the credentials step asks for host, port (prefilled 5432), database, user and password, and the options step asks for the remote schema and the virtual schema name — nothing about JDBC URLs or driver classes

#### Scenario: choosing an S3 bucket
- **WHEN** the user picks S3 document files
- **THEN** the credentials step asks for bucket, region and access keys, and the options step asks for the file mapping — no JDBC fields appear

### Requirement: Studio installs what is missing, with approval
Before creating the schema the flow SHALL determine which prerequisites are absent on the target database — adapter script, adapter JAR, JDBC driver JAR — and install them itself after the user approves, reporting progress and every failure with its cause.

#### Scenario: nothing installed yet on Exasol Personal 2.3
- **WHEN** the target database has no adapter for the chosen source
- **THEN** the flow lists the adapter JAR and (for JDBC) the driver JAR it will fetch and upload, and the adapter script it will register, and waits for approval before doing any of it

#### Scenario: a driver that cannot be fetched
- **WHEN** the adapter's driver is user-supplied (for example a Simba driver)
- **THEN** the flow asks for the JAR file with a link to the vendor page and does not claim to have fetched anything

#### Scenario: an install step fails
- **WHEN** an upload to BucketFS or a `CREATE ADAPTER SCRIPT` fails
- **THEN** the flow stops, shows the database's or transport's actual error, and creates no virtual schema

### Requirement: Credentials live in a named CONNECTION, never in DDL text
The flow SHALL create a `CONNECTION` object for the source's credentials and reference it from the virtual schema; passwords SHALL never appear in the `CREATE VIRTUAL SCHEMA` statement or in any log or history entry.

#### Scenario: history after creating a schema
- **WHEN** the schema has been created
- **THEN** the SQL history contains the `CREATE VIRTUAL SCHEMA` statement without a password in it

### Requirement: Created means proved
After `CREATE VIRTUAL SCHEMA` succeeds the flow SHALL read from the new schema — list its tables and, for relational sources, select a handful of rows from one — and SHALL report success only when that read succeeds.

#### Scenario: the schema creates but the remote source rejects the read
- **WHEN** `CREATE VIRTUAL SCHEMA` succeeds but listing tables fails with the adapter's error
- **THEN** the flow reports failure with that error, offers to drop the schema, and does not announce success

#### Scenario: success
- **WHEN** the read succeeds
- **THEN** the flow shows the remote table names and the sample rows, and the rest of the app learns of the new schema without a restart
