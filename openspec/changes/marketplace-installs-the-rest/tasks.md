# Tasks

## 1. Data-only
- [x] `error-reporting-go` → `registry` / goproxy. Confirmed by verify-catalog.
- [x] `power-apps-connector`, `azure-data-factory` → `host-plugin` with
      `powerapps` / `azure-functions` destinations. Tests: `installers.rs`
      (destination per host and OS).

## 2. `deliver`
- [ ] Coordinate + Rust arm: download, verify (`.sha256` sibling), place
      without extract/link, reveal, format instruction. Tests: `installers.rs`
      (instruction per format; unknown format refused).
- [ ] Catalogue: three rockspecs, `dbt-exasol-utils`, `parquet-edml-generator`,
      `udf-runner-cpp`, `panorama`. verify-catalog checks each pattern.

## 3. Variant choice
- [ ] `choose: true`: card shows a variant menu of the pattern's matches; the
      pick travels as the asset name; no pick = "choose a variant".
      Tests: `assets.test.ts` (matches enumerated; a single match needs no
      choice; zero is still unavailable).
- [ ] `spark-connector` flipped.

## 4. `slc`
- [ ] `bucketfs_delete` beside list/upload/download. Tests: `bucketfs.rs`
      (URL built from the same base as upload).
- [ ] Install: upload to `slc/`, append the alias to `SCRIPT_LANGUAGES`.
      Uninstall: remove only this alias, delete the file. Tests: pure
      `SCRIPT_LANGUAGES` add/remove functions (existing aliases preserved;
      removing an absent alias is a no-op).
- [ ] `script-languages-release` (choose), `language-container-rs`,
      `lakehouse-engine-rs` flipped.
- [ ] Un-stage a virtual schema adapter: remove its files under `vs/`.

## 5. `db-scripts`
- [ ] Install: resolve connection, run verified scripts into the schema,
      record version + connection; permission screen lists the statements.
      Tests: statement splitting/ordering of the release's files.
- [ ] Uninstall: confirmed `DROP SCHEMA … CASCADE` on that connection; the
      same for Semantic Views.
- [ ] `row-level-security`, `preprocessor-library` flipped.

## 6. Installed view
- [ ] Manifest records `connection` for database-side items; the Installed
      view shows it; removal confirms schema/alias and connection by name.

## 7. `vm-appliance`
- [ ] Coordinate + pure helpers: hypervisor detection from candidate paths,
      image lookup by pattern and flavor, `VBoxManage` argument building,
      "already registered" from `list vms` output. Tests: `installers.rs`.
- [ ] Install: non-x86-64 host → unavailable with the reason; no hypervisor →
      named and linked; no image → download page opened, no record written;
      VirtualBox import + start; VMware hand-off. Manifest carries hypervisor
      and VM name.
- [ ] Uninstall: VirtualBox poweroff + `unregistervm --delete` after a
      confirmation naming the VM; VMware record removed with instruction.
- [ ] Presence: `list vms` naming the VM shows *on this system*.
- [ ] `community-edition` flipped; verify-catalog accepts the mechanism.
