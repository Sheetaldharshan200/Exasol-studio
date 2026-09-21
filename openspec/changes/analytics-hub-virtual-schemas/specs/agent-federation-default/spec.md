# Spec Delta

## Purpose
When the user tells the agent their data lives in another database or bucket, the agent's first proposal is to attach it as a virtual schema, so the user gets a live view without knowing the term.

## ADDED Requirements

### Requirement: "Data over there" means a virtual schema first
When the user describes data in another relational database or object store and wants it queried with data in Exasol, the agent SHALL propose a virtual schema before any import, SHALL name the adapter from the catalog, and SHALL only choose import-and-join when the user wants a snapshot, the source is a local file or attachment, or the user declines installing prerequisites.

#### Scenario: Postgres and local
- **WHEN** the user says "my orders are in Postgres, customers are here — show revenue by city"
- **THEN** the agent proposes attaching Postgres as a virtual schema (naming the PostgreSQL adapter), asks for what it does not know (host, database, credentials, the join key), and does not start an import

#### Scenario: a CSV attachment
- **WHEN** the user attaches a CSV and asks to join it with a local table
- **THEN** the agent imports the file and joins — a file is not a virtual schema source

### Requirement: The agent never says virtual schemas are unavailable locally
The agent SHALL NOT state that virtual schemas need a full Exasol, Community Edition or Docker; when prerequisites are missing it SHALL say which and offer Studio's install.

#### Scenario: prerequisites missing on Personal
- **WHEN** the target is the local Exasol Personal with no adapter installed
- **THEN** the agent says the adapter runtime is not installed yet and offers to install it through Studio, approval-gated

### Requirement: Honest naming of what was built
The agent SHALL call a virtual schema a live view and an import a snapshot with its freshness, and SHALL prove a new virtual schema with a real read before reporting it done.

#### Scenario: after creating a schema
- **WHEN** the agent has created a virtual schema
- **THEN** it reports the remote tables it listed and a sample it read, and describes the result as live
