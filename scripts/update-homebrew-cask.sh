#!/usr/bin/env bash
# Regenerate the Homebrew cask for a published release and push it to the tap.
#
# It downloads the two macOS DMGs from the GitHub release, computes their
# sha256, writes Casks/exasol-studio.rb in the tap repo, and commits. Idempotent
# — safe to re-run for the same tag.
#
# Usage:  scripts/update-homebrew-cask.sh [vTAG]
#   vTAG defaults to the version in apps/desktop/package.json (prefixed with v).
#
# Requires: gh (authenticated), git. The tap repo is cloned to a temp dir.
set -euo pipefail

APP_REPO="Sheetaldharshan200/Exasol-studio"
TAP_REPO="Sheetaldharshan200/homebrew-tap"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

TAG="${1:-}"
if [ -z "$TAG" ]; then
  VERSION="$(python3 -c "import json;print(json.load(open('$REPO_ROOT/apps/desktop/package.json'))['version'])")"
  TAG="v$VERSION"
fi
VERSION="${TAG#v}"

echo "› Building cask for $TAG"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

sha_of() { # asset-name -> sha256 (downloads from the release)
  local name="$1"
  gh release download "$TAG" -R "$APP_REPO" -p "$name" -D "$WORK" --clobber >/dev/null 2>&1 || {
    echo "!! asset $name not found in release $TAG" >&2
    return 1
  }
  shasum -a 256 "$WORK/$name" | awk '{print $1}'
}

ARM_SHA="$(sha_of ExasolStudio-Mac-AppleSilicon.dmg)"
INTEL_SHA="$(sha_of ExasolStudio-Mac-Intel.dmg)"
echo "  arm64  $ARM_SHA"
echo "  intel  $INTEL_SHA"

gh repo clone "$TAP_REPO" "$WORK/tap" -- -q
mkdir -p "$WORK/tap/Casks"
cat > "$WORK/tap/Casks/exasol-studio.rb" <<RUBY
cask "exasol-studio" do
  version "$VERSION"

  on_arm do
    sha256 "$ARM_SHA"
    url "https://github.com/$APP_REPO/releases/download/v#{version}/ExasolStudio-Mac-AppleSilicon.dmg"
  end
  on_intel do
    sha256 "$INTEL_SHA"
    url "https://github.com/$APP_REPO/releases/download/v#{version}/ExasolStudio-Mac-Intel.dmg"
  end

  name "Exasol Studio"
  desc "Desktop Exasol client with a local database, AI assistant, and data tooling"
  homepage "https://github.com/$APP_REPO"

  app "Exasol Studio.app"

  # DEMO BUILD: not yet notarized by Apple. Strip the quarantine flag so
  # \`brew install --cask\` launches cleanly. Remove once a notarized build ships.
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{appdir}/Exasol Studio.app"],
                   sudo: false
  end

  zap trash: [
    "~/Library/Application Support/com.exasol.studio",
    "~/Library/Caches/com.exasol.studio",
    "~/Library/Preferences/com.exasol.studio.plist",
    "~/Library/Saved Application State/com.exasol.studio.savedState",
  ]
end
RUBY

cd "$WORK/tap"
if git diff --quiet -- Casks/exasol-studio.rb 2>/dev/null && git ls-files --error-unmatch Casks/exasol-studio.rb >/dev/null 2>&1; then
  echo "✓ cask already up to date for $TAG"
  exit 0
fi
git add Casks/exasol-studio.rb
git -c user.name="release-bot" -c user.email="noreply@exasol.com" commit -q -m "exasol-studio $VERSION"
git push -q origin HEAD
echo "✓ pushed exasol-studio $VERSION to $TAP_REPO"
echo
echo "Install with:"
echo "  brew tap sheetaldharshan200/tap https://github.com/$TAP_REPO"
echo "  brew install --cask exasol-studio"
