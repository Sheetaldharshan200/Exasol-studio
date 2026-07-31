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
- [x] **Remote verified lock (the real production mechanism) — app side.**
      `verified_lock.rs`: fetch the signed lock + detached ed25519 signature from
      a configurable URL, verify against an embedded public key, accept only when
      valid + newer + same schema, cache it, and prefer it over the baked lock
      (resolved once at startup via `component_lock::init_effective`; background
      refresh applies on next launch). Safe by default: the shipped public key is
      EMPTY, so nothing fetched is ever trusted until ops sets the real key.
      Tests cover verify/tamper/wrong-key/short-sig and date comparison.
      **Ops to enable:** generate an ed25519 keypair, set
      `VERIFIED_LOCK_PUBKEY_HEX` + `VERIFIED_LOCK_URL`, host
      `runtime-components.lock.json` + `.sig` (base64 of the 64-byte signature).
- [x] ExaPump: verify-or-refuse install of the lock-verified artifact into its
      own dir (SHA-checked via obtain_artifact), run-from-own (exapump_path
      prefers it, manifest-gated), revert to shared. UI offers "Update to
      <verified>" when verified is ahead of installed; newer upstream is a link.
- [x] Semantic Views: independent reconcile to the verified revision (DB-side,
      opaque-version compare); "Update" reruns the installer, "not installed"
      when its marker is absent (install from its own card).
- [x] Exasol Personal (DB engine): update the ENGINE ONLY, never the data.
      Shipped as **backup action + dormant orchestration** (user choice):
      - `backup_local_database` command + Marketplace "Back up" button on the
        Personal row: cold, consistent copy (stop → copy the whole deployment
        dir to `personal-local/backups/deployment-<ms>` via a `.partial` temp +
        atomic rename → restart). Safe, testable, useful on its own.
      - `update_personal_engine` (local_runtime.rs): back up first → preserve the
        old engine binary (`.prev`) + version marker → stop → install the newer
        VERIFIED engine → start + verify (`info`); on ANY failure restore the old
        binary + marker + data (from the backup) + restart. Never a force update.
      - DORMANT today: `update_component(Personal)` returns "nothing to update"
        unless `is_newer(verified, installed)`, so it never stops/touches the
        running DB while verified == installed. The Update button only appears
        once the remote verified lock advances the engine to a data-compatible
        version (an ops decision). Gated by `ensure_lifecycle_idle`.
      - Known limitation (documented in code): the cross-version swap path has
        not been exercised against a real newer engine (none exists yet); a
        rolled-back update can retry on next start because the lock still pins
        the newer version. Revisit when a newer verified engine ships.
- [x] pyexasol stays a dependency inside the consuming env(s) (not standalone).

## Cross-cutting
- [ ] Keep it opt-in/manual (no auto-update). Notification deep-links to Updates.
- [ ] Codex-review each slice; cargo test + tsc + vite build green before commit.
