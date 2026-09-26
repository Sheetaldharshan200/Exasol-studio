# Tasks

## 1. Kind-driven dispatch (foundation)

- [ ] `InstallKind` + `source` on `CatalogItem`; the id switch in `market.rs`
      becomes a kind match. Tests: `apps/desktop/src/features/marketplace/install-kind.test.ts`
- [ ] Keep every currently-working install working unchanged — the existing
      eight ids map onto kinds, they do not get new behaviour.

## 2. The installers

- [ ] `gh-asset` — release asset by pattern, digest-verified, optional PATH
      link. Covers 46 JAR/binary items. Tests: `market.rs` (asset choice,
      digest refusal)
- [ ] `maven` — Maven Central coordinate → JAR, verified against `.sha1`.
      Tests: `market.rs` (coordinate → URL, checksum mismatch refused)
- [ ] `pypi` — into the managed venv. Tests: `market.rs` (spec building)
- [ ] `npm` — existing registry installer, reached by kind
- [ ] `host-plugin` — download, verify, reveal the destination. Tests:
      `apps/desktop/src/features/marketplace/host-plugin.test.ts` (destination
      per host and platform)

## 3. Lifecycle

- [ ] Installed version per kind, so the Installed view and the update badge
      agree across all of them
- [ ] Uninstall per kind. Tests: `market.rs` (manifest and PATH cleanup; a
      file another item owns is never removed)

## 4. The catalogue

- [ ] Classify all 147 entries onto a kind with its coordinate, from the
      survey. The 15 with nothing to install keep `reference` and say so.
- [ ] `scripts/verify-catalog.mjs` also checks each coordinate resolves —
      a PyPI name that does not exist, a Maven coordinate with no JAR, an
      asset pattern matching nothing.
