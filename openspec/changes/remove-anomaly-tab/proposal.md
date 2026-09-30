# Remove the Anomalies tab

## Why

Fraud and discrepancy detection over rows is a product of its own, not a tab.
The decision-model engine, the model catalogue, the presets, the evaluation
loop and the result review each grow into a workspace; inside Studio they
would compete with the SQL client for the rail, the release cycle and the
reviewer's attention. Decided 2026-09-30: that work moves to its own
repository and its own application. Studio stays the database client and the
shell that hosts the ecosystem's components in tabs.

## What

- The Anomalies tab, its rail item, tab view, deep link and components
  (`features/anomaly/*`) are removed.
- The Rust decision engine (`decisions.rs`: `decisions_status`,
  `decisions_pull`, `decisions_decide`, the managed daemon) is removed.
- The `ollaya` Marketplace item and its detection are removed; it existed
  only to serve the tab. The `perPlatform` release mechanism it introduced
  stays: it is generic and tested, and its spec delta is kept here.

## Non-goals

- Nothing else in the Marketplace changes. Re-adding an Ollaya item later is
  one catalog line.
