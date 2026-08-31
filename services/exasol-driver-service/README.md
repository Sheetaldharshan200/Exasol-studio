# Exasol Driver Service

This service is the proposed connectivity boundary between the desktop shell and Exasol.

## Strategy

The primary implementation path is a Rust-native Exasol driver service optimized for low-latency
query orchestration, cancellation, metadata streaming, and large result paging. The service should
own the Exasol protocol adapter, connection pool, result chunking, backpressure, and retry/error
mapping.

The preferred protocol direction is Exasol's WebSockets client-server API or a vetted Rust crate
wrapped behind the same internal contract. JDBC/ODBC should remain compatibility adapters only when
an enterprise feature is not yet covered by the Rust-native path.

## Responsibilities

- manage connections
- execute SQL and cancellations
- stream metadata and result chunks
- expose import/export and diagnostics helpers
- isolate driver and protocol failures from the desktop UI

## Notes

The implementation remains ADR-backed, but the product default is Rust-native connectivity. Keep
all UI and Tauri calls behind typed service contracts so the driver implementation can evolve
without coupling React to protocol details or secret handling.
