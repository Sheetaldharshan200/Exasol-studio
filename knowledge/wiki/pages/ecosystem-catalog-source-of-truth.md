---
title: The ecosystem catalog — what Studio lists, and why nothing in it is pinned
category: marketplace
type: design
updated: 2026-09-24
---

# The rule

**The database and its public repositories are the source of truth.** Studio
never keeps a version, a product name or an About line that GitHub already
publishes — a copy is a thing that goes stale silently, and a stale version in
the UI is a lie the user has no way to check.

Concretely, three places apply it:

- **Script languages** come from `SYS.EXA_PARAMETERS` `SCRIPT_LANGUAGES`. They
  drive the UDF builder's language list, the snippet's `${1|…|}` choice, which
  grammars a `--/ … /` body can be tokenized with, and the linter's "this
  database does not offer X".
- **Marketplace cards** carry one registry line — `{ id, repo, kind, install }`
  — and resolve name, description, homepage, stars and last-push from the repo
  (`market_repo_meta`, disk-cached in Rust).
- **Virtual-schema adapters** resolve their artifact from the repo's *latest*
  release at install time.

# What was pinned, and why it is gone

Every adapter under `features/connection/virtual-schemas/adapters/` used to
carry `release: { tag: "4.0.2", asset: "…" }`.

The tag was never used to install anything. `vs_stage_adapter` calls
`crate::upstream::latest(&repo)`, then picks the asset by the regex. The tag
was only a label — "PostgreSQL adapter 4.0.2" in the prerequisites list — and
it was wrong the moment upstream published 4.0.3.

So `tag` is gone from the `VsAdapter` contract, 24 adapter files lost it, and
the prerequisite line reads "PostgreSQL adapter". The asset *pattern* stays:
it describes the artifact's shape, which is what is stable across releases.
`adapters/index.test.ts` now asserts a tag is **absent** and that the pattern
compiles.

# Which repos are in the catalog

Enumerated 2026-09-24 from the `exasol` and `exasol-labs` orgs: **229
non-archived public repos, 183 of which publish releases.**

**Virtual schemas — complete.** All 24 installable adapters are in the source
picker (23 under `exasol`, plus `exasol-labs/exasol-mongodb-vs`, a Rust
connector). Deliberately excluded:

- `exasol-labs/salesforce-virtual-schema` — no release to resolve, so nothing
  to install. Add it when one ships.
- `virtual-schema-common-*`, `edml-java`, `virtual-schema-shared-integration-tests`,
  `document-virtual-schema-spec`, `virtual-schemas` — shared libraries, specs
  and the entry-point repo, not adapters.

**Everything else — 24 new registry entries**, all `install: "reference"`:

| Kind | Repos |
|---|---|
| extension | cloud-storage-extension, kinesis-connector-extension, transformers-extension, advanced-analytics-framework, mlflow-plugin, script-languages-release, language-container-rs, preprocessor-library, lakehouse-engine-rs, exasol-vscode |
| bi | powerbi-exasol, metabase-driver, power-apps-connector, n8n-nodes, azure-data-factory-functions, exasol-panorama |
| driver | exasol-driver-lua, bucketfs-python, saas-api-python |
| server / cli / database | exasol-rest-api, saas-cli, exaplus-lua, exasol-personal-local-starterkit, exasol-labs-community-edition |

`reference` is the honest install kind for these: they install into the tool
they extend — Power BI, Tableau, Metabase, a Python environment — not into
Studio. The card shows the repo's real name, About line, stars and links out.
`versionSource()` returns null for them on purpose, because the comment at the
top of `versions.ts` promises *"any listed version is installable"* — listing
a version we cannot install would break that promise.

Promote one to a real installer by changing its `install` and, for a PyPI
package, adding the package name to `PYPI_PACKAGE` (which must mirror the Rust
dispatch in `market.rs`).

**Left out on purpose:** parent POMs, project-keeper, error-reporting, test
frameworks (`exasol-python-test-framework`, `pytest-*`, `udf-mock-python`,
`exasol-testcontainers`), style guides, schemas, forks (`sqlglot`,
`OpenMetadata`, `keyphrase-vectorizers`), demos and sample data. They publish
releases but nobody installs them from a database client.

# Invariants the tests hold

`catalog-data.test.ts` now asserts: ids are unique, every repo is a
well-formed `owner/name` in an official org, no repo appears twice (two cards
on one repo would render the same name and About line twice — what a bad merge
of this list looks like), and a repo-less item carries its own name,
description and homepage since nothing can resolve them.
