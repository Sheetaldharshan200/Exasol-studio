# Tasks

## 1. Exasol Personal 2.3.0 — platform, engine, texts (independent; land first)

- [ ] 1.1 Pin `v2.3.0` in `resources/runtime-components.lock.json` with the five platform artifacts and the published SHA-256s; compute `executableSha256` with `.github/scripts/refresh_runtime_components.py`; verify with `python .github/scripts/refresh_runtime_components.py --verify`
- [ ] 1.2 Teach the artifact fetch/extract path `.zip` (Windows) alongside `.tar.gz`; verify with a unit test on the archive-kind decision in `local_runtime.rs` (`mod archive_tests`) and `--verify-platform-artifacts`
- [ ] 1.3 Remove the six `consts::OS == "macos"` gates in `local_runtime.rs` in favour of "launcher present"; verify `cargo test` and that `local_runtime.rs` does not grow (it shrinks)
- [ ] 1.4 Delete `community_db.rs`, its command registrations in `lib.rs`, `marketplace/CommunityDbActions.tsx`, the Community (Docker) tile and the Docker/Colima probes; verify `cargo check`, `tsc`, and `grep -rn "docker\|colima" apps/desktop/src apps/desktop/src-tauri/src` returns only the nano image reference
- [ ] 1.5 Update every user-facing text that names Docker, "macOS only", or says virtual schemas need a full Exasol (`ConnectionPropertiesTab.tsx`, `BucketFsPanel.tsx`, `LocalExasolPanel.tsx`, `Marketplace.tsx`, `NewVirtualSchema.tsx` until 3.x deletes it); add the 2.3 notes (port on `127.0.0.1`, unattended confirmations, custom/Rust SLC and Parquet commands) to `LocalExasolPanel.tsx`; verify by reading each panel in the running app
- [ ] 1.6 Update `docs/platform-drivers-spec.md` workstream B (B1–B7) and decision #1/#2 to "done: 2.3.0 final, Docker retired"; verify the spec's current-state table matches the code

## 2. Virtual schema catalog — one file per adapter

- [ ] 2.1 Create `features/connection/virtual-schemas/types.ts` (`VsAdapter`, `ConnField`) and `adapters/index.ts`; verify `tsc`
- [ ] 2.2 Write one adapter file each for: postgresql, mysql, oracle, sqlserver, snowflake, bigquery, redshift, databricks, db2, hana, hive, impala, athena, sybase, exasol (JDBC) and exasol-lua, s3, gcs, azure-blob, azure-data-lake-gen2, bucketfs, dynamodb, elasticsearch (document) — each with fields, connection string and property builders, adapter release asset pattern, driver source or user-supplied marker, docs, and a prove step; verify `adapters/index.test.ts`: unique ids, every JDBC adapter has a driver source, every adapter has repo+docs+prove, and the id set equals the pinned upstream repository list (drift fails the test)
- [ ] 2.3 Move DDL generation out of `NewVirtualSchema.tsx` into pure `virtual-schemas/ddl.ts` (`connectionDdl`, `virtualSchemaDdl`, `adapterScriptDdl`); verify `ddl.test.ts` covers identifier quoting/case-folding, passwords never in VS DDL, empty/optional fields, and each adapter's property mapping
- [ ] 2.4 Add pure `virtual-schemas/prereqs.ts` (`missingPrerequisites(adapter, probe)` → the ordered install list); verify `prereqs.test.ts` covers: nothing installed, driver present but adapter missing, user-supplied driver, everything present
- [ ] 2.5 Point `NewVirtualSchema.tsx` at the new index and delete `virtual-schema-sources.ts`; verify `tsc` and the existing flow still renders every source

## 3. Prerequisite install (Rust) and IPC

- [ ] 3.1 New `virtual_schema_install.rs`: resolve the adapter JAR from the repo's latest GitHub release by asset pattern, resolve a Maven driver when coordinates are given, download with size/TLS checks (checksum where published), upload both to BucketFS through `bucketfs.rs`, run `CREATE JAVA ADAPTER SCRIPT`; stream progress via `emit_log`/`market:done`; verify pure helpers in `mod tests` (asset matching, Maven URL building, manifest class check) and `cargo test`
- [ ] 3.2 Extend `list_vs_prereqs` to report per-adapter presence (script, adapter JAR, driver JAR in BucketFS); verify `cargo test` on the classification helper
- [ ] 3.3 Extend the database overview with `virtual: { adapter, connection } | null` per schema from `EXA_ALL_VIRTUAL_SCHEMAS`; verify `cargo test` on the row mapping and that a non-virtual schema maps to `null`
- [ ] 3.4 Add IPC (`ipc.ts`, `ipc-mock.ts`): `vsInstallPrerequisites`, `vsProve`, extended `listVsPrereqs`; verify `tsc` and the mock returns shaped data

## 4. Add a data source — the flow tab

- [ ] 4.1 Add `TabView` `"addSource"` and `openAddSourceTab(profileId)` in `tabs.ts`; verify `tabs.test.ts` (if present) or `tsc`
- [ ] 4.2 Build `virtual-schemas/AddSourceFlow.tsx` — steps source → credentials → options → prerequisites → create & prove — each step a small component, all decisions from `ddl.ts`/`prereqs.ts`; keep the file under 500 lines; verify `tsc`, a vite build, and a manual run against the local database
- [ ] 4.3 Prove step: after create, list remote tables and (JDBC) `SELECT … LIMIT 5`; on failure show the adapter's error and offer drop; verify by pointing the flow at a wrong password and confirming failure is reported, then at a working PostgreSQL and confirming rows appear
- [ ] 4.4 Delete `NewVirtualSchema.tsx` and route its two call sites to the tab; verify `tsc` and `grep -rn NewVirtualSchema apps/desktop/src` is empty

## 5. Doors into the hub

- [ ] 5.1 `ConnectionSwitcher.tsx`: "Add a data source…" item that opens the tab for the active profile; verify manually
- [ ] 5.2 New `AddSourceTile.tsx` in the visualizer's schema picker (one import + one element in `Visualizer.tsx`, no logic added there); verify manually and that `Visualizer.tsx` grows by fewer than 10 lines
- [ ] 5.3 Sidebar and visualizer mark virtual schemas with a distinct glyph and the source name from 3.3; verify manually against a created schema
- [ ] 5.4 Refresh and drop actions for a virtual schema (approval-gated) where local schemas offer theirs; verify manually
- [ ] 5.5 Live-test tier: extend `tests/bridge_live.rs`-style opt-in Rust test `tests/virtual_schema_live.rs` that, given `EXASOL_LIVE_*` and a reachable PostgreSQL (`PG_LIVE_*`), attaches it and reads a table; skips without credentials; verify it passes against the local database with a Postgres in reach

## 6. Agent and knowledge

- [ ] 6.1 `skills/exasol-federation.md`: reference the catalog directory and the flow; verify the skill's description triggers on "I have data in Postgres and here" in the eval suite (`evals/suites/core.eval.json` gains a `federation-default` case expecting `tool-used: semantic_models` is NOT required and the answer proposes a virtual schema); run `pnpm --filter @exasol-studio/agent-core evals`
- [ ] 6.2 Wiki page `analytics-hub-virtual-schemas` recording the adapter/driver-source decisions and the "created means proved" rule; verify page exists via `wiki_read`
- [ ] 6.3 Refresh `graphify-out/graph.json` (`graphify update .`) and the `.ua` graph; verify both commit cleanly

## 7. Review and ship

- [ ] 7.1 Codex review of each landed group (1, 2+3, 4+5, 6); verify findings fixed before each commit
- [ ] 7.2 Full suite green (`pnpm test` with `DEVELOPER_DIR=/Library/Developer/CommandLineTools`), app built via `build-local.sh --bundles app`, binary mtime verified, relaunched; verify manually: add a PostgreSQL source from the dropdown, see it in the visualizer, join it with a local table in the editor
