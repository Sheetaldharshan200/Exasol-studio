# Spec Delta

## Purpose
Installed, available and "what should I do" for every component and addon come from one place and refresh together, and the user can see when they were last checked.

## ADDED Requirements

### Requirement: Single update decision
A pure `itemState(item, sources)` in `marketplace/item-state.ts` SHALL return the item's state (`kind`, installed version, available version, reason) and SHALL be the only derivation used by the card, the Updates tab and the badge.

#### Scenario: Managed component with a newer upstream tag
- **WHEN** `list_components` reports `installed 2.2.0` and the upstream tag is `2.3.0`
- **THEN** `itemState` returns `{kind: "update", installed: "2.2.0", available: "2.3.0"}`

#### Scenario: Equal or older upstream is not an update
- **WHEN** the installed version equals or exceeds the available one, or either is non-numeric
- **THEN** the kind is `installed` (or `drift` only for opaque-version components whose installed hash differs from the verified one)

#### Scenario: Not installed
- **WHEN** an item is neither installed nor detected on the system
- **THEN** the kind is `install`, or `unavailable` when it is a binary with no build for this host

### Requirement: One refresh, one timestamp
The Marketplace SHALL expose a single `refreshAll()` that refetches installed items, managed components, the catalog and upstream tags together, records `checkedAt`, and SHALL show "Checked <relative time>" in the page header and the Updates tab.

#### Scenario: Refresh updates every surface
- **WHEN** the user clicks Refresh in the Updates tab
- **THEN** the cards, the Updates list and the badge change in the same render cycle and the stamp reads "Checked just now"

#### Scenario: No background polling
- **WHEN** the Marketplace is open and idle
- **THEN** no version request is made until the user opens a tab or clicks Refresh

### Requirement: Update all
The Updates tab SHALL offer "Update all" that runs the same per-item update path for every item whose kind is `update` or `drift`, in sequence, reporting each result.

#### Scenario: One failure does not stop the rest
- **WHEN** the second of three updates fails
- **THEN** the third still runs and the summary names the failed item with its error
