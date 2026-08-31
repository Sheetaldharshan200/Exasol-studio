# Local runtime & credentials — edge cases and how Studio handles them

The local Exasol Personal database is Studio-managed but lives on the user's
machine, so anything can happen to it out-of-band. This is the authoritative
list of the failure modes we know about and the behavior Studio implements
for each.

## Credential drift

| # | Edge case | Handling |
|---|-----------|----------|
| 1 | **SYS password changed via SQL** (`ALTER USER SYS …` from any client) — `secrets.json` is now stale | On the next bootstrap/readiness probe, auth fails while the port is open → Studio runs the **recovery ladder**: try the session master password; on success re-align `secrets.json` + the vault profile (`recover_personal_auth`). Otherwise it fails with an actionable message telling the user exactly what to run. |
| 2 | **Password changed via the `exasol` CLI** against Studio's deployment dir | The CLI rewrites `secrets.json`, which Studio re-reads on every bootstrap (`read_personal_connection`) — picked up automatically, profile refreshed via `ensure_personal_local_profile`. |
| 3 | **Master password set/changed while the DB is running** | `remember_master` syncs immediately in a background thread (ALTER USER → `secrets.json` → vault profile). |
| 4 | **Master password set/changed while the DB is stopped** | Sync is skipped (the DB must be up to ALTER); the next bootstrap applies it (`run_bootstrap` master-sync step). |
| 5 | **Vault locked during bootstrap** | No master password in memory → DB keeps its current credential; sync happens on the next unlock (`vault_unlock` calls `remember_master`). |
| 6 | **Vault reset via recovery code** | `vault_recover` treats the new password like a change (case 3/4). |
| 7 | **Master password works but differs from `secrets.json`** (earlier sync half-finished) | The recovery ladder probe catches it and re-persists both stores idempotently. |
| 8 | **`secrets.json` deleted or corrupted** | `read_personal_connection` errors with "no dbPassword" → bootstrap reports failed with that message; re-running `exasol install local` (or destroy + Studio reinstall) regenerates it. Studio never guesses a credential. |
| 9 | **Master password contains `"`** | Escaped by doubling inside the ALTER statement (`sync_master_password`); no charset restriction is imposed on the master password. |

## Runtime lifecycle

| # | Edge case | Handling |
|---|-----------|----------|
| 10 | **Deployment destroyed outside Studio** (`exasol uninstall`, deleted dir) | `deployment.json` gone → `personal_deployment_exists` false → bootstrap reinstalls from scratch. Studio's deployment is isolated in app-data, so destroying the *shared* `~/.exasol` deployment never affects Studio (and vice versa). |
| 11 | **Port 8565 occupied by a foreign process** | Fresh install refuses with "port already in use and not the managed deployment" instead of connecting to an unknown server. |
| 12 | **DB up but not query-ready** (boot race) | `validate_pyexasol_connection` retries for 60 s before the restart path. |
| 13 | **Stale/tampered launcher binary** | `ensure_personal_launcher` verifies the executable's sha256 against the component lock on every use; mismatch → reinstall from bundle/download. |
| 14 | **Prebundled artifact tampered/corrupt** | `bundled_artifact` verifies sha256 before using it; mismatch silently falls back to the verified download. |
| 15 | **Machine restart** (installed but stopped) | `personal_local_bootstrap` detects installed-but-stopped and starts without reinstalling. |

## Components & updates

| # | Edge case | Handling |
|---|-----------|----------|
| 16 | **Official upstream releases a newer component** (Personal, ExaPump, MCP server) | The update watcher (`updates.rs`) checks GitHub releases every 6 h and pushes an in-app notification. Nothing auto-updates: installs stay pinned to the verified lock until a Studio release moves the pins — reproducibility over freshness. |
| 17 | **Component compatibility / dependency bleed** | Isolation by construction: `exasol` and `exapump` are standalone binaries; PyExasol + MCP server live in ONE hash-locked venv (they are version-locked as a tested pair); every marketplace Python item gets its **own** uv venv (`marketplace/<id>/venv`); uv tools are isolated by uv itself. No component can break another's dependencies. |
| 18 | **Semantic Views** | Opt-in from the Marketplace (never part of default setup). Existing installs keep reporting ready via the revision marker; the installer refuses to touch user-owned SALES/MART objects (probe exit 4). |

Any new edge case discovered in the field gets a row here plus a handler —
this file is the checklist for regression coverage.
