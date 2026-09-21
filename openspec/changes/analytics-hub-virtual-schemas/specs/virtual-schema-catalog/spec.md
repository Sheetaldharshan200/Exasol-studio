# Spec Delta

## Purpose
The authoritative catalog of Exasol virtual schema adapters — every adapter Exasol publishes, each with what is needed to install it, connect through it, and prove a schema created with it works — read by both the app and the agent.

## ADDED Requirements

### Requirement: Every published adapter is in the catalog, once, in its own file
The catalog SHALL contain one entry per virtual schema adapter published under `github.com/exasol` that is not archived, each defined in its own file, with a unique identifier.

#### Scenario: upstream adapter list matches the catalog
- **WHEN** the catalog is compared with the non-archived `*-virtual-schema` repositories of the `exasol` GitHub organisation
- **THEN** every repository has exactly one catalog entry and every entry names a repository that exists

#### Scenario: archived adapters are excluded
- **WHEN** an adapter repository is archived upstream (for example the MongoDB adapter)
- **THEN** it has no catalog entry and the flow never offers it

### Requirement: An entry carries what the flow needs, and nothing that must be guessed
Each entry SHALL state its kind (JDBC, document, or Exasol-to-Exasol), the fields a user must supply to connect, how those fields become a connection string and virtual schema properties, where its adapter artifact is published, how its driver is obtained (automatic coordinates or an explicit "supplied by the user" marker with the vendor page), documentation, and how a newly created schema is proved.

#### Scenario: a JDBC adapter states its driver source
- **WHEN** an entry is of kind JDBC
- **THEN** it either names Maven coordinates the app can fetch or marks the driver as user-supplied with a link — never neither

#### Scenario: the agent can read one adapter's contract
- **WHEN** the agent is asked to attach a specific source
- **THEN** it can read that adapter's file alone and learn the fields, connection string shape and proof step without reading the rest of the catalog

### Requirement: The catalog is the single source for the app and the agent
The add-data-source flow, the visualizer, the database dropdown and the agent skill SHALL all derive adapter knowledge from the catalog; no surface keeps a private list.

#### Scenario: an adapter is added
- **WHEN** a new adapter file is added to the catalog
- **THEN** it appears in the flow's source picker, and the agent skill's guidance covers it, with no other code change
