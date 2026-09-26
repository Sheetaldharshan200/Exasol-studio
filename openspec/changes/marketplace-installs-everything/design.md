# Design

## The shape

One `InstallKind` per *mechanism*, and a `source` on the catalogue entry
carrying that mechanism's coordinate. The Rust side matches on the kind; it
never learns an item's name.

```ts
| { kind: "pypi";     package: string }          // uv pip, managed venv
| { kind: "maven";    group: string; artifact: string }
| { kind: "gh-asset"; assetPattern: string; onPath?: boolean }
| { kind: "npm";      package: string }
| { kind: "host-plugin"; assetPattern: string; host: "powerbi" | "tableau" | "metabase" | "vscode" | "powerapps" }
| { kind: "reference" }                           // nothing to install
```

`gh-asset` covers both the JAR releases and the platform binaries: the only
difference is whether the file is put on PATH, which is one flag rather than
two installers.

## Where things land

Everything under Studio's own marketplace directory, one folder per item:

```
<app data>/marketplace/<id>/…
```

Binaries are linked into Studio's `bin` (already on the terminal's and the
agent's PATH). Python packages go into the one managed venv Studio already
creates. Nothing is written outside these.

For `host-plugin` the artifact lands in the item's folder and Studio reveals
the destination directory rather than writing to it — see the proposal's
non-goals for why.

## Verification

Every download is checked against a digest where one exists — GitHub's
per-asset digest, else the project's `<asset>.sha256` sibling, else Maven
Central's `.sha1`. An artifact whose published digest does not match is
discarded, never installed. PyPI and npm are left to their own clients, which
verify themselves.

## Uninstall

Remove the item's folder, unlink anything it put on PATH, `uv pip uninstall`
for a PyPI item, and drop it from the manifest. Uninstall never touches a file
another item also owns, and never removes the venv itself.

## Why not a package manager

Studio resolves exactly one artifact per item. A Java library pulled from
Maven arrives without its transitive dependencies, which is correct for the
purpose — these are put in BucketFS or on a classpath the user controls, not
linked into Studio. Saying so in the UI matters more than pretending
otherwise.

## Two traps found while surveying

**A Maven artifact's version is not its GitHub release tag.** They drift, and
badly — `bucketfs-java` is 5.0.1 on GitHub and 3.2.3 on Maven Central,
`exasol-testcontainers` 8.0.2 against 7.1.6, `udf-api-java` 1.0.12 against
1.0.6. Taking the tag as the version would 404 on almost every one. A `maven`
item's versions come from Maven Central's own `maven-metadata.xml` — which
`maven_latest` and `maven_all_versions` in `market.rs` already read for the
JDBC driver — and never from the release feed.

**Coordinates cannot be guessed from the repository name.** `bucketfs-python`
is `exasol-bucketfs` on PyPI, not `bucketfs-python`; a name-based probe
classified it as a Maven artifact because something of that name exists there.
Every coordinate has to be confirmed against its registry before it ships, and
an item whose coordinate cannot be confirmed stays a link. `verify-catalog.mjs`
is where that check belongs, so a wrong coordinate fails a run rather than a
user's click.
