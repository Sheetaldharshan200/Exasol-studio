---
title: Driver bridges and in-process drivers
category: architecture
updated: 2026-09-21
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

## How the bridges are proved

`apps/desktop/src-tauri/tests/bridge_live.rs` spawns each bridge exactly as
`execute_bridge` does and asserts **one shared contract**:

- typed values — an INTEGER stays a number, a scaled DECIMAL keeps its scale,
  a real NULL stays NULL;
- a failing statement is an error that **stops the batch**, never a silent
  zero-row success and never `[object Object]`;
- `truncated` is true only when a row was really dropped (exactly `max_rows`
  rows is a *complete* result — the off-by-one each bridge gets wrong
  separately);
- a **write round-trip** — create, insert, count — whose rows are still there
  afterwards. This is the only check that proves the driver *commits*: a bridge
  that opens a transaction and never commits looks perfectly healthy until the
  rows turn out not to be there. It is also the `expectRows = false` path;
- stdout is **exactly one JSON document**.

Run it with
`EXASOL_LIVE_PASSWORD=… cargo test --test bridge_live -- --ignored`.

Two rules keep it honest. No credentials means a live run was not asked for, so
it skips. Once credentials *are* given it stops being forgiving: a missing
artifact **this repo builds** (the Go binary, `driver-bridge.cjs`) fails with
the command that fixes it, because a test that reports success while testing
nothing is worse than no test. Only a runtime the user owns (R, node) may skip.

This tier exists because the *process contract* is where these bridges actually
break, and no unit test can see it. Every shipped bug lived there: a driver
rejecting with a plain object, a failed SELECT reported as a successful
zero-row result, and R printing progress to stdout.

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

## r-exasol: five traps, all invisible until it ran

1. **It prints to stdout.** `exa()` prints "EXASOL driver loaded", and
   `dbSendQuery` prints "Using temporary schema: TEMP_…_CREATED_BY_R". Studio
   parses stdout as one JSON document, so a single stray line breaks every
   query with "The driver returned no result". The bridge sinks R output to
   stderr on the first line and releases it only to emit the reply —
   *counting* active diversions, because `sink(NULL)` with nothing to remove is
   itself an error. `exa(silent = TRUE)` also suppresses the driver lines.
2. **The ODBC driver path belongs on the DRIVER, not the connection.**
   `exa(driver = "/path/libexaodbc-…dylib")`. Passing `driver=` to `dbConnect`
   is silently ignored and the package falls back to a system-registered
   `{EXASolution Driver}` DSN — the OS-level registration Studio manages its
   own driver to avoid needing.
3. **Half the DBI surface is re-exported but unimplemented.** `dbExecute`,
   `dbSendStatement` and `dbColumnInfo` all appear in the NAMESPACE yet have no
   method for `EXAConnection`/`EXAResult`. Every write would have failed. Use
   `dbSendQuery` for everything (it wraps RODBC's `sqlQuery`, which handles DDL
   and DML fine); infer column types from the R vector, and report an empty
   type for an all-NA column (which R types as `logical` whatever the database
   said) rather than claiming BOOLEAN.
4. **It cannot report affected rows — at all.** `dbSendQuery` hardcodes
   `rowcount <- 0` for every non-SELECT (`} else rowcount <- 0` in
   `EXADBI-query.R`), so `dbGetRowsAffected` always answers 0 for a write. The
   profile it captures describes the **COMMIT**, not the statement
   (`COMMAND_NAME = COMMIT`, `OBJECT_ROWS = NA`), and RODBC underneath returns
   `character(0)` from `sqlQuery` and `1` from `odbcQuery` — no count anywhere
   in the stack. See "An unknown count" below.
5. **It creates a temporary schema on the server.** `dbSendQuery` makes a
   `TEMP_…_CREATED_BY_R` schema for its high-speed transfer layer and drops it
   on disconnect. Expect it in the catalog during an R session.

Value fidelity: RODBC returns large DECIMALs as **character**, so a
`DECIMAL(36,18)` round-trips with all 36 digits; small ones arrive as doubles
and are sent as JSON numbers.

Building `r-exasol` from source needs a working C/C++ toolchain. On macOS a
conda-provided R fails with "C compiler cannot create executables" — the conda
clang wrapper cannot link. Pointing `R_MAKEVARS_USER` at a Makevars that sets
`CC`/`CXX`/`OBJC` to `/usr/bin/clang` fixes it (`ps`, pulled in by `remotes`,
compiles Objective-C, so `OBJC` matters too).

## An unknown count is a third kind, not a zero

`StatementResult.kind` is `resultSet` | `rowCount` | **`executed`**. The last
means *it ran, and this driver cannot say how many rows it touched* — only the
R bridge emits it, because only r-exasol has that limitation. The UI renders
"Statement executed" and prints no number.

Saying "0 rows affected" for an INSERT that wrote three is the same wrong
answer as the original silent-driver-substitution bug: the caller cannot tell
it apart from "nothing was written". A missing number is honest; a wrong one is
a defect. `kind` was already a free-form string passed straight through
`driver_exec.rs`, so adding a value cost no Rust type change — only the six UI
display sites learned it.

The live write round-trip accepts a real count **or** a declared unknown, and
still fails a claimed 0. The read-back that proves the write committed runs
either way, so R is held to the same standard as Go and TS on the thing that
matters.

## Readiness: what blocks versus what is worth saying

`r_missing()` returns only true **blockers** — R absent, or the `exasol`
package not built into Studio's library — each naming itself. The managed ODBC
library is deliberately *not* one: `exasol` falls back to an OS-registered DSN
when no path is given, so a user who already registered the driver has a
working setup, and refusing them would block something that works. That is
`r_advice()` instead: ready, with a note that installing Studio's own copy
removes the OS-level registration.

## What cannot be made native, and why

- **R** — a large runtime that hard-codes its install paths, and the official
  `exasol` package compiles from source against the Exasol ODBC driver
  (`RODBC` is a hard dependency). Detect it, build the package into Studio's
  own R library, and refuse with the specific missing piece.
- **ADO.NET** — Exasol publishes it **only** as a Windows `.msi`
  (`x-up.s3.amazonaws.com/7.x/packages.json` lists `operatingSystems:
  [Windows]`, noarch) and there is no NuGet package (nuget.org: 0 hits for
  "exasol"). It stays refused, with that as the stated reason rather than an
  implied backlog item.

See also: [[codex-review-findings]], `docs/platform-drivers-spec.md`.
