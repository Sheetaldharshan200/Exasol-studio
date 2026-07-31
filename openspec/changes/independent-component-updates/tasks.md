# Tasks

Legend: [ ] todo · [x] done. Phased so each slice ships + is Codex-reviewed.

## Slice 1 — Pure core (version compare + manifest)
- [ ] `components_update.rs`: `ComponentId` enum, per-component env/dir helpers,
      `installed.json` read/write, and a shared `is_newer` (move/reuse from
      updates.rs). Test: `components_update` tests — version compare edge cases
      (v-prefix, unequal segment counts, non-numeric tags), manifest round-trip.

## Slice 2 — Isolated env + independent update for the MCP server (first component)
- [ ] Give the MCP server its own venv under
      `personal-local/components/mcp-server/env`; install/run it from there
      (replace `venv_mcp_server` shared-venv path). Migrate existing installs.
- [ ] `update_component("mcp-server", version?)` + `revert_component`: install
      the chosen version into that env, write the manifest, keep the verified
      pin as the revert target. Best-effort, isolated.

## Slice 3 — Commands + UI ✅ DONE
- [x] Registered commands in `lib.rs`; `ipc.ts` bindings + `ComponentInfo` type
      (incl. `repo`); mock handlers.
- [x] Marketplace → Updates: `ManagedComponents` panel — per-component row
      (installed / verified / latest) with an **Update to X** button (calls
      `updateComponent` with the latest upstream tag from `marketRelease`) and
      **Revert** (to verified) when running on its own env. Only components
      wired for independent update (MCP server, this slice) show Update.

## Slice 4 — Extend to the other components

Decisions (user): **verify-or-refuse** for binaries — only SHA-pinned versions
are installed; unverified upstream is shown + linked, never silently downloaded.
Include the **DB engine** (stop→replace→restart) — but see the constraint below.

**Key constraint discovered:** binaries (ExaPump, DB engine) carry a Studio-
pinned SHA in the component lock, and that lock is **baked into the app**. So
under verify-or-refuse a binary can only advance when the lock advances — which
today means a Studio release. Truly *independent* binary/DB updates therefore
require the lock itself to update independently.

- [x] Updates panel is honest for ALL components now: MCP (pip, uv-hash-safe)
      gets a one-click Update; binary components show the newer upstream version
      with a "view release" link (no unverified download) or "up to date".
- [ ] **Remote verified lock (the real production mechanism).** Fetch a signed/
      trusted `runtime-components.lock.json` from a known URL and prefer it over
      the app-baked one when newer + valid. This is what makes verify-or-refuse
      binary/DB updates genuinely independent of app releases (new SHAs arrive
      without a full Studio update). Needs a hosted manifest + signature check.
- [ ] ExaPump: verify-or-refuse install of a lock-verified version into its own
      env (SHA-checked via obtain_artifact), run-from-own, revert. Useful once
      the remote lock can advance its verified version.
- [ ] Exasol Personal (DB engine): stop → replace verified binary → restart →
      verify orchestration, gated by lifecycle-idle. Build on top of the remote
      lock so there's a verified newer version to apply.
- [ ] Semantic Views: independent reinstall of a verified revision (DB-side).
- [ ] pyexasol stays a dependency inside the consuming env(s) (not standalone).

## Cross-cutting
- [ ] Keep it opt-in/manual (no auto-update). Notification deep-links to Updates.
- [ ] Codex-review each slice; cargo test + tsc + vite build green before commit.
