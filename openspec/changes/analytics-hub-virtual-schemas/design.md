# Design

## Context

See proposal.md — Why. What shapes the approach:

- **Exasol Personal 2.3.0** enables virtual schemas locally "when the required
  adapter runtime and dependencies are installed". Every Exasol adapter is a
  Java `ADAPTER SCRIPT` that needs (a) the Java language container, standard
  in Exasol; (b) the adapter JAR and, for JDBC sources, the JDBC driver JAR in
  BucketFS; (c) a `CREATE JAVA ADAPTER SCRIPT` registration; (d) a
  `CONNECTION` object with credentials; (e) `CREATE VIRTUAL SCHEMA … USING
  <adapter> WITH <properties>`. Studio already has BucketFS tooling
  (`bucketfs.rs`, `BucketFsPanel`), a prerequisites probe (`list_vs_prereqs`),
  and DDL generation in `NewVirtualSchema.tsx`.
- Studio's existing catalog is a single file of one-line entries consumed by
  one component. The agent cannot read it; it can read a directory of files.
- The workbench is tab-based (`TabView` union, `newTab()`); the database
  dropdown (`ConnectionSwitcher`) switches the active profile; the visualizer
  lists a profile's schemas from `getDatabaseOverview`.
- Studio manages the local database through the `exasol` launcher CLI with
  a verified lock of release artifacts. Six code paths gate "local" to macOS;
  a separate `community_db.rs` runs `exasol/docker-db` through Docker as the
  non-macOS fallback.

## Goals / Non-Goals

**Goals:**
- One catalog, one file per adapter, that the app renders and the agent reads.
- Attaching a source is one guided flow that ends in a *proved* virtual schema.
- Prerequisite installation is Studio's job, approval-gated, never a manual
  "upload this JAR" step.
- The local database story is one engine (Podman via the launcher) on three
  platforms, with no Docker left to probe or explain.
- No file grows past its current size band; new logic is pure and tested.

**Non-Goals:**
- Streaming results from remote sources differently — a virtual schema is a
  schema; the existing query path is untouched.
- Editing an existing virtual schema's properties (ALTER VIRTUAL SCHEMA) in
  the UI beyond refresh and drop.

## Decisions

**D1 — Catalog: one module per adapter, assembled by an index.**
`virtual-schemas/adapters/<id>.ts` exports a `VsAdapter`; `adapters/index.ts`
exports the ordered `VS_ADAPTERS` and lookups. *Why over one big file:* each
adapter's connection fields, URL template, driver source and "prove it" query
differ, and the user asked for separate files to maintain; a per-file layout
also lets the agent read exactly one adapter's contract. *Alternative
rejected:* generating the catalog from upstream READMEs at build time — the
metadata Studio needs (which fields to ask for, how to prove the schema) is
not in the READMEs.

Type sketch (what the flow consumes; internal names may change):

```
VsAdapter {
  id, name, kind: "jdbc" | "document" | "exasol",
  logo?, repo, docs, adapterAsset: { releaseRepo, assetPattern, scriptClass },
  driver?: { name, class, maven? , manualUrl? },   // JDBC only
  fields: ConnField[],                              // what to ask the user
  connectionString(values) -> { to, user?, identifiedBy? },
  vsProperties(values) -> Record<string,string>,   // WITH clause
  prove: { kind: "listTables" | "query", sql? }     // how to verify
}
```

**D2 — The flow is a tab, built as steps, with the decisions in pure
functions.** New `TabView` `"addSource"`. Steps: *source → credentials →
options → prerequisites → create & prove*. The DDL (`CREATE CONNECTION`,
`CREATE VIRTUAL SCHEMA`), the property mapping and the prerequisite diff
("what is missing for this adapter on this database") live in
`virtual-schemas/ddl.ts` and `virtual-schemas/prereqs.ts`, both pure and
tested under `node:test`. The React component only sequences steps. *Why a
tab over the current modal:* the user asked for it, and a multi-step flow
that installs software needs room and a progress log, which a modal fights.
*Why not extend `NewVirtualSchema.tsx`:* it is 380 lines of one component
with DDL inline and untested; the flow replaces it.

**D3 — Studio installs prerequisites; the user approves.** For a chosen
adapter Studio: resolves the adapter JAR from the repo's latest GitHub
release (asset pattern per adapter), resolves the JDBC driver from Maven
Central when `driver.maven` is set (otherwise asks for a JAR file — Simba
drivers for BigQuery/Athena, Databricks, Impala, Hive are not redistributable),
uploads both to BucketFS via the existing `bucketfs.rs` path, and runs
`CREATE JAVA ADAPTER SCRIPT`. This is a new Rust module
`virtual_schema_install.rs` (streams progress with the same `emit_log` /
`market:done` events the Marketplace uses) — **not** appended to `market.rs`.
Downloads are checksum-verified where upstream publishes one; GitHub release
assets are verified by size + TLS and the JAR's manifest class is checked
before registration. *Alternative rejected:* telling the user which files to
upload — that is the current state and it is why nobody uses it.

**D4 — Proving the schema is part of creating it.** After `CREATE VIRTUAL
SCHEMA`, the flow runs the adapter's `prove` step (list the remote tables;
for JDBC also `SELECT … LIMIT 5` from the first one) and shows the result.
A virtual schema that creates but cannot be read is reported as a failure
with the adapter's error, not as success. *Why:* the driver work in this
repo showed repeatedly that "created without error" and "works" differ.

**D5 — Doors into the flow.** (a) `ConnectionSwitcher` gets a final item
"Add a data source…" that opens the `addSource` tab for the active profile.
(b) The visualizer's schema picker gets an add tile (a small new component
`AddSourceTile.tsx`; `Visualizer.tsx` gains one import and one element, no
logic). (c) The agent's `exasol-federation` skill names the flow and the
catalog path. After creation, the existing `studio:schema-changed` event
refreshes the visualizer and the sidebar.

**D6 — Virtual schemas are first-class objects, not a separate list.**
`getDatabaseOverview` already returns schemas; each gains
`virtual: { adapter, connection } | null` from `EXA_ALL_VIRTUAL_SCHEMAS`,
and the sidebar / visualizer / dropdown render a distinct glyph and the
source name. Querying is unchanged — it is a schema.

**D7 — 2.3.0 on every platform, one engine.** Pin `v2.3.0`; add the three
new artifacts to the lock. The six `consts::OS == "macos"` gates in
`local_runtime.rs` become "launcher present" checks — the launcher decides
platform support and reports it. `community_db.rs`, `CommunityDbActions.tsx`
and the Docker/Colima probes are deleted (the user's explicit decision; the
spec's open question #2 closes as "retire"). The lock refresh uses the
existing script so `executableSha256` is computed the same way CI does.
*Risk accepted:* the Windows artifact is a `.zip`, not a `.tar.gz`; the
fetch/extract path must handle both (verified in the lock verify workflow,
which already runs per platform).

**D8 — 2.3 behaviours become text where they are user-visible.** The
database port is bound to `127.0.0.1` (Connection Properties says so where it
shows the host); unattended confirmations auto-proceed (Studio always passes
`--auto-approve`, already true via `host_prep_args`; the Local Exasol panel
explains it); custom and Rust SLCs and Parquet via `exasol connect` are
described in the Local Exasol panel with the exact commands. No new
management UI (Non-goals).

## Risks / Trade-offs

- [Adapter JAR asset names differ per repo and change between releases] →
  the per-adapter file carries a regex over the release assets, and the
  catalog test pins the current asset name for each adapter so upstream
  renames fail a test rather than a user.
- [Some JDBC drivers cannot be downloaded automatically (Simba, Databricks,
  Hive, Impala)] → the adapter file marks `driver.manualUrl`; the flow asks
  for the JAR with a link to the vendor page and never pretends it fetched
  one.
- [Uploading to BucketFS on Personal needs the BucketFS port/credentials] →
  Studio already resolves them for its managed local database
  (`bucketfs.rs`); for a user-added Exasol the flow asks once and stores
  them in the profile's settings.
- [A remote source may be reachable from the user's machine but not from
  the database host] → the prove step surfaces the adapter's actual error
  ("connection refused from the database") and the flow explains that the
  *database* connects, not the laptop. On Personal they are the same machine,
  which is the common case.
- [Deleting the Docker fallback removes the only local option on a machine
  where Podman cannot run] → the launcher installs Podman on Windows and
  reports why on Linux; Studio shows the launcher's own diagnostic. The user
  chose this; the spec records it.
- [`Visualizer.tsx` at 1,289 lines is over the split threshold] → this change
  adds one component *outside* it; splitting the visualizer is its own
  change.

## Migration Plan

1. Catalog + tests (no behaviour change; `NewVirtualSchema` reads the new
   index).
2. Rust install module + IPC, behind the flow (unused until the flow lands).
3. Flow tab + doors; `NewVirtualSchema.tsx` deleted in the same commit.
4. 2.3.0 lock + platform gates + Docker retirement + texts (independent of
   1–3; can land first).
5. Skill points at the catalog; wiki page.

Rollback: each step is a separate commit; 4 is reversible by restoring the
lock and `community_db.rs`. Nothing changes the database itself until a user
runs the flow.

## Open Questions

- Should attached sources be pinned per Studio profile (remember "this Exasol
  has Postgres X attached") for the sidebar even when the database is
  offline? Deferrable — the catalog query answers it while online, which is
  the only time it can be queried anyway.
