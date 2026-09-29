# Tasks

## 1. Data-only
- [x] `error-reporting-go` → `registry` / goproxy. Confirmed by verify-catalog.
- [x] `power-apps-connector`, `azure-data-factory` → `host-plugin` with
      `powerapps` / `azure-functions` destinations. Tests: `installers.rs`
      (destination per host and OS).

## 2. `deliver`
- [x] Coordinate + Rust arm: download, verify (`.sha256` sibling), place
      without extract/link, reveal, format instruction. Tests: `installers.rs`
      (instruction per format; unknown format refused).
- [x] Catalogue: three rockspecs, `dbt-exasol-utils`, `parquet-edml-generator`,
      `udf-runner-cpp`, `panorama`. verify-catalog checks each pattern.

## 3. Variant choice
- [x] `choose: true`: card shows a variant menu of the pattern's matches; the
      pick travels as the asset name; no pick = "choose a variant".
      Tests: `assets.test.ts` (matches enumerated; a single match needs no
      choice; zero is still unavailable).
- [x] `spark-connector` flipped.

## 4. `slc`
- [x] Through the official launcher instead of BucketFS + `SCRIPT_LANGUAGES`
      editing (design revised): `slc install|remove|list --json`. Tests:
      the launcher listing → choices (`market.rs`), alias validation.
- [x] `script-languages-release` (language picked from the launcher's list),
      `language-container-rs` (`rust`) flipped; `lakehouse-engine-rs` and
      `preprocessor-library` are delivered as source (their own scripts
      install them).
- [x] Un-stage a virtual schema adapter: remove its files under `vs/`, asked
      first. Tests: `staged_matches` stays under `vs/`.

## 5. `db-scripts`
- [x] Install: review screen (connection, editable schema, every statement
      head), then run on one connection; record connection, schema,
      created-schema, objects. Tests: `db_scripts.rs` (slash bundles,
      created objects, adapter naming, drops, identifiers).
- [x] Uninstall: drop exactly the recorded objects, the schema only if
      created here, never CASCADE (design revised); Semantic Views keeps its
      own lifecycle.
- [x] `row-level-security` flipped.

## 6. Installed view
- [x] Manifest records `connection` for database-side items; the Installed
      view shows it; removal confirms schema/alias and connection by name.

## 7. `vm-appliance`
- [x] Coordinate + pure helpers: hypervisor detection from candidate paths,
      image lookup by pattern and flavor, `VBoxManage` argument building,
      "already registered" from `list vms` output. Tests: `installers.rs`.
- [x] Install: non-x86-64 host → unavailable with the reason; no hypervisor →
      named and linked; no image → download page opened, no record written;
      VirtualBox import + start; VMware hand-off. Manifest carries hypervisor
      and VM name.
- [x] Uninstall: VirtualBox poweroff + `unregistervm --delete` after a
      confirmation naming the VM; VMware record removed with instruction.
- [x] Presence: `list vms` naming the VM shows *on this system*.
- [x] `community-edition` flipped; verify-catalog accepts the mechanism.
