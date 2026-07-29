#!/usr/bin/env sh
# Exasol Studio installer for macOS & Linux — no Homebrew required.
#
#   curl -fsSL https://raw.githubusercontent.com/Sheetaldharshan200/Exasol-studio/main/scripts/install.sh | sh
#
# Always fetches the LATEST published release (via GitHub's
# /releases/latest/download redirect), picks the right asset for this
# OS + CPU, installs it, and — on macOS — moves the app into /Applications
# and clears the quarantine flag (this demo build isn't notarized yet).
set -eu

REPO="Sheetaldharshan200/Exasol-studio"
BASE="https://github.com/$REPO/releases/latest/download"
OS="$(uname -s)"
ARCH="$(uname -m)"

say() { printf '\033[1;32m›\033[0m %s\n' "$1"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64)         ASSET="ExasolStudio-Mac-AppleSilicon.dmg" ;;
      x86_64)        ASSET="ExasolStudio-Mac-Intel.dmg" ;;
      *)             die "Unsupported macOS architecture: $ARCH" ;;
    esac
    say "Downloading $ASSET..."
    curl -fSL --progress-bar "$BASE/$ASSET" -o "$TMP/exasol.dmg" || die "download failed"
    say "Mounting the disk image..."
    # NOT -quiet: that suppresses the attach table we parse. The mount point is
    # the last tab-field of the /Volumes/ line (it may contain spaces).
    MOUNT="$(hdiutil attach -nobrowse -readonly "$TMP/exasol.dmg" | awk -F'\t' '/\/Volumes\//{print $NF}' | tail -1)"
    [ -n "${MOUNT:-}" ] || die "could not mount the DMG"
    APP="$(/bin/ls -d "$MOUNT"/*.app 2>/dev/null | head -1)"
    [ -n "${APP:-}" ] || { hdiutil detach -quiet "$MOUNT" || true; die "no .app found in the DMG"; }
    # Prefer /Applications; fall back to ~/Applications if it isn't writable.
    DEST="/Applications"
    [ -w "$DEST" ] || DEST="$HOME/Applications"
    mkdir -p "$DEST"
    say "Installing to $DEST..."
    rm -rf "$DEST/$(basename "$APP")"
    cp -R "$APP" "$DEST/"
    hdiutil detach -quiet "$MOUNT" || true
    say "Clearing the quarantine flag (unnotarized demo build)..."
    xattr -dr com.apple.quarantine "$DEST/$(basename "$APP")" 2>/dev/null || true
    say "Done. Launch it from $DEST or: open \"$DEST/$(basename "$APP")\""
    ;;

  Linux)
    ASSET="ExasolStudio-Linux-64bit.AppImage"
    say "Downloading $ASSET..."
    curl -fSL --progress-bar "$BASE/$ASSET" -o "$TMP/ExasolStudio.AppImage" || die "download failed"
    # ~/.local/bin is on PATH for most distros; fall back to /usr/local/bin.
    DEST="$HOME/.local/bin"
    [ -d "$DEST" ] || DEST="/usr/local/bin"
    if [ ! -w "$DEST" ]; then
      command -v sudo >/dev/null 2>&1 || die "$DEST is not writable and sudo is unavailable"
      SUDO="sudo"
    else
      SUDO=""
    fi
    mkdir -p "$DEST" 2>/dev/null || true
    say "Installing to $DEST/exasol-studio..."
    $SUDO install -m 0755 "$TMP/ExasolStudio.AppImage" "$DEST/exasol-studio"
    say "Done. Run: exasol-studio   (ensure $DEST is on your PATH)"
    printf '   .deb / .rpm packages are also on the release page if you prefer your package manager.\n'
    ;;

  *)
    die "Unsupported OS: $OS. On Windows use the PowerShell installer (see the README)."
    ;;
esac
