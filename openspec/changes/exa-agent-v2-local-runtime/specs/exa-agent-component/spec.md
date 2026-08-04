## Purpose

The Exa agent engine is a Marketplace component with its own release cadence: it appears in the catalog, installs/updates through the same Managed Components + Updates flow as every other component, and its updates ship as independent releases — while Studio's own overlay (MCP tools, agent profiles, rebrand config) stays separate so a component update never clashes with our edits.

## ADDED Requirements

### Requirement: Exa agent is a versioned Marketplace component
The Exa agent engine SHALL appear in `marketplace/catalog.json` as its own item with a version, mirror tag, and homepage, and SHALL record its installed version in its own `installed.json` manifest under its own component directory (the `ComponentId` pattern), so it installs, updates, and rolls back independently of other components and of the app.

#### Scenario: Update offered
- **WHEN** a newer engine release is published and mirrored
- **THEN** the Updates tab shows Exa agent as actionable with its current → latest versions, and updating it touches ONLY the engine component — no other component and no app files change

#### Scenario: Up to date
- **WHEN** the installed engine version equals the catalog latest
- **THEN** Exa agent does not appear in the Updates tab's actionable list (consistent with the hide-up-to-date rule)

### Requirement: Vendor binary and Studio overlay are separate layers
The vendored upstream engine binary (versioned by the component release) SHALL live in the component's own directory; Studio's overlay — MCP tool wiring, the DB-scoped agent profile, provider ranking, rebrand strings — SHALL live in app-owned config that is NOT overwritten by a component update. A component update SHALL replace only the engine payload.

#### Scenario: Update preserves our edits
- **WHEN** the engine component is updated to a new version
- **THEN** the DB-scoped profile, MCP tool registration, provider ranking, and rebrand config are unchanged, and the new binary runs under the same overlay

#### Scenario: Independent release cadence
- **WHEN** the app ships a new release without an engine bump, or the engine bumps without an app release
- **THEN** each proceeds on its own version line without forcing the other, and versions are reported separately

### Requirement: Bundled baseline, updatable in place
Installers SHALL bundle a baseline engine version so the agent works offline on first run with no download; the component update mechanism SHALL then be able to move to a newer version in place without reinstalling the app.

#### Scenario: Fresh install then update
- **WHEN** a user installs from the dmg/exe/AppImage and later an engine update is available
- **THEN** the bundled baseline works immediately offline, and the update installs over it through the Updates tab, leaving the app untouched
