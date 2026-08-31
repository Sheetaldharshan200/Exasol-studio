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

## Orchestrator model (per user directive)
Studio is an **all-in-one management place / orchestrator**, not a coupled
bundle. Every managed component — and every FUTURE component — is an
independent unit with:
- its **own environment** (isolated venv/dir), and
- its **own Python version** where relevant. Components can require different,
  even conflicting interpreters (e.g. one needs Python < 3.12, another ≥ 3.12);
  each env is provisioned by `uv --python <that component's version>` (uv
  downloads the interpreter), so they coexist with nothing lost.

Concretely: each component carries its own descriptor (repo, version, python
version, install kind) and is added to a registry (`ComponentId` +
`component_python_version`) — adding a future component is a registry entry plus
its install recipe, never a change to how other components install.

**Interpreter reuse (decision).** Isolation is at the venv only; the Python
interpreter is REUSED, never duplicated. `uv --python <version>` resolves to
uv's single managed copy of that version — already present → reused, absent →
downloaded once and cached. So two components compatible with the same version
share one interpreter on disk (the venvs merely reference it; no `--copies`),
and uv hard-links cached wheels into each venv, so shared packages aren't
re-downloaded either. Same version ⇒ reuse, not fresh disk.

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
