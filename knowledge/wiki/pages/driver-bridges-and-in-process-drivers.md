---
title: Driver bridges and in-process drivers
category: architecture
updated: 2026-09-15
---

# Driver bridges and in-process drivers

How Exasol Studio runs a query through a driver **other** than the native
`sqlx-exasol` path, and what it refuses to do.

## The rule that shapes all of it

A driver Studio offers either really executes through that driver, or is
refused by name. There is no third outcome. `driver_implemented()` in
`driver_exec.rs` is the single authority: `driver_status` (what the picker
shows) and `execute_via_driver` (what actually runs) both read it, so the UI
can never offer something execution will refuse — or, worse, quietly
substitute. The original bug was exactly that: every unimplemented id fell
through to `run_pyexasol`, so picking "Exasol TS driver" silently opened a
pyexasol connection.

## Two shapes

**In-process** — compiled into Studio, nothing to install:

- `sqlx-exasol` / `websocket-api` — the native path. `websocket-api` is an
  alias, not a substitution: the native driver *is* the Exasol WebSocket
  protocol.
- `exarrow-rs` — `exarrow_exec.rs`. A genuinely different driver (Apache Arrow
  batches), so it got its own path rather than the alias.

**Bridge process** — one JSON request on stdin, one JSON response on stdout.
`driver_exec.rs::execute_bridge` spawns it; the bridges live together in
`packages/driver-bridges/`:

| runtime | bridge | ships with the app? |
|---|---|---|
| python (pyexasol, sqlalchemy), jvm (jdbc), odbc | `python/bridge.py` | needs the managed venv |
| node (ts-js) | `agent-core/src/driver-bridge.ts` → `driver-bridge.cjs` | yes (bundled Node + bundled driver) |
| go | `go/main.go` → prebuilt `exasol-bridge-go` | yes (bundle resource) |
| r | `r/bridge.R` | script yes, R itself no |

## Gotchas that cost real time

**`expectRows` — one classifier, every driver.** Bridges are told which
statements return rows (`driver_exec.rs::expect_rows` →
`query.rs::is_result_set_statement`) instead of guessing or probing. Probing
would mean running a statement twice to find out, doubling its side effects —
the same defect class as the EXECUTE SCRIPT double-run. The coupling is the
feature: teach the classifier a new output-producing keyword and every driver
learns it at once. The one failure mode is shared too — a statement the
classifier calls DML runs once but its rows are discarded and reported as a
row count, on the native path and every bridge alike.

**Two rustls crypto providers in one binary.** exarrow pulls in `aws-lc-rs`
while sqlx uses `ring`. With both compiled in, rustls' automatic
process-level lookup (`ClientConfig::builder()`, which exarrow uses) **panics**
instead of choosing. `exarrow_exec::install_crypto_provider()` installs one at
startup — **ring**, deliberately: sqlx names ring explicitly and reqwest
consults the process default *before* falling back to ring, so installing
aws-lc-rs would silently move the updater and Marketplace downloads onto a
different TLS stack. Installing ring changes nothing that already worked.

**A bundle resource that is gitignored breaks CI.** `tauri-build` validates
every declared resource path, so declaring `resources/exasol-bridge-go` while
ignoring the built binary made a fresh checkout fail before compiling. The fix
is to declare the **directory** (`resources/bridges`, with a committed
`.gitkeep`) and ignore only its contents. Declaring a directory also solves
Windows: each platform's build drops its own filename (`…-go.exe`) into it.
Release CI must actually build the binaries — a bundle step alone will not.

**exarrow materialises the whole result set.** exarrow 0.16 exposes no public
async pagination (`ResultSet::fetch_all` is the only way to read a stream;
`next_batch` calls `block_on` and is unusable from async code), so the full
result is in memory before Studio truncates to `max_rows`. The native driver
streams and stops at the limit, so it stays the default for browsing.

**The Go driver loses affected-row counts through `Query`.** `db.Query` works
for DDL/DML too and returns zero columns, but the affected count is gone — an
INSERT of 3 rows reports 0. Hence `Exec` for non-row statements, and hence
`expectRows`.

## What cannot be made native, and why

- **R** — a large runtime that hard-codes its install paths, and the official
  `exasol` package compiles from source against the Exasol ODBC driver
  (`RODBC` is a hard dependency). Detect it, install the package into
  Studio's own R library, refuse clearly when absent.
- **ADO.NET** — Exasol publishes it **only** as a Windows `.msi`
  (`x-up.s3.amazonaws.com/7.x/packages.json` lists `operatingSystems:
  [Windows]`, noarch) and there is no NuGet package (nuget.org: 0 hits for
  "exasol"). It stays refused, with that as the stated reason rather than an
  implied backlog item.

See also: [[codex-review-findings]], `docs/platform-drivers-spec.md`.
