# Proposal — Independent, isolated component updates

## Why
Today every managed component (Exasol Personal DB, ExaPump, MCP Server,
Semantic Views, the Python stack) is **coupled** to Studio's single "verified
component set": they share one managed Python venv and only change when a new
Studio app release re-pins the lock. The update watcher (`updates.rs`) can only
*notify* — it says "2.0.0 is out, it'll roll in with the next Studio update".
The user wants each component to be **updatable on its own, in its own
environment**, without waiting for a Studio release.

## What
1. **Isolated environment per component.** Each Python-based component gets its
   own virtualenv under `…/personal-local/components/<name>/env` instead of the
   shared venv, so updating (or breaking) one never affects the others. Binary
   components (DB, ExaPump) are already standalone per-version files; Semantic
   Views is DB-side (versioned by revision).
2. **Per-component install manifest.** Each component records its own installed
   version (`components/<name>/installed.json`) independent of the global lock.
3. **One-click independent update.** A `update_component(name, version?)` Rust
   command installs/upgrades just that component in its own env — no Studio
   release, no touching other components. The Marketplace → Updates section
   shows each component's installed vs. available version with an **Update**
   button (fed by the existing `updates.rs` watcher).
4. **Verified baseline + revert.** Studio's pinned version stays the known-good
   default; a component can be updated to a newer upstream release, and a
   **Revert to verified** action restores the pinned one if an update misbehaves.

## Non-goals
- **Auto-update.** Updates are one-click/manual by the user's choice — nothing
  upgrades in the background.
- **Changing how the database engine is deployed** (nano/personal binary) — that
  stays as-is; only its version bump becomes an independent action.
- **Per-env for pure libraries** where it's meaningless: `pyexasol` is a library
  dependency of the components that need it, not a standalone updatable tool, so
  it lives inside the env(s) that consume it rather than getting its own.

## Files touched (est.)
- `src-tauri/src/local_database.rs` (~150) — per-component env dirs + manifests,
  move MCP server to its own venv, wiring to run each from its own env.
- `src-tauri/src/components_update.rs` (new, ~180) — `install_component` /
  `update_component` / `revert_component` + manifest read/write.
- `src-tauri/src/updates.rs` (~20) — surface available-per-component for the UI.
- `src-tauri/src/lib.rs` (~5) — register the new commands.
- `apps/desktop/src/lib/ipc.ts` (~20) — command bindings + types.
- `apps/desktop/src/features/marketplace/Marketplace.tsx` (~120) — Updates
  section: per-component installed/available + Update / Revert.

Tests: `components_update` manifest + version-compare logic (pure) in Rust
`#[cfg(test)]`; extend `updates.rs` `is_newer` tests.
