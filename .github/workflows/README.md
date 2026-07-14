# CI / CD workflows

This repo is the **single source of truth** for the Exasol Studio app and for
every tool in its Marketplace.

## App distribution — `release-app.yml`
Builds all distributions in one matrix: macOS (Apple Silicon + Intel), Windows
(x64 + arm64), Linux (x64 + arm64). Triggered **only** on a `v*` tag or manual
dispatch, and publishes a **draft** GitHub release. Push a tag to cut a build:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

## Marketplace packages — one workflow per repo
Each item has a thin caller (`pkg-<id>.yml`) that calls the reusable
`_build-package.yml`. **To onboard or patch a repo you edit only its one file.**

- `kind: wheel` — resolves a Python wheel (+ deps) with `uv`.
- `kind: mirror` — copies the upstream release assets.

Each mirror is published to a rolling release tagged `mirror-<id>`.

## Catalog — `update-catalog.yml`
Generates `marketplace/catalog.json` (latest version + mirror tag per item) and
commits it only when it changes. The app reads this file as the authoritative
version list and raises an **update notification** when an installed item is
behind.

## Cost model (kept deliberately cheap)
- **Change-detection gate**: the `check` job compares the upstream tag to what
  we last mirrored; the expensive `build` job runs only when it changed — a
  quiet week costs a few seconds per item.
- **App runners on demand only**: macOS/Windows minutes (the pricey ones) are
  spent only when you tag a release, never on pushes.
- **Caching**: Rust (`Swatinem/rust-cache`) and pnpm caches on the app build.
- **Staggered weekly crons** (Mon/Tue) so runs never pile up; `concurrency`
  cancels superseded runs.
- **Commit-only-on-change** for the catalog avoids empty commits/pushes.

## Adding a new Marketplace item
1. Add a `pkg-<id>.yml` (copy an existing one; set `id`, `repo`, `kind`).
2. Add its row to the `items` list in `update-catalog.yml`.
3. Add it to the app's Marketplace `CATALOG` and (if it needs a real installer)
   a recipe in `src-tauri/src/market.rs`.

## Future test coverage (target pipeline)
Lint + type checks, frontend and Rust unit tests, integration tests against
disposable Exasol environments, end-to-end validation, and signing. See
[foundation/graphify/cicd-workflow.md](../../docs/foundation/graphify/cicd-workflow.md).

## Auto-update & code signing

**Auto-update (active).** `release-app` builds updater artifacts (`createUpdaterArtifacts`)
and signs them with the updater key (repo secrets `TAURI_SIGNING_PRIVATE_KEY` +
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, already set). The app checks
`releases/latest/download/latest.json` on startup and offers a one-click
"Install & restart". It becomes live for end users from the **next** tagged
release onward (the one that publishes `latest.json`). To rotate the key:
`pnpm --dir apps/desktop tauri signer generate -w key`, put the pubkey in
`tauri.conf.json > plugins.updater.pubkey`, and re-set the two secrets.

**macOS notarization (needs your certs).** Add these repo secrets and the
release is automatically signed + notarized (Gatekeeper-clean):
`APPLE_CERTIFICATE` (base64 of your Developer ID `.p12`), `APPLE_CERTIFICATE_PASSWORD`,
`APPLE_SIGNING_IDENTITY` (e.g. `Developer ID Application: Name (TEAMID)`),
`APPLE_ID`, `APPLE_PASSWORD` (app-specific password), `APPLE_TEAM_ID`.
Until then builds are unsigned (users right-click → Open once).

**Windows Authenticode (needs your cert).** Set
`tauri.conf.json > bundle.windows.certificateThumbprint` (or a `signCommand`)
with your code-signing certificate to avoid SmartScreen warnings.
