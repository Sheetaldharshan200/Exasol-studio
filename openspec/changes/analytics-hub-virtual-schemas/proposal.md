# Proposal

## Why

Exasol Personal 2.3.0 shipped today (2026-09-21) and changes what the local
database can do: it runs on Linux and Windows through Podman, and **virtual
schemas now work locally**. Studio still describes the 2.2 world — Docker as
the engine, macOS as the only local platform, and a federation skill that tells
the agent virtual schemas are *unavailable* on Personal. Meanwhile the one thing
a local analytics database is for — "I have data here and data over there, show
me one answer" — has no easy path in Studio: the existing virtual-schema form
assumes the adapter is already installed and asks the user to upload JARs by
hand.

This change makes Studio an **analytics hub**: one Exasol, any number of other
databases and buckets attached to it as virtual schemas, added through a guided
flow that installs what is missing, and reachable from wherever the user
already is (the database dropdown, the visualizer, the agent).

## What Changes

- **Virtual schema catalog, one file per adapter.** Every adapter Exasol
  publishes (23 repositories, enumerated from `github.com/exasol` on
  2026-09-21) gets its own file under
  `apps/desktop/src/features/connection/virtual-schemas/`, carrying what the
  flow needs: kind (JDBC / document), connection fields, JDBC URL template and
  driver coordinates, adapter release asset, docs, and how to *prove* a new
  schema works. Replaces the single 55-line `virtual-schema-sources.ts`
  (24 one-line entries; missing `bucketfs-document-files`,
  `azure-data-lake-storage-gen2` as its own source, and
  `exasol-virtual-schema-lua`).
- **Add a data source — a guided tab.** Source first, then credentials, then
  the few source-specific options, then Studio installs the adapter runtime
  and driver if they are missing (approval-gated), creates the connection and
  the virtual schema, and proves it with a real query against a remote table.
  Opens as a workbench tab like everything else.
- **Reachable from the hub's doors.** The database dropdown gains "Add a data
  source…" which opens that tab; the visualizer's schema picker gains an add
  tile; virtual schemas appear alongside local schemas in both and are
  queryable exactly like them.
- **The agent defaults to virtual schemas** when the user says their data
  lives in another database or bucket — no need to know the term. (Skill
  corrected already; this change makes it a spec'd contract and points the
  skill at the catalog.)
- **Exasol Personal 2.3.0 everywhere Studio talks about the local database.**
  Pin `v2.3.0`; lock the Linux (x86_64, arm64) and Windows (x86_64) artifacts
  with the published checksums; remove the six macOS-only gates in
  `local_runtime.rs`; **BREAKING for the Marketplace**: retire the
  "Exasol Community (Docker)" engine and every Docker/Colima probe — Personal
  on Podman is the local database on every platform; update every user-facing
  text that names Docker, "macOS only", or says virtual schemas need a full
  Exasol; document the new behaviours (port bound to `127.0.0.1`, unattended
  confirmations auto-proceed, `--auto-approve`, custom and Rust script
  language containers, Parquet through `exasol connect`).

## Capabilities

### New Capabilities
- `virtual-schema-catalog`: the authoritative list of Exasol virtual schema
  adapters and what each needs to install, connect and verify — read by the
  app and by the agent.
- `add-data-source`: the guided flow that attaches another database or bucket
  to an Exasol as a virtual schema, including installing missing
  prerequisites and proving the result.
- `analytics-hub`: virtual schemas are first-class in the database dropdown,
  the visualizer and the query surfaces — attached sources look and query
  like local schemas.
- `exasol-personal-2-3`: Studio's local database is Exasol Personal 2.3.0 on
  Podman on macOS, Linux and Windows, with the 2.3 behaviours reflected in
  what Studio does and says.
- `agent-federation-default`: the agent treats "my data is in another
  database / bucket" as a virtual schema request first.

### Modified Capabilities
<!-- none: no existing spec covers connections, virtual schemas, or the local runtime -->

## Non-goals

- A script language container **management UI** (install / update / remove
  SLCs, custom SLC from tarball). 2.3 makes this possible and it is spec'd
  as workstream C in `docs/platform-drivers-spec.md`; here it is limited to
  the *information* Studio shows and to installing the JVM runtime the
  virtual schema adapters need.
- Writing custom adapters, or adapters Exasol does not publish (MongoDB is
  archived upstream and is deliberately not in the catalog).
- Writable virtual schemas. Exasol's are read-only; the flow says so.
- Cloud (AWS/Azure/Exoscale/STACKIT) deployment changes from the 2.3 notes
  — Studio manages the local deployment only.
- Replacing the native driver work already shipped (workstream A); the hub
  queries through whatever driver the connection uses.

## Impact

**Frontend** (`apps/desktop/src`): new `features/connection/virtual-schemas/`
(catalog + flow + pure DDL/prereq logic with tests); `components/studio/tabs.ts`
(new tab view); `components/studio/ConnectionSwitcher.tsx` (85 lines) and
`Sidebar.tsx` (768) gain the add entry; `features/workbench/Visualizer.tsx`
(**1,289 lines** — the add tile is a small extracted component, nothing is
appended to this file); `features/connection/NewVirtualSchema.tsx` (380) is
replaced by the flow and deleted; Docker text in `ConnectionPropertiesTab.tsx`,
`BucketFsPanel.tsx`, `marketplace/LocalExasolPanel.tsx`, `marketplace/Marketplace.tsx`;
`marketplace/CommunityDbActions.tsx` deleted; `lib/ipc.ts` + `ipc-mock.ts`
for new commands.

**Rust** (`apps/desktop/src-tauri/src`): `local_runtime.rs` (**~1,540 lines**
— the six macOS gates are *removed*, and the engine-detection block that
mentions Docker is simplified; no growth); `community_db.rs` deleted and its
commands unregistered in `lib.rs`; `market.rs` (**~2,200 lines** — the
`driver-adonet`/Docker tiles and the community-DB install arm are removed,
and the new adapter/driver install lands in a NEW module
`virtual_schema_install.rs` rather than growing it); `catalog.rs` /
`metadata.rs` for listing virtual schemas with their adapter and connection.

**Resources**: `resources/runtime-components.lock.json` → `v2.3.0` with five
platform artifacts (checksums from the published
`exasol-personal_2.3.0_checksums.txt`; `executableSha256` computed by the
existing `.github/scripts/refresh_runtime_components.py`).

**Agent** (`packages/agent-core`): `skills/exasol-federation.md` (corrected);
the skill references the catalog path; no sidecar code change.

**Docs**: `docs/platform-drivers-spec.md` workstream B and C1 marked against
this change; `knowledge/wiki` page for the hub.
