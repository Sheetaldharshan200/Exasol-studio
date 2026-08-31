# ADR-0003: Driver Service Boundary for Exasol Connectivity

Status: Proposed

## Context

The product must support reliable query execution, cancellation, metadata loading, and large result handling. Direct database communication from the UI-facing host risks coupling performance-sensitive and failure-prone work too closely to the desktop shell.

## Decision

Introduce a dedicated Exasol connectivity boundary as a managed driver service owned by the application core. The preferred implementation is Rust-native, using Exasol's WebSockets API or a vetted Rust crate behind the same internal contract.

## Rationale

- isolates driver and protocol failures
- improves control over streaming and cancellation
- allows richer experimentation with transport and spooling strategies
- creates a cleaner seam for future testing and observability

## Trade-Offs

- increases operational and packaging complexity
- requires versioning of internal contracts

## Consequences

- the product must prototype and validate this boundary early
- the product default is Rust-native connectivity
- JDBC, ODBC, TypeScript-driver-backed, or mixed strategies may still be added as compatibility adapters behind the same contract
