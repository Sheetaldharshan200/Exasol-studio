#!/usr/bin/env bash
# Local Tauri build with updater signing.
#
# `tauri.conf.json` sets `createUpdaterArtifacts: true`, so every build tries to
# sign the updater bundle. Without a key the build fails at the very end with
# "A public key has been found, but no private key". This script feeds the
# updater signing key CONTENTS (the canonical form tauri expects — the same one
# CI uses via the TAURI_SIGNING_PRIVATE_KEY secret) so local builds finish clean.
#
# The private key is NEVER committed. It is read from (first match wins):
#   1. $TAURI_SIGNING_PRIVATE_KEY   (already-exported contents — used as-is)
#   2. $EXASOL_SIGNING_KEY          (path to a key file)
#   3. ~/.exasol-studio/signing/exasol-updater.key   (default local location)
#
# Usage:
#   scripts/build-local.sh                 # full build (all bundles)
#   scripts/build-local.sh --bundles app   # quick .app-only build for testing
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  KEY_FILE="${EXASOL_SIGNING_KEY:-$HOME/.exasol-studio/signing/exasol-updater.key}"
  if [ -f "$KEY_FILE" ]; then
    TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_FILE")"
    export TAURI_SIGNING_PRIVATE_KEY
    echo "› Signing with key: $KEY_FILE"
  else
    echo "⚠  No signing key found ($KEY_FILE). The build will fail at the updater-signing step." >&2
    echo "   Set TAURI_SIGNING_PRIVATE_KEY or EXASOL_SIGNING_KEY, or place the key at that path." >&2
  fi
fi
# Key was generated with an empty passphrase; allow override.
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"

# macOS code identity. An ad-hoc signature changes with every build, so macOS
# treats each local build as a NEW app: another "exasol-studio" row in
# Privacy & Security → Local Network, the permission asked for again, and the
# local database blocked until it is. Signing every build with one stable
# certificate makes them the same app. Uses $APPLE_SIGNING_IDENTITY when set
# (a Developer ID), else the local "Exasol Studio Local Signing" certificate
# if it is in the keychain (see docs/local-signing.md), else stays ad-hoc.
LOCAL_SIGNING_NAME="Exasol Studio Local Signing"
if [ "$(uname)" = "Darwin" ] && [ -z "${APPLE_SIGNING_IDENTITY:-}" ]; then
  if security find-identity -p codesigning 2>/dev/null | grep -q "\"$LOCAL_SIGNING_NAME\""; then
    export APPLE_SIGNING_IDENTITY="$LOCAL_SIGNING_NAME"
    echo "› Code signing with the stable local identity: $LOCAL_SIGNING_NAME"
  else
    echo "⚠  Ad-hoc code signature: macOS will see this build as a new app (Local Network asks again)." >&2
    echo "   One-time fix: docs/local-signing.md" >&2
  fi
fi

# Prebundle the platform runtime (Node + llama.cpp + Exa engine baseline) and
# the locked runtime artifacts (Exasol Personal, ExaPump) so a fresh install
# works offline with ZERO downloads — the same layout CI release builds ship.
# Skip with EXASOL_PREBUNDLE=0 for quick dev builds (the Exa panel then shows
# its install gate, and Built-in AI falls back to on-demand downloads).
# fetch-runtime.mjs WIPES resources/runtime, so it must run BEFORE
# the engine restage below. It is skipped when the
# engine baseline is already present — delete resources/runtime to force a
# refetch after bumping a pinned tag.
if [ "${EXASOL_PREBUNDLE:-1}" = "1" ]; then
  if [ ! -d "$REPO_ROOT/apps/desktop/src-tauri/resources/runtime/exa-engine" ]; then
    HOST_TRIPLE="$(rustc -vV | sed -n 's/^host: //p')"
    node "$REPO_ROOT/scripts/fetch-runtime.mjs" "$HOST_TRIPLE"
  fi
fi

# The prebuilt driver bridges are declared Tauri resources, so they must exist
# before the bundle is assembled. Cheap and incremental — Go caches its build.
"$REPO_ROOT/scripts/build-driver-bridges.sh" all

cd "$REPO_ROOT/apps/desktop"
exec pnpm tauri build "$@"
