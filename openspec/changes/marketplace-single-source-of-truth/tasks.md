# Tasks

Legend: [ ] todo · [x] done.

## Slice 1 — Managed components: one source of truth (done)
- [x] `CATALOG_TO_COMPONENT` map (exasol-personal→personal, exapump, mcp-server,
      semantic-views). Marketplace fetches `list_components` (essential refresh +
      after every install/update/revert via `refreshInstalled`).
- [x] `installedMap` overlays managed components from `list_components` — real
      installed version overrides any stale marketplace manifest; not-installed
      (e.g. Semantic Views) clears the entry. Card version + installed badge now
      match the Managed Components panel exactly.
- [x] Managed components are excluded from the catalog's own update surfaces
      (`updatesAvailable`, the "updates" filter, the card Update button) — they
      update in the Managed Components panel (verify-or-refuse), no conflicting
      `marketInstallRun` path and no double-listing.

## Slice 2 — Follow-ups
- [ ] Catalog `latest` for managed components should derive from the VALIDATED
      lock, not raw upstream tags (shared with the CI item in
      independent-component-updates → the `update-catalog.yml` change).
- [ ] Label the AI-clients per-database `sql` / `text_to_sql` as **Studio gateway
      services** (agent-core), distinct from the installed "Exasol MCP Server"
      component, so the two are no longer conflated.
- [ ] Non-managed detected items (ai-lab, pyexasol, …): show "on system" as a
      first-class installed state with a clear label (heuristic remains their
      only source; no version manifest expected).

## Cross-cutting
- [ ] Codex-review; tsc + cargo + vite build green before commit.
