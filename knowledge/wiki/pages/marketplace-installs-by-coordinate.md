---
title: The marketplace installs by coordinate — how 48 installable items became 121
category: marketplace
type: design+gotcha
updated: 2026-09-29
---

# The structural finding

The marketplace listed 149 components and could install 48. The other 100
were links. The blocker was not the items: installation was dispatched by
**item id** —

```rust
match id { "pyexasol" => …, "dbt-exasol" => …, "mcp-server" => … }   // eight arms
```

— so every new install needed its own arm. The frontend had the same coupling
twice more (`PYPI_PACKAGE`, `PACKAGE_SOURCE`: tables keyed by item id), and
`market_uninstall` had a fourth (`if id == "driver-jdbc"`).

**All four are gone.** An item names its *mechanism and coordinate* —
`InstallSource` in `lib/ipc.ts` (it is what crosses the IPC boundary),
mirrored by `installers.rs` — and nothing in the installer learns an item's
name. Adding an item is one line of data. The mechanisms that are not a
package at all (a managed runtime, an in-database add-on, a source build, the
skills sync) are dispatched by install **kind**, which is still not by name.
A test holds both halves: every package-kind item carries a coordinate, and
no bespoke one claims one.

# Mechanisms

| `source.kind` | Coordinate | Verified by |
|---|---|---|
| `pypi` | package (`tool: true` = a command on PATH) | uv itself |
| `pip-release` | (repo) — `uv pip` from the release tarball | uv itself |
| `maven` | group, artifact | `<jar>.sha1` beside the artifact |
| `gh-asset` | optional `assetPattern` (else platform pick), `onPath` | GitHub per-asset digest, else `<asset>.sha256` sibling |
| `registry` | npm / goproxy / crates / exasol-downloads | npm `dist.shasum`; crates per-version checksum; portal sha256 |
| `repo-snapshot` | (repo) — current tarball, no releases | — |
| `driver-runtime` | `r`, `odbc` — built into Studio's own runtime | — |
| `host-plugin` | pattern + host — **not yet installed**, see below | — |

A verified pin for a Python package is looked up in the component lock **by
package**, so the lock's shape stays the lock's business. The ODBC library is
wired into Studio's connections because its coordinate names `driverRuntime:
"odbc"`, not because its id was `driver-odbc`.

# Two traps, both found the hard way

**A Maven artifact's version is not its GitHub release tag.** `bucketfs-java`
is 5.0.1 on GitHub and 3.2.3 on Maven Central; `exasol-testcontainers` 8.0.2
against 7.1.6; `udf-api-java` 1.0.12 against 1.0.6. Using the tag would 404
almost every one. Maven versions come from `maven-metadata.xml`, and are used
verbatim — a version that genuinely begins with `v` is addressed with it.

**Coordinates cannot be guessed from a repository name.** `bucketfs-python`
is `exasol-bucketfs` on PyPI, `pytest-backend` is `pytest-exasol-backend`,
`python-toolbox` is `exasol-toolbox`; a name-based probe filed
`bucketfs-python` as a *Maven* artifact because something of that name exists
there. Every coordinate was read from the project's own `pyproject.toml` /
`pom.xml` / `package.json` and then confirmed against its registry. Twelve
Java libraries were misfiled as "unpublished" on the first pass because the
Maven **search** API throttled eight parallel workers — confirm against
`repo1.maven.org` (the repository, and what the installer reads), not the
search API.

# What stays a link, and why

`spark-connector` ships five variants and needs a picker. `script-languages-release`
and `language-container-rs` are containers bound for BucketFS, not files for
this machine. `driver-lua` and `error-reporting-lua` are `.rockspec` (LuaRocks).
`row-level-security` and `preprocessor-library` install into a database.
`grafana-datasource`, `power-apps-connector` and `azure-data-factory` ship
through other products' catalogues — grafana-datasource had been `binary`
since before this work and had **never had a release asset**; every GitHub
release is source-only. Host plugins (`.vsix`, `.mez`) await their installer:
per the decision taken with the user, Studio will fetch, verify and **reveal
the destination folder**, never write into another application's install.

# Pattern selection

A release asset had only ever been chosen by platform, and a jar has none.
`pickAsset(assets, env, pattern?)` takes the item's pattern when it has one;
**zero** matches (upstream renamed the file) and **several** (an ambiguous
release) both read as *unavailable* rather than a guess. Every caller goes
through `pickAssetFor(item, …)` so an item cannot be picked for by platform
when its coordinate said which file. Also from review: the same OS in another
architecture is unavailable, not a fallback (an aarch64 Mac was being handed
the x86_64 build); `win-x64`-style names read as Windows.

# `verify-catalog.mjs`

Re-confirms every coordinate against its registry, reading release assets
from github.com (not the API, so nothing against the signed-out allowance),
and requires a pattern to match exactly one asset. A newest release with **no
assets yet** is upstream's state, not ours (bucketfs-client 2.2.1 shipped
source-only for a while) — a warning, not a failure. Only a pattern that
disagrees with assets that exist fails the run. Run it by hand or on a
schedule; it needs network and stays out of the unit suite.

# Codex review of the batch — all closed, each with a test

- An item id became a directory that uninstall `remove_dir_all`s, with no
  check it was one plain segment (`../other`). `valid_item_id` gates install
  and uninstall.
- A package named `--all` reached `uv tool uninstall` as an option.
  `valid_package_name` plus `--` before the name.
- A **published but unreadable** digest was *accepted*: `SHA256:` in upper
  case is 71 chars after a case-sensitive strip, so it skipped the check.
  Published and unreadable now fails closed; only "nothing published" passes.
- Maven, npm and crates downloads were never checked against their published
  digests. They are now.
- Relative symlink targets compared against an absolute directory never
  matched, so stale PATH links survived uninstall. Targets are resolved first.
- Go module paths need `!`-escaping of upper-case letters for the proxy.
- `authorize()` attached the GitHub token to *any* request builder. It checks
  the URL's host now. Its cache's check-then-fill and connect each hold one
  lock across the step.

# The guard that failed daily on main

`.github/scripts/refresh_runtime_components.py` scans `src-tauri/src/*.rs`
for `releases/download/<digit>` or `@sha256:<hex>` and fails on a hit: no
release version or digest may be embedded in Rust source. Two `upstream.rs`
**test fixtures** — HTML fragments with `releases/download/4.0.2/…` written
out — tripped it from the moment #161 merged. The fixtures are built from a
`tag` variable now (`releases/download/{tag}` in source). The guard is right;
remember it applies to test code too.

# The rest: what "install" truthfully means for the last seventeen (2026-09-29)

After the coordinate rewrite, seventeen items were still links. Each fits one
of a few **mechanisms**, none of which existed; `marketplace-installs-the-rest`
added them. The rule did not change: an item declares a mechanism and a
coordinate, nothing dispatches on an id.

| Mechanism | What it truthfully does | Items |
|---|---|---|
| `deliver { format }` | download, verify (`.sha256` sibling when published), reveal, and state the next step **from the format**: `rockspec` → `luarocks install`, `dbt-package` → `packages.yml` + `dbt deps`, `source` → the tag's archive from github.com (uncounted by the API), `desktop-app` → the platform build (`.dmg`/`.AppImage`/`.msi` tokens) | Lua driver + libraries, dbt-exasol-utils, Panorama, parquet-edml-generator, udf-runner-cpp, preprocessor-library, lakehouse-engine-rs |
| `gh-asset { choose: true }` | a plural release: the pattern's matches are offered by name, only the pick installs; one match needs no pick; a pick is renamed for another chosen release by its tag | spark-connector (8 assembly jars) |
| `slc { alias? }` | **the official launcher owns containers**: `exasol slc install|remove <alias>`, `slc list --json` as the menu — no BucketFS upload, no `SCRIPT_LANGUAGES` string editing by Studio | script-languages-release, language-container-rs (`rust`) |
| `db-scripts { schema }` | the release's `.sql`/`.lua` files, reviewed (connection, editable schema, every statement's head + body), then run on one connection; record = connection + schema + created-schema + created objects | row-level-security |
| `vm-appliance` | x86-64 only, image is the person's sign-up download found in Downloads, `VBoxManage import`/`startvm`, VMware gets the file; no digest published and the log says so | community-edition |
| `host-plugin`, `registry` | as before, two new destinations (`powerapps`, `azure-functions`) and the Go proxy | power-apps-connector, azure-data-factory, error-reporting-go |

## Gotchas that shaped it

- **Exasol script bundles are slash-terminated.** `administration-sql-scripts-<v>.sql`
  ends each `CREATE SCRIPT` body with a line holding only `/`, with filler `;`
  lines between. Splitting on `;` would cut Lua bodies; `split_bundle` splits
  on `/` lines and only the tail without a `/` on `;`.
- **Scripts that run inside a database fail closed.** No published digest → no
  install (the general policy lets an unverifiable *file* through; code that
  runs as the connection's user does not get that).
- **Review must pin what runs.** The plan carries the release tag and a
  SHA-256 fingerprint over the statements; install refetches by tag and
  refuses a different fingerprint. Without this, "latest" could change
  between review and run.
- **Removal drops exactly the recorded objects, newest first, never CASCADE**;
  the schema only if the install created it. Objects already present in an
  existing schema refuse the install (CREATE OR REPLACE would take them over
  and removal would later drop the person's object). Only tracked `CREATE`
  kinds run — a `CREATE SCHEMA`/`GRANT`/`ALTER SYSTEM`/`DROP` in a bundle
  refuses the whole install. A record read back from disk is validated before
  any name enters a `DROP`.
- **A downloaded file's name is one plain name** (`safe_file_name`) wherever
  it came from — a release asset named `../x.sql` used to be joinable.
- **Community Edition** is a 10 GB `.ova` behind a sign-up form, x86-64 only
  (the dev Mac is arm64, so it shows *Not for Apple Silicon / ARM* there).
- Codex review, two passes: 13 + 9 findings, then 6 more on the new modules;
  all fixed except two deliberate policies (the OVA import without a
  publisher digest, and forgetting a VMware machine's record on removal since
  Studio never reaches into VMware).

# Anomalies tab: typed decisions over rows through Ollaya (2026-09-30)

The tab answers fraud/discrepancy-style questions about every row of a
SELECT on this machine. Engine: **Ollaya** (`ollaya serve` on
`127.0.0.1:11435`, one binary, Apache-2.0) running the **Laya** decision
models (Apache-2.0, Convai Innovations; default `laya:typed-decisions`).
Marketplace item `ollaya` — a `gh-asset` with `perPlatform: true`: the
pattern matches one file per platform and the host picks (Linux ships
`.tar.zst`, which Studio does not extract, so Linux says "no build").

- `decisions.rs`: resolves the binary (Studio bin dir, then PATH), adopts a
  daemon only if `/api/tags` answers with a `models` array, else spawns
  `ollaya serve` (killed on exit), pulls via `ollaya pull` streamed under job
  `anomaly`, decides four rows in flight through `/api/decide`
  (`{model, state, questions, keep_alive}`), returns answers per row plus the
  first failure — earlier answers are kept.
- `features/anomaly/decisions.ts` (pure, tested): presets, `rowState` (null
  prototype, duplicate columns suffixed), `isReadOnlyQuery` (one SELECT/WITH,
  no second statement — the tab's "writes nothing" is enforced here),
  `decodeAnswer`, `flagValue` (noul → p; score → level/(n−1); choice →
  1 − P(first option)), `rankRows`, `toCsv` (formula-leading text prefixed
  with `'`).
- Results are frozen per run (rows, questions, model) with a run id, so
  edits or a late finish cannot mislabel answers.
- Codex: 10 findings, all fixed. Not verified live on this Mac yet: the
  `/api/decide` reply nesting (`answers_of` accepts nested or flat).
