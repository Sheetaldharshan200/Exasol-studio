# Platform & Drivers Spec — Personal 2.3, Podman, and every listed driver

Status: IN PROGRESS — A1, A2 and B4 landed 2026-09-14 (the three items that
fixed active wrongness); everything else is still open.
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
| Driver matrix | 11 drivers listed in the Marketplace catalog; **3 runtimes actually execute** (native sqlx, JVM/JDBC, ODBC) — Python covers pyexasol | `catalog-data.ts` (11 `kind: "driver"` entries) vs `driver_exec.rs` bridge `main()`: `jdbc` → `run_jdbc`, `odbc` → `run_odbc`, **everything else → `run_pyexasol`** |
| TS / Go / R / ADO.NET | Declared in `driver_runtime()` as `node`/`go`/`r`/`dotnet`, but no bridge implements them — selecting one **silently runs pyexasol instead** | `driver_exec.rs:27-41` vs the bridge's `else: run_pyexasol(req)` |
| Local database (macOS) | Exasol Personal, managed by Studio | `local_runtime.rs`, `local_database.rs` |
| Local database (Linux/Windows) | **Not supported** — hard macOS gate; the fallback is a Docker container | `local_runtime.rs:1364` "only available on macOS"; `community_db.rs` (`exasol/docker-db`, `docker`, `colima start`) |
| Personal version | Pinned `v2.2.0`, **macOS artifacts only** | `resources/runtime-components.lock.json` → `macos-aarch64`, `macos-x86_64` |
| Virtual Schemas | UI exists (`NewVirtualSchema.tsx`); upstream only enabled them on LOCAL deployments in 2.3 | release notes 2.3.0 "Enabled Virtual Schema support in local deployments" |
| UDFs / SLC | UDF *builder* exists (`UdfBuilder.tsx`); **no script-language-container lifecycle at all** | no `exasol slc` call anywhere in the repo |

The one-line summary: the Marketplace advertises drivers Studio cannot run,
and the local runtime is macOS-only on a container engine upstream has moved
away from.

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
   *say* it is SQLAlchemy and use the dialect. `websocket-api` and
   `exarrow-rs` map to `native` today: confirm that is intended (the native
   driver IS the websocket protocol) and document it, or split them.

### Tasks
- [x] A1 `driver_implemented()` + refusal in `execute_via_driver`; no silent fallback (tested)
- [x] A2 `driver_status` now derives `supported`/`hint` from the SAME authority, so the picker can never offer what execution refuses (the UI already consumes both)
- [ ] A3 TS driver executes through the agent-core sidecar (no new runtime)
- [ ] A4 Go bridge + runtime detection + Marketplace install path
- [ ] A5 R bridge (`r-exasol`) + runtime detection
- [ ] A6 ADO.NET bridge (`dotnet`) + runtime detection
- [ ] A7 SQLAlchemy uses the dialect, not raw pyexasol
- [ ] A8 Decide + document `websocket-api` / `exarrow-rs` mapping
- [ ] A9 One integration case per working driver: connect → `SELECT 1` → a real result set

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
- [ ] B1 Add Linux/Windows artifacts to the verified lock (+ digests)
- [ ] B2 `local_runtime_supported()` capability fn (pure + tests: macOS any, Linux any, Windows x86_64 only)
- [ ] B3 Remove the 6 hard `OS == "macos"` gates; route through B2
- [x] B4 `--auto-approve` on every non-interactive install/start, gated by a `--help` capability probe so the pinned 2.2 launcher (which has no such flag) still works (tested)
- [ ] B5 Windows path/quoting + `.zip` extraction for the launcher archive
- [ ] B6 Surface Podman install progress + admin-approval hint (Windows)
- [ ] B7 Retire Community-Docker: delete probes/commands/UI, migration note
- [ ] B8 Marketplace + onboarding copy: "Docker" → nothing (the launcher manages Podman)
- [ ] B9 `docs/` + README: local database on macOS/Linux/Windows, Windows arm64 excluded

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

1. **Pin an RC?** 2.3.0 is still a release candidate (rc3, 2026-09-14); the
   current verified pin is 2.2.0. Recommendation: **do not move the verified
   pin to an RC.** Add 2.3.0-rc3 as an opt-in channel so this work can be
   built and tested now, and flip the pin when 2.3.0 ships final.
2. **Retire Community-Docker (B7) or keep it as a fallback?** Recommendation:
   retire it once B1–B6 land — it exists only because Personal was macOS-only,
   and keeping a second engine keeps the Docker probe the user wants gone.
3. **Driver depth (A4–A6).** Go/R/.NET each need a real bridge + toolchain
   detection. Recommendation: ship A1–A3 first (honest gate + the TS driver we
   can support for free), then add runtimes by demand.

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
