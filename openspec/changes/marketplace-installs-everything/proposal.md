# Marketplace installs everything

## Why

The marketplace lists all 147 published Exasol components, and **100 of them
are links**. Someone who comes looking for the Kafka connector, the BucketFS
client or the transformers extension is handed a GitHub page and left to work
out the rest. That is a catalogue, not a place to get things done.

The blocker is not the items. It is that installation is dispatched by item
**id**:

```rust
match id { "pyexasol" => …, "dbt-exasol" => …, "mcp-server" => … }
```

Eight hard-coded branches. Every new install needs its own, so the catalogue
grew and the installers did not. Adding 84 that way is not viable.

## What changes

Installation becomes dispatched by **kind**, not by id. A handful of generic
installers, and each catalogue entry names the one it uses plus its
coordinate — so adding an item stays one line, the same principle that already
fixed the registry and the refresh workflow.

A survey of all 147 against PyPI, Maven Central, npm and their release assets:

| Route | Items |
|---|---|
| Already installable | 48 |
| Maven Central (Java libraries and JAR releases) | 46 |
| PyPI | 17 |
| Host-tool plugin or archive (.vsix, .mez, .taco, .zip) | 12 |
| GitHub release binary | 5 |
| npm | 4 |
| Not installable — specs, tutorials, style guides, forks | 15 |

**132 of 147 become installable.** The remaining 15 stay links because there
is genuinely nothing to install, and they say so rather than pretending.

Every installed item then reports its version, offers an update when a newer
release exists, and can be removed — one Installed view across every kind.

## Non-goals

- **Studio does not write into other applications' directories.** For a Power
  BI connector, a Tableau connector, a Metabase plugin or a VS Code extension,
  Studio downloads and verifies the file and opens the folder it belongs in
  with the path shown. Writing into another product's installation means
  owning its upgrades and its breakage, and a database client should not.
- No private or third-party repositories. Official `exasol` and `exasol-labs`
  only, as today.
- No change to how managed components (Exasol Personal, ExaPump, MCP Server,
  the Exa Agent engine) are installed — they keep verify-or-refuse.
- Not a package manager. Studio resolves one artifact per item; it does not
  solve dependency graphs.
