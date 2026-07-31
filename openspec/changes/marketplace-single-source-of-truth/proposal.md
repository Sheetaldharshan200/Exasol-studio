# Proposal — Marketplace: one source of truth for install state & versions

## Why
The Marketplace shows **mismatched** install/version state because a single item's
truth is assembled from THREE independent sources that can disagree:

1. **`market_detect`** (Rust) — per-item *presence heuristics* (file exists, image
   inspect, python import).
2. **`market_installed`** (Rust) — a *marketplace manifest* written only by the
   marketplace install flow (`marketInstallRun`).
3. **`list_components`** (Rust, verified lock + per-component manifests) — the
   *authoritative* installed/verified version for the four MANAGED components
   (Exasol Personal, ExaPump, MCP Server, Semantic Views).

For the managed components these overlap and drift apart: e.g. updating the MCP
server via **Managed Components** writes the component manifest (installed 2.0.0)
but NOT the marketplace manifest, so the **catalog card** still shows the old /
blank version and a wrong "up to date". Detection can likewise disagree
("on system" vs "installed"). ai-lab is detected by image-inspect yet reads as
not-installed because it has no marketplace manifest entry. The user's summary:
"so much difference from installed version… maintain a single source of truth…
proper CRUD."

## What
1. **One resolver per item.** A catalog item that maps to a managed component
   (`exasol-personal→personal`, `exapump`, `mcp-server`, `semantic-views`) takes
   its **installed flag + version + update state from `list_components`** — the
   authoritative source — never from `market_installed`/`market_detect`.
   Non-managed items (pyexasol, ai-lab, drivers, superset, …) keep their
   presence heuristics, which is their only source (no conflict), but "detected
   on system" is shown as an installed state with a real label, not a silent gap.
2. **Consistent version everywhere.** The catalog card, the Updates section, and
   the Managed Components panel all read the SAME numbers for the four managed
   components (from `list_components`). "latest" stays Studio-side (catalog.json),
   already fixed.
3. **CRUD parity.** Install / update / revert / (DB) back up for managed
   components go through the component commands (`update_component`,
   `revert_component`, …) and immediately re-read `list_components`, so the card
   reflects the change with no stale manifest.
4. **Clarify MCP scope (gateway vs component).** The catalog "Exasol MCP Server"
   is the external `exasol/mcp-server` binary component. The per-database
   `sql` / `text_to_sql` shown under AI clients are **Studio gateway services**
   (agent-core), not that component and not installed with the database — label
   them so the two stop being confused.

## Non-goals
- Not merging `market_detect`/`market_installed` into `list_components` for the
  *non-managed* catalog items — those aren't versioned components; heuristic
  presence is the correct model for them.
- Not changing the verified-lock / CI trust model (separate change).
- Not per-database MCP *component* installs — MCP exposure is per-database on the
  gateway (a capability toggle), distinct from installing the MCP binary once.

## Outcome
Every managed component reads one number from one place; the catalog, Updates,
and Managed Components panels agree; detected-but-unmanaged items read honestly;
and the gateway services are no longer mistaken for an installed MCP component.
