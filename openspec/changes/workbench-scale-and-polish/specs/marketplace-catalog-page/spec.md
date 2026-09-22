# Spec Delta

## Purpose
The Marketplace catalog is a page a person scans and acts on: uniform rows, one obvious action per item, filters that narrow instead of a grid that hides.

## ADDED Requirements

### Requirement: Uniform catalog rows
Every catalog item SHALL render as one `CatalogCard` row of fixed structure — logo, name, publisher/official badge, a description clamped to two lines, a meta line (version, last updated, downloads or stars when known), tags, and a single primary action with an overflow menu for the rest.

#### Scenario: Names and descriptions are never cut mid-word
- **WHEN** an item has a long name or description
- **THEN** the name is shown in full on one line (ellipsis only past the row width) and the description is clamped to two lines with an ellipsis

#### Scenario: One primary action per state
- **WHEN** an item's state is `install`, `update`, `drift`, `installed`, `running`, `onSystem` or `unavailable`
- **THEN** exactly one primary button is shown for it (Install / Update / Repair / Open / Stop / Use / none) and secondary actions live in the overflow menu

### Requirement: Page header and filter rail
The Marketplace page SHALL have a header with title, search and a live result count, and a left rail of checkbox filters (kind, official/labs, installed, update available, runtime) that narrow the rows.

#### Scenario: Filters compose
- **WHEN** "Installed" and "Update available" are both checked
- **THEN** only installed items with an available update are listed and the header count reflects the narrowed list

#### Scenario: No native selects
- **WHEN** the filter rail renders
- **THEN** it uses the app's checkbox and toggle controls, never a native `<select>`

### Requirement: The card has no state logic of its own
`CatalogCard` SHALL render from an `ItemState` produced by a pure `itemState()` function; the same function is the only input to the Updates tab and the update badge.

#### Scenario: Card and badge agree
- **WHEN** an addon's installed version is older than the catalog's latest
- **THEN** the card shows Update, the Updates tab lists it, and the badge counts it — all three from the same `ItemState`
