# Rust Crates

These crates should keep backend responsibilities modular and testable.

## Planned Crates

- `app-core`: orchestration entry point
- `exasol-driver`: Rust-native Exasol protocol adapter, connection pool, query execution, cancellation, and metadata streaming
- `workspace-store`: local persisted workspace state
- `safety-engine`: risk classification and approval logic
- `result-spool`: large result buffering and paging
- `plugin-host`: internal extension runtime and permissions
- `diagnostics`: logging, metrics, and support bundle utilities

Keep cross-crate contracts explicit and prefer shared types over hidden coupling.
