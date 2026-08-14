#!/usr/bin/env python3
"""Prebundle the runtime components (Exasol Personal launcher, ExaPump): the
LATEST official release of each ORIGINAL repo, digest-verified at build time
(the lock is the offline/no-digest fallback and is rewritten to match, since
the binary bakes it via include_str!). Bundled
into apps/desktop/src-tauri/resources/runtime so first install needs no
download. Idempotent: artifacts already present with the locked sha256 are
kept. Only the CURRENT platform's artifacts are fetched — the bundle ships
what this build can actually run."""

import hashlib
import json
import os
import pathlib
import platform
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
LOCK = ROOT / "apps/desktop/src-tauri/resources/runtime-components.lock.json"
DEST = ROOT / "apps/desktop/src-tauri/resources/runtime"


TRIPLE_TO_KEY = {
    "aarch64-apple-darwin": "macos-aarch64",
    "x86_64-apple-darwin": "macos-x86_64",
    "x86_64-unknown-linux-gnu": "linux-x86_64",
    "aarch64-unknown-linux-gnu": "linux-aarch64",
    "x86_64-pc-windows-msvc": "windows-x86_64",
    "aarch64-pc-windows-msvc": "windows-aarch64",
}


def platform_key() -> str:
    if len(sys.argv) > 1:  # explicit Rust target triple (CI matrix)
        return TRIPLE_TO_KEY.get(sys.argv[1], sys.argv[1])
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
        print(f"[ok] {name} (already bundled)")
        return
    partial = target.with_suffix(target.suffix + ".partial")
    # One retry: a large download interrupted mid-stream hashes wrong once
    # and clean the second time; a genuinely wrong artifact fails both.
    for attempt in (1, 2):
        print(f"[fetch] {name}" + (" (retry)" if attempt == 2 else ""))
        request = urllib.request.Request(url, headers={"User-Agent": "exasol-studio-build"})
        with urllib.request.urlopen(request) as response, partial.open("wb") as out:
            while chunk := response.read(1 << 20):
                out.write(chunk)
        actual = sha256_file(partial)
        if actual == expected.lower():
            partial.replace(target)
            print(f"[ok] {name}")
            return
        partial.unlink(missing_ok=True)
        if attempt == 2:
            raise SystemExit(f"checksum mismatch for {name}: expected {expected}, got {actual}")


def gh_token() -> str:
    for var in ("GITHUB_TOKEN", "GH_TOKEN"):
        if os.environ.get(var):
            return os.environ[var]
    try:  # local builds: reuse the gh CLI's auth to dodge anonymous rate limits
        return subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:
        return ""


def gh_json(url: str) -> dict:
    headers = {"User-Agent": "exasol-studio-build", "Accept": "application/vnd.github+json"}
    token = gh_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read())


def common_suffix_len(a: str, b: str) -> int:
    n = 0
    while n < min(len(a), len(b)) and a[-1 - n] == b[-1 - n]:
        n += 1
    return n


# Mirrors upstream.rs pick_asset: names embed a version but end in a stable
# platform suffix; require >= 12 chars so a bare "-aarch64" tail can't pick a
# wrong-OS binary, and refuse ties as ambiguous.
MIN_ASSET_SUFFIX = 12


def resolve_latest(component_name: str, component: dict, key: str) -> None:
    """Point the lock entry at the LATEST official release of the ORIGINAL
    repo (single source of truth), digest-verified. Falls back silently to
    the pinned version when the API, a matching asset, or its sha256 digest
    is unavailable — verify-or-refuse, never a blind bump."""
    repo = component.get("repository")
    artifact = component["artifacts"].get(key)
    if not repo or not artifact:
        return
    try:
        release = gh_json(f"https://api.github.com/repos/{repo}/releases/latest")
    except Exception as err:  # offline build → pinned version still works
        print(f"[pin] {component_name}: latest lookup failed ({err}) — keeping {component['version']}")
        return
    tag = release.get("tag_name") or ""
    if not tag or tag == component["version"]:
        return
    scored = sorted(
        ((common_suffix_len(artifact["name"], a.get("name") or ""), a) for a in release.get("assets") or []),
        key=lambda pair: -pair[0],
    )
    scored = [(score, a) for score, a in scored if score >= MIN_ASSET_SUFFIX]
    if not scored or (len(scored) > 1 and scored[0][0] == scored[1][0]):
        print(f"[pin] {component_name}: no unambiguous {key} asset in {tag} — keeping {component['version']}")
        return
    asset = scored[0][1]
    digest = (asset.get("digest") or "").removeprefix("sha256:")
    if len(digest) != 64 or not all(c in "0123456789abcdef" for c in digest.lower()):
        print(f"[pin] {component_name}: {tag} asset has no sha256 digest — keeping {component['version']}")
        return
    print(f"[latest] {component_name}: {tag} (lock pinned {component['version']}) — {asset['name']}")
    component["version"] = tag
    component["artifacts"][key] = {
        **artifact,
        "name": asset["name"],
        "url": asset["browser_download_url"],
        "sha256": digest.lower(),
    }


def main() -> None:
    lock = json.loads(LOCK.read_text())
    key = platform_key()
    DEST.mkdir(parents=True, exist_ok=True)
    dirty = False
    for component_name in ("personal", "exapump"):
        component = lock[component_name]
        before = json.dumps(component, sort_keys=True)
        resolve_latest(component_name, component, key)
        dirty = dirty or json.dumps(component, sort_keys=True) != before
        artifact = component["artifacts"].get(key)
        if not artifact:
            print(f"[skip] {component_name} {component['version']} has no artifact for {key} — skipping")
            continue
        fetch(artifact["name"], artifact["url"], artifact["sha256"])
    if dirty:
        # The lock is baked into the binary (include_str!) — rewrite it so the
        # build installs exactly what it bundles.
        LOCK.write_text(json.dumps(lock, indent=2) + "\n")
        print("[lock] rewritten with the latest official releases for this build")


if __name__ == "__main__":
    main()
