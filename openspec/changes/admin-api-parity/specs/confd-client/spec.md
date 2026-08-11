## Purpose

Studio can authenticate against an Exasol cluster's administration API (ConfD, XML-RPC on port 20003) and execute administrative jobs on behalf of the user, per connection, without ever exposing admin credentials to the frontend after entry.

## ADDED Requirements

### Requirement: Admin API session per connection
Studio SHALL let the user connect a database connection to its cluster's Admin API by entering host (defaulting to the connection's host), port (defaulting to 20003), username, and password. A successful connect SHALL be verified by running a harmless job (`db_list`) before reporting success.

#### Scenario: Successful connect
- **WHEN** the user submits valid admin credentials for a reachable ConfD endpoint
- **THEN** Studio reports the Admin API as connected for that connection and native admin features become available

#### Scenario: Unreachable or unauthorized
- **WHEN** the endpoint is unreachable, the certificate handshake fails permanently, or credentials are rejected
- **THEN** Studio reports a human-readable failure and native admin features remain in their disconnected state; SQL features are unaffected

### Requirement: Credentials never reach the frontend
Admin credentials SHALL be held only in backend memory for the app session. The backend SHALL never return the password in any response, event, or log. Credentials are not persisted in v1; closing the app forgets them.

#### Scenario: Status query
- **WHEN** the frontend asks for Admin API status
- **THEN** the response contains only connected/disconnected, host, port, and username — never the password

### Requirement: Job execution with faithful errors
Studio SHALL execute ConfD jobs (`job_exec`) with typed parameters and return the job's result data structure. Job failures SHALL be surfaced with ConfD's own error text, never invented or silently swallowed.

#### Scenario: Job fails on the cluster
- **WHEN** a job returns an error (e.g., unknown volume)
- **THEN** the user sees ConfD's error message attributed to that job

### Requirement: Self-signed TLS tolerated, plaintext refused by default
Clusters commonly present self-signed certificates on the admin port; Studio SHALL accept them for the admin session. Studio SHALL NOT downgrade to unencrypted transport.

#### Scenario: Self-signed certificate
- **WHEN** the ConfD endpoint presents a self-signed certificate
- **THEN** the connection proceeds over TLS
