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
- [ ] ExaPump + Exasol Personal (binary version bump as an independent action).
- [ ] Semantic Views (revision bump, DB-side) as an independent update.
- [ ] Confirm pyexasol stays a dependency inside the consuming env(s).

## Cross-cutting
- [ ] Keep it opt-in/manual (no auto-update). Notification deep-links to Updates.
- [ ] Codex-review each slice; cargo test + tsc + vite build green before commit.
