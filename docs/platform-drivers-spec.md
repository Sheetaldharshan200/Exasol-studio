# Platform & Drivers Spec — Personal 2.3, Podman, and every listed driver

Status: IN PROGRESS — **workstreams A and B are complete** (A: every listed
driver runs through its own runtime or is refused by name; B: Exasol Personal
2.3.0 on Podman via the launcher on macOS, Linux and Windows, Docker retired —
landed 2026-09-14/21). Workstream C (Virtual Schemas, UDFs, SLC) continues in
`openspec/changes/analytics-hub-virtual-schemas`.
Assessed against the real code and the real upstream release notes.
Owner: Exasol Studio (`apps/desktop/src-tauri` + `apps/desktop/src`)
Scope: three workstreams that all change what Studio can honestly claim to
support — the driver matrix, the local-runtime container engine, and the
Exasol Personal 2.3 capabilities (Virtual Schemas, UDFs, script language
containers).

**Sources.** Everything in §0 was read out of this repo; everything about
2.3.0 comes from the upstream release notes for
[v2.3.0-rc2](https://github.com/exasol/exasol-personal/releases/tag/v2.3.0-rc2)
and [v2.3.0-rc3](https://github.com/exasol/exasol-personal/releases/tag/v2.3.0-rc3)
(rc3 published 2026-09-14) plus the published release assets. Nothing here is
inferred from the version number.

---

## 0. Honest current state

| Area | Today | Evidence |
|---|---|---|
| Driver matrix | **8 drivers execute** through their own runtime: native sqlx, exarrow (in-process), TS (bundled Node), Go (prebuilt bridge), pyexasol, SQLAlchemy, JDBC, ODBC. R is detected-not-bundled; ADO.NET is refused by platform | `driver_exec.rs::driver_implemented` is the single authority, read by BOTH `driver_status` and `execute_via_driver` (tested); bridges live in `packages/driver-bridges/` |
| TS / Go / R / ADO.NET | TS and Go ship with the app and run natively (both live-proven); R needs the user's R and refuses clearly without it; ADO.NET is refused with its real reason (Windows-only MSI) | `packages/driver-bridges/{go,r,python}`, `agent-core/src/driver-bridge.ts`, `exarrow_exec.rs` |
| Local database (all platforms) | Exasol Personal 2.3.0 through the official launcher (Podman), on macOS, Linux and Windows x86_64 — no other engine, no Docker anywhere | `local_runtime.rs` (platform-neutral; nano path deleted), `local_database.rs` |
| Personal version | Pinned `v2.3.0`, five artifacts (macOS arm64/x86_64, Linux x86_64/arm64, Windows x86_64), checksums from Exasol's published list | `resources/runtime-components.lock.json`; `.github/runtime-component-sources.json` |
| Virtual Schemas | Enabled locally by 2.3.0; Studio's per-adapter catalog (23 adapters, one file each) with tested DDL and prerequisite logic is in; the guided add-data-source flow and installer are in progress | `apps/desktop/src/features/connection/virtual-schemas/`; `openspec/changes/analytics-hub-virtual-schemas` |
| UDFs / SLC | UDF *builder* exists (`UdfBuilder.tsx`); **no script-language-container lifecycle at all** | no `exasol slc` call anywhere in the repo |

The one-line summary, as of 2026-09-21: every listed driver runs or is
refused by name; the local database is Exasol Personal 2.3.0 on every desktop
platform with no Docker left in the codebase; the analytics hub over virtual
schemas is the remaining work.

---

## 1. Workstream A — every listed driver actually works

### Gap
`driver_runtime()` maps ids to runtimes that the bridge never implements, and
the bridge's `else` branch runs **pyexasol**. A user who picks "Exasol TS
driver" on a connection gets a pyexasol connection and is told nothing. That
is not a missing feature, it is a wrong answer — the same class of defect as
the "0 rows affected" script bug.

### Target behavior
Every driver Studio offers either (a) really executes through its own runtime,
or (b) is refused with a specific, actionable reason. No third outcome.

### Design
1. **Honest gate first.** `driver_runtime()` gains a companion
   `driver_support(id) -> Supported | NeedsRuntime(&str) | Unsupported`, and
   the bridge refuses an unimplemented driver instead of falling through.
   Pure, unit-tested, and it fixes the wrong-answer bug on its own.
2. **TS driver via the sidecar we already ship.** `agent-core` is a Node
   process that already depends on `@exasol/exasol-driver-ts` and already
   exposes `DbRegistry`. The TS driver needs **no new runtime and no new
   bridge** — route `ts-js` statements to the sidecar's existing
   isolated-session path (`queryIsolated`/`executeIsolated`) over the
   authenticated localhost gateway.
3. **Runtime-bearing drivers (Go, R, ADO.NET).** These need a toolchain the
   app does not ship (like JDBC needs a JVM). Detect the runtime, offer the
   Marketplace install, and refuse clearly when absent. Execution goes through
   a per-runtime bridge script, same shape as the Python bridge.
4. **`sqlalchemy`, `websocket-api`, `exarrow-rs`.** `sqlalchemy` is a
   pyexasol-backed dialect — legitimately the Python bridge, but it must
   *say* it is SQLAlchemy and use the dialect. **Decided:** `websocket-api`
   stays an alias of the native driver (the native driver *is* the Exasol
   WebSocket protocol, so running it as sqlx is not a substitution);
   `exarrow-rs` is a genuinely different driver and got its own in-process
   path (`exarrow_exec.rs`) rather than the alias, because its whole point is
   returning Apache Arrow batches.

### Tasks
- [x] A1 `driver_implemented()` + refusal in `execute_via_driver`; no silent fallback (tested)
- [x] A2 `driver_status` now derives `supported`/`hint` from the SAME authority, so the picker can never offer what execution refuses (the UI already consumes both)
- [x] A3 TS driver runs on the BUNDLED Node runtime via `driver-bridge.cjs` (the driver is bundled into it) — live-proven against a real database: typed result sets, real affected-row counts, truncation, and real DB errors
- [x] A4 Go driver runs NATIVELY: a prebuilt `exasol-bridge-go` binary ships as an app resource (built by `scripts/build-driver-bridges.sh`, in release CI per target) — live-proven against a real database: typed result sets, exact DECIMALs, real NULLs, real DB errors, batch stops at the first failure
- [x] A5 R driver **runs, live-proven**: `bridge.R` on the official `exasol`
  package, with `Rscript` detection and a managed R library Studio builds the
  package into (the user's own library is never touched). R itself is NOT
  bundled and cannot be — it is a large runtime that hard-codes its install
  paths, and `exasol` compiles from source against the Exasol ODBC driver.
  Readiness separates what BLOCKS (R, the package) from what is merely worth
  saying (the managed ODBC library — `exasol` falls back to an OS-registered
  DSN, so refusing a user who has one would block a setup that works). Four
  bugs that only a live run exposed, all fixed: the package prints progress to
  **stdout** (which corrupted the JSON reply), the ODBC driver path belongs on
  `exa()` and was silently ignored on `dbConnect` (falling back to a
  system-registered DSN), `dbExecute`/`dbColumnInfo` are re-exported but
  unimplemented so every write would have failed, and r-exasol **cannot report
  affected rows at all** — `dbSendQuery` hardcodes `rowcount <- 0` for every
  non-SELECT, the profile it captures describes the COMMIT rather than the
  statement, and RODBC underneath returns no count either. Rather than say "0
  rows affected" for an INSERT that wrote three, the result carries a third
  kind, `executed`, and the UI says "Statement executed". A missing number is
  honest; a wrong one is the bug class this workstream exists to remove
- [x] A6 ADO.NET: **closed as not-possible-off-Windows, with the reason recorded.** Exasol publishes the ADO.NET provider only as a Windows `.msi` (the downloads index lists `operatingSystems: [Windows]`, noarch) and there is no NuGet package — verified against `https://x-up.s3.amazonaws.com/7.x/packages.json` and nuget.org (0 hits). `ado-net` therefore stays REFUSED, and the refusal now names the real reason instead of implying a backlog item
- [x] A7 SQLAlchemy runs through its own dialect (`exa+websocket`, AUTOCOMMIT, `exec_driver_sql`) in the managed venv, not raw pyexasol
- [x] A8 `websocket-api` documented as a native alias; `exarrow-rs` split out into its own in-process driver (`exarrow_exec.rs`, compiled in, zero install) with the Arrow→grid conversion unit-tested
- [x] A9 Live proof per driver, **automated and opt-in**. `tests/bridge_live.rs`
  spawns the Go, TS and R bridges exactly as `execute_bridge` does and asserts
  one shared contract: typed values, an exact DECIMAL, a real NULL, a failing
  statement that errors and stops the batch, and — the one only a real process
  can check — stdout being exactly one JSON document. exarrow, being
  in-process, keeps its own live tests in `exarrow_exec.rs`. All skip
  themselves when credentials or a runtime are absent, so the default suite
  stays hermetic. Run with
  `EXASOL_LIVE_PASSWORD=… cargo test --test bridge_live -- --ignored`

### Acceptance
Selecting any driver in the Drivers tab either runs a query through that
driver (provable: the bridge names it, and the result comes back) or refuses
with the runtime it needs and a one-click install. No driver silently
executes as another.

---

## 2. Workstream B — Podman everywhere, Docker retired

### What upstream actually changed (2.3.0)
- **Linux** local deployments: supported, **require `podman`**.
- **Windows amd64** local deployments: supported, run through **host Podman**
  in Podman's default machine; the launcher offers to install Podman via
  Windows Package Manager (may prompt for admin). `exasol shell host` /
  `shell container` unsupported on Windows; **Windows arm64 unsupported**.
- **macOS** local deployments now run **the same Podman installation inside a
  managed VM**; Nano data moved to host-visible deployment storage.
- Release assets exist for every target Studio needs: `Linux_arm64`,
  `Linux_x86_64`, `macOS_arm64`, `macOS_x86_64`, `Windows_x86_64`.

So the container engine is **Podman, installed and managed by the Exasol
Personal launcher** — Studio should not probe for a container engine at all.

### Target behavior
Studio manages one local database on all three desktop platforms, through the
Personal launcher. Studio never runs `docker`, never runs `colima`, and never
asks the user to install a container engine — the launcher owns that.

### Design
1. **Lock gains the missing platforms.** `runtime-components.lock.json` ships
   only macOS artifacts; add `linux-*` and `windows-x86_64` (verify-or-refuse
   digests as usual). `platform_key()` already produces the right keys.
2. **Drop the macOS gates** in `local_runtime.rs` (5 sites) and
   `local_database.rs`; replace with a **capability** check: supported =
   (macOS any arch) | (Linux any arch) | (Windows x86_64). Windows arm64 gets
   an explicit, honest "not supported by Exasol Personal" message.
3. **Retire `community_db.rs`.** Its only reason to exist was "no Personal on
   this OS". Recommended: delete the Docker/Colima path and migrate the
   Marketplace card to Personal-local; keep a read-only migration note for
   anyone with an existing `exasol/docker-db` container. *(Decision needed —
   see §5.)*
4. **Non-interactive is now a hard failure.** 2.3.0 makes local runtime host
   preparation **fail** when it cannot prompt — Studio always invokes the CLI
   non-interactively, so **every** `install`/`deploy`/`start` call must pass
   `--auto-approve` or local setup breaks outright on 2.3. rc3 makes
   `--auto-approve` global.
5. **Windows specifics.** Podman install may require admin approval; Podman's
   default machine is host-wide and shared, so Studio must never reconfigure
   or stop it. Surface "Podman is being installed — Windows may ask for
   administrator approval" rather than looking hung.

### Tasks
- [x] B1 Lock pinned to **v2.3.0** with all five artifacts (macOS arm64/x86_64, Linux x86_64/arm64, Windows x86_64), SHA-256 from Exasol's published checksums, `executableSha256` computed by the refresh script; the script's pre-refresh guard now accepts platforms newly added to the sources
- [x] B2 Not needed as a separate function: the launcher decides platform support and reports it; Studio's only check is "is the launcher present" (`runtime_installed`, `ensure_runtime`)
- [x] B3 All six `OS == "macos"` gates removed; `ensure_runtime`, `redeploy_managed`, `runtime_installed`, `restart_personal_runtime`, `control_runtime` and `expected_db_port` are platform-neutral. The entire nano/container path (`ensure_nano`, engine detection, container lifecycle — ~280 lines) is deleted; `local_runtime.rs` shrank from 1,607 to ~1,330 lines
- [x] B4 `--auto-approve` on every non-interactive install/start, gated by a `--help` capability probe so the pinned 2.2 launcher (which has no such flag) still works (tested)
- [x] B5 `unpack_launcher_archive` dispatches `.zip` (Windows) vs `.tar.gz`; `launcher_binary_name()` is `exasol.exe` on Windows and `managed_exasol` uses it; unit test `launcher_archives_are_recognised_by_name`
- [ ] B6 Surface Podman install progress + admin-approval hint (Windows) — the launcher's own output streams into the Local Exasol panel already; a Windows-specific hint waits for a Windows machine to verify the wording against what the launcher prints
- [x] B7 `community_db.rs` (424 lines), `CommunityDbActions.tsx`, the Community tile, `community-docker` install kind, the `community_*` IPC, the Docker/Colima probes, the engine badge, the AI Lab Docker-image install (AI Lab is now a reference item) and the `nano` lock component are all gone; the `exasol-community-upgrade` skill is deleted and the router/federation/ETL skills no longer point at a Docker ladder
- [x] B8 Every Studio-owned text, comment and prompt line that named Docker, Colima or Nano is rewritten; `grep -rni 'docker\|colima\|nano'` over Studio's own code returns nothing (upstream-vendored skills excluded)
- [x] B9 `docs/` updated here; the CI refresh workflow validates against an Exasol Personal deployment made by the launcher on the Linux runner instead of a nano container; `scripts/verify-virtual-schema-postgres.sh` runs PostgreSQL in Podman against the local Personal

### Acceptance
On a clean Linux box with no container engine, "Set up the local database"
installs Podman via the launcher and reaches a queryable database, with no
Docker prompt anywhere in the UI. Same on Windows x86_64. Windows arm64 says
exactly why it cannot.

---

## 3. Workstream C — 2.3 capabilities: Virtual Schemas, UDFs, SLC

### What upstream actually changed
- **Virtual Schemas** now work on local deployments *when the adapter runtime
  and dependencies are installed*; rc3 fixed them under SELinux enforcing.
  The setup guide now uses the deployment's **shared directory** on macOS (the
  old SSH paths are obsolete) and requires deployment selection + a PostgreSQL
  timezone step.
- **UDFs** are no longer listed as unavailable on local deployments.
- **SLC lifecycle**: `exasol slc install|update|remove|list`, plus
  `exasol slc custom install|update` (`--source` tarball or https URL,
  `--alias`, `--language` — any identifier now, not just Python/Java/R), plus
  a `rust` alias that resolves the latest `language-container-rs`. `slc list`
  shows custom containers with a status column; `--json` marks them `custom`
  with an `available` field. rc3: install/update also accept flavors.
  Installs restart the database (`--auto-approve`, `--no-restart`).

### Target behavior
Studio's existing Virtual Schema and UDF surfaces work against the managed
local database, and script language containers are a first-class managed
thing — installed, listed and removed from the UI, never hand-rolled SQL.

### Design
1. **SLC panel** over `exasol slc --json`: list (official + custom, with
   availability), install by alias/flavor, `rust` one-click, custom install
   from file or URL, remove. Every install restarts the database → reuse the
   managed-component restart UX (progress + "database restarting"), and pass
   `--auto-approve`; offer `--no-restart` as "activate on next start".
2. **Virtual Schemas on local**: drop any "cloud only" framing, wire the
   adapter-runtime prerequisite into the existing prerequisite machinery, and
   use the deployment's shared directory for adapter JARs on macOS (**not**
   SSH paths). Surface the PostgreSQL timezone step in the guided flow.
3. **UDFs on local**: the UDF builder needs a language container to exist —
   link it to the SLC panel when the requested language is not installed.

### Tasks
- [ ] C1 `exasol slc list --json` model + typed parse (pure + tests, incl. custom/available)
- [ ] C2 SLC panel: list / install alias+flavor / `rust` / custom (file|URL) / remove
- [ ] C3 Restart-aware install UX (`--auto-approve`, `--no-restart` option)
- [ ] C4 Virtual Schema local prerequisites + shared-directory adapter staging
- [ ] C5 Guided VS flow: deployment selection + PostgreSQL timezone step
- [ ] C6 UDF builder ↔ SLC: "language X needs container Y — install it"
- [ ] C7 Docs + skills: local VS/UDF/SLC are supported on 2.3

### Acceptance
On a local 2.3 deployment: `exasol slc install rust` equivalent works from the
UI and a Rust UDF runs; a PostgreSQL virtual schema is created through the
guided flow and queried; the UDF builder offers to install a missing language
container instead of failing at `CREATE SCRIPT`.

---

## 4. Breaking changes in 2.3 that hit Studio (must-handle)

| Upstream change | Impact on Studio | Handling |
|---|---|---|
| Host preparation **fails** when it cannot prompt | Every Studio-driven install/start is non-interactive → **local setup breaks on 2.3** | B4 (`--auto-approve` everywhere) — do first |
| Confirmation commands auto-proceed with no TTY (`destroy`, `remove`, slc restarts) | Studio's destroy/reset paths may now really destroy where they previously no-opped | Audit every launcher invocation; gate destructive ones behind Studio's own confirm |
| macOS deployments from an older launcher **rebuild their guest** on next `start` | One slow start; Studio's bootstrap has a **45s** readiness deadline → false failure | Detect the rebuild and extend/report the wait honestly |
| Local port published on `127.0.0.1` only | Fine for Studio (it connects locally); any "share this DB" copy is now wrong | Fix connection-string copy/help text |
| Port is selected + persisted per deployment; `config set --ports auto` | Studio already reads `deployment.json` `dbPort` — keep, and expose port change while stopped | Small UI follow-up |
| `exasol status` default `--timeout 5` | Status calls can return "unknown" faster than before | Treat timeout as "unknown", not "stopped" |

---

## 5. Decisions needed before implementation

1. ~~**Pin an RC?**~~ **Moot — 2.3.0 shipped final on 2026-09-21** and is the
   pin. No RC channel was ever needed.
2. ~~**Retire Community-Docker (B7) or keep it as a fallback?**~~ **Retired**
   (user decision, 2026-09-21): Personal on Podman via the launcher is the
   local database on every platform; Studio neither probes for nor mentions
   Docker anywhere.
3. **Driver depth (A4–A6).** ~~Open.~~ **Settled 2026-09-15.** Go is native (a
   prebuilt bridge binary in the bundle), R is detected-not-bundled (the
   official package compiles against the Exasol ODBC driver and R hard-codes
   its own install paths), and ADO.NET is closed as impossible off Windows —
   Exasol publishes it only as a Windows MSI. The remaining question is only
   whether to ship a **Windows-only** ADO.NET bridge; it needs a Windows
   machine with the provider MSI installed to build and verify, so it is not
   started until someone has one.

## 6. Sequencing

**A1 → B4 → B2/B3 → B1 → A3 → C1–C3 → rest.** A1 and B4 are the two that fix
active wrongness (a driver that lies; a launcher call that will start failing
on 2.3); everything else is additive.

## 7. Verification

Per workstream, in the repo's existing tiers: pure functions under
`node:test`/`cargo test`; launcher and bridge behavior through
`pnpm smoke:gateway`-style integration where a real local deployment exists;
and a manual matrix run on macOS arm64, Linux x86_64 and Windows x86_64 before
any of this is called done.
