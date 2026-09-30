# Tasks

- [x] Remove `features/anomaly/*`, `decisions.rs`, IPC types and calls.
- [x] Remove the shell wiring (tabs, rail, ExasolStudio) and the `ollaya` catalog item + detection.
- [x] tsc, desktop `node --test` (662), `cargo test --lib` (233) green.
- [x] Keep the `perPlatform` spec delta (moved here from `anomaly-tab`).
- [x] Codex review: no live imports, registrations or catalog references left. Its one product finding — installs of the removed `ollaya` item would be orphaned — does not apply: the item existed only in unreleased dev builds for a day and no manifest on record carries it; installs missing from the catalog are a pre-existing, general gap, tracked separately if it ever matters.
- [x] Wiki log entry.
