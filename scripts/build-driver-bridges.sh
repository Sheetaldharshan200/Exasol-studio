#!/usr/bin/env bash
# Build the prebuilt driver bridges Studio ships as app resources.
#
# These are what make the Go (and, later, ADO.NET) drivers NATIVE: the binary
# travels with the app, so choosing that driver installs nothing. Release CI
# runs this on each target runner, so every bundle carries its own build.
#
# Usage: ./scripts/build-driver-bridges.sh [go]
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$root/apps/desktop/src-tauri/resources/bridges"
mkdir -p "$out"

go_bin="${GO_BIN:-go}"
command -v "$go_bin" >/dev/null 2>&1 || go_bin="$HOME/.local/go/bin/go"

build_go() {
  if ! command -v "$go_bin" >/dev/null 2>&1; then
    echo "go not found — set GO_BIN or install Go 1.24+" >&2
    return 1
  fi
  # Name by the TARGET, not the host: cross-compiling with GOOS=windows must
  # produce the .exe the Windows app looks for.
  local name="exasol-bridge-go"
  local target_os="${GOOS:-$("$go_bin" env GOOS)}"
  [ "$target_os" = "windows" ] && name="exasol-bridge-go.exe"
  echo "→ building $name with $("$go_bin" version)"
  (cd "$root/packages/driver-bridges/go" && CGO_ENABLED=0 "$go_bin" build -trimpath -ldflags "-s -w" -o "$out/$name" .)
  echo "✓ $out/$name"
}

case "${1:-all}" in
  go) build_go ;;
  all) build_go ;;
  *) echo "unknown target: $1" >&2; exit 2 ;;
esac
