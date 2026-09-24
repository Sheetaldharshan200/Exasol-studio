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

Concretely, four places apply it:

- **Script languages** come from `SYS.EXA_PARAMETERS` `SCRIPT_LANGUAGES`. They
  drive the UDF builder's language list, the snippet's `${1|…|}` choice, which
  grammars a `--/ … /` body can be tokenized with, and the linter's "this
  database does not offer X".
- **Marketplace cards** carry one registry line — `{ id, repo, kind, install }`
  — and resolve name, description, homepage, stars and last-push from the repo
  (`market_repo_meta`, disk-cached in Rust).
- **Virtual-schema adapters** resolve their artifact from the repo's *latest*
  release at install time, and the Virtual Schemas shelf is **derived** from
  the adapter registry rather than listed.
- **The refresh workflow** derives its item list from the same registry
  (`scripts/catalog-items.mjs`) instead of keeping its own.

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
`adapters/index.test.ts` asserts a tag is **absent** and that the pattern
compiles; `tests/virtual_schema_live.rs` asserts the catalog's pattern selects
the artifact its live proof downloads (it keeps its own pin, because a live
proof has to be reproducible).

# The second registry that had already drifted

`.github/workflows/update-catalog.yml` carried its own copy of the item list
as a heredoc, so every marketplace change had to be made twice. It had
drifted exactly as duplicated lists do:

- still refreshing `mongodb-vs`, months after MongoDB became a *data source*
  rather than a marketplace extension
- still refreshing `apache/superset`, which the app has never listed

It now runs `node scripts/catalog-items.mjs`, which prints `id|repo|homepage`
from `CATALOG`. `exasol-cloud` is an explicit alias in that script: it installs
Exasol Personal in cloud mode (`install_personal_cloud` in market.rs), so it
needs a version in the catalog without a second card in the gallery. The job
pins Node 24 because the script imports a `.ts` file directly and the rest of
the repo builds on 22, which will not strip types unflagged.

# Which repos are in the catalog

Enumerated 2026-09-24 from the `exasol` and `exasol-labs` orgs: **229
non-archived public repos, 183 publishing releases, 143 with a resolvable
latest tag.** All 143 are now listed — nothing is curated out.

**Virtual schemas — their own shelf.** All 24 adapters, `kind: "vs"`, derived
from `VS_ADAPTERS` by `vs-catalog.ts`. A test asserts the shelf is exactly the
registry, so the shelf and the add-data-source flow cannot disagree about
which adapters exist. `install: "vs-adapter"` stages the newest release into
the connected database's BucketFS using the same command the flow's
prerequisites step runs — idempotent, so re-staging a current adapter
re-uploads the same artifact. The two **Lua** adapters are `reference`
instead: their source is inlined into `CREATE ADAPTER SCRIPT`, so there is no
artifact to update and a Stage button there would do nothing.

`exasol-labs/salesforce-virtual-schema` is still out — no release to resolve.

**The installable ecosystem** — 34 entries across extension / bi / driver /
server / cli / database, all `install: "reference"`, because they install into
the tool they extend (Power BI, Tableau, Metabase, a Python environment) and
not into Studio. `versionSource()` returns null for them deliberately: the
comment at the top of `versions.ts` promises *"any listed version is
installable"*, and listing a version we cannot install would break it.

**Libraries & tooling** — the remaining 64. Maven plugins, pytest fixtures,
test frameworks, error-reporting builders, shared virtual-schema libraries,
style guides, specs. They publish real releases and people look for them, so
they are listed; they are depended on rather than installed, so they get their
own shelf rather than being mixed in with the things you install.

# The GitHub rate limit, and the fix that actually addressed it

`market_repo_meta` fetches GitHub **unauthenticated** — 60 requests an hour per
IP, for everything the app does.

**The original bug.** It refetched *every* repo whenever any one of them was
missing from the cache:

```rust
if !(fresh && wanted.iter().all(|r| entries.contains_key(r))) { /* fetch ALL */ }
```

At 25 repos that fits. At 149 it does not, and the failure mode is a spiral,
not a slowdown: the call spends the whole allowance, the tail gets 403s, those
repos never reach the cache, so `all(...)` stays false and the *next* call
repeats it. The marketplace would sit permanently without descriptions.

**The first attempt was damage control, not a fix.** Per-repo timestamps plus
a 40-request cap stopped the spiral, but the cause was untouched: the app was
still asking about each repo one at a time, so a large catalog simply filled
in over several openings. A nicer failure, not a working one. Worth
remembering as a pattern — a cap that makes a bad strategy survivable can read
like a fix and hide the real question, which was *why are we making 149
requests at all*.

**The fix.** `GET /orgs/{owner}/repos?per_page=100` returns the same fields as
the per-repo endpoint — name, description, `stargazers_count`, `pushed_at`,
`html_url` — so one request answers for a hundred repos. Practically every
entry belongs to `exasol` (2 pages) or `exasol-labs` (1 page), so the whole
catalog costs **four requests**: those three plus one for
`Sheetaldharshan200/exa-engine`.

`fetch_plan` groups the stale repos by owner and lists an org only at
`ORG_LISTING_THRESHOLD` (3) or more — listing an entire org to learn about one
repo costs more than it saves — leaving the rest as individual requests under
a budget that is now a safety net rather than load-bearing. A listing caches
**every** repo the org owns, including ones the catalog has not asked about,
so adding an entry later usually costs no request at all.

Two things were removed once the cause was fixed, rather than left behind:
`MAX_REPO_FETCH`, and the library-last ordering in `catalogRepos()` that
existed only so the visible shelves would fill before the long tail. With a
whole org answered in one request there is no tail, and an ordering whose
stated reason is no longer true is worse than none.

**Not done, deliberately:** conditional requests (`If-None-Match`). GitHub
does not count `304 Not Modified` against the limit, so ETags would make
refreshes free — but at four requests a day that optimises something that no
longer hurts. Worth revisiting only if the catalog spans many more orgs.

# Invariants the tests hold

`catalog-data.test.ts`: ids are unique; every repo is a well-formed
`owner/name` in an official org; no repo appears twice (two cards on one repo
render the same name and About line twice — what a bad merge of this list
looks like); a repo-less item carries its own name, description and homepage;
the VS shelf equals the adapter registry; and every declared `kind` is
actually used.

`market.rs`: seven tests on `stale_repos` and `fetch_plan`, including one
built on the real shape of the catalog that asserts it costs two org listings
and a single request rather than one per repo.

Two network checks, kept out of the offline suite and run by hand or on a
schedule:

- `scripts/verify-vs-adapters.mjs` — every adapter's asset pattern still
  selects **exactly one** artifact in its repo's latest release. With no
  pinned tag, that pattern is the only thing between a user and a failed
  install.
- `scripts/verify-catalog.mjs` — every catalog repo exists, is not archived,
  and has an About line. Cards resolve their text from GitHub, so a typo in a
  `repo` field fails nothing; it renders a blank card.
