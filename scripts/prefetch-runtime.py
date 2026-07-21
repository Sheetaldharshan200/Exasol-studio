#!/usr/bin/env python3
"""Prebundle the locked runtime artifacts (Exasol Personal launcher, ExaPump)
into apps/desktop/src-tauri/resources/runtime so first install needs no
download. Idempotent: artifacts already present with the locked sha256 are
kept. Only the CURRENT platform's artifacts are fetched — the bundle ships
what this build can actually run."""

import hashlib
import json
import pathlib
import platform
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
LOCK = ROOT / "apps/desktop/src-tauri/resources/runtime-components.lock.json"
DEST = ROOT / "apps/desktop/src-tauri/resources/runtime"


def platform_key() -> str:
    os_name = {"darwin": "macos", "linux": "linux", "win32": "windows"}.get(sys.platform, sys.platform)
    arch = {"arm64": "aarch64", "x86_64": "x86_64", "amd64": "x86_64"}.get(platform.machine().lower(), platform.machine().lower())
    return f"{os_name}-{arch}"


def sha256_file(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fetch(name: str, url: str, expected: str) -> None:
    target = DEST / name
    if target.is_file() and sha256_file(target) == expected.lower():
        print(f"✓ {name} (already bundled)")
        return
    print(f"↓ {name}")
    partial = target.with_suffix(target.suffix + ".partial")
    request = urllib.request.Request(url, headers={"User-Agent": "exasol-studio-build"})
    with urllib.request.urlopen(request) as response, partial.open("wb") as out:
        while chunk := response.read(1 << 20):
            out.write(chunk)
    actual = sha256_file(partial)
    if actual != expected.lower():
        partial.unlink(missing_ok=True)
        raise SystemExit(f"checksum mismatch for {name}: expected {expected}, got {actual}")
    partial.replace(target)
    print(f"✓ {name}")


def main() -> None:
    lock = json.loads(LOCK.read_text())
    key = platform_key()
    DEST.mkdir(parents=True, exist_ok=True)
    for component_name in ("personal", "exapump"):
        component = lock[component_name]
        artifact = component["artifacts"].get(key)
        if not artifact:
            print(f"! {component_name} {component['version']} has no artifact for {key} — skipping")
            continue
        fetch(artifact["name"], artifact["url"], artifact["sha256"])


if __name__ == "__main__":
    main()
