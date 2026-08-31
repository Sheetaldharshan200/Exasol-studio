#!/usr/bin/env python3
"""Rename release assets to names a human can pick without a decoder ring
(ExasolStudio-Mac-AppleSilicon.dmg instead of Exasol.Studio_2026.0.2_aarch64.dmg)
and patch latest.json so the auto-updater follows the renames.

Runs as the last job of the release workflow. Idempotent: already-renamed
assets match no pattern and are skipped. Updater payloads (.app.tar.gz) keep
their Tauri names — users never touch them.

  GITHUB_TOKEN=... python friendly_release_names.py <owner/repo> <tag>
"""

import json
import os
import re
import sys
import urllib.request

OWNER_REPO, TAG = sys.argv[1], sys.argv[2]
TOKEN = os.environ["GITHUB_TOKEN"]
API = f"https://api.github.com/repos/{OWNER_REPO}"

# Pattern (with the version part wild) → friendly name. Order matters.
RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"^Exasol\.Studio_.*_aarch64\.dmg$"), "ExasolStudio-Mac-AppleSilicon.dmg"),
    (re.compile(r"^Exasol\.Studio_.*_x64\.dmg$"), "ExasolStudio-Mac-Intel.dmg"),
    (re.compile(r"^Exasol\.Studio_.*_x64-setup\.exe(\.sig)?$"), "ExasolStudio-Windows-64bit-setup.exe{sig}"),
    (re.compile(r"^Exasol\.Studio_.*_amd64\.AppImage(\.sig)?$"), "ExasolStudio-Linux-64bit.AppImage{sig}"),
    (re.compile(r"^Exasol\.Studio_.*_aarch64\.AppImage(\.sig)?$"), "ExasolStudio-Linux-ARM64.AppImage{sig}"),
    (re.compile(r"^Exasol\.Studio_.*_amd64\.deb(\.sig)?$"), "ExasolStudio-Linux-64bit.deb{sig}"),
    (re.compile(r"^Exasol\.Studio_.*_arm64\.deb(\.sig)?$"), "ExasolStudio-Linux-ARM64.deb{sig}"),
    (re.compile(r"^Exasol\.Studio-.*\.x86_64\.rpm(\.sig)?$"), "ExasolStudio-Linux-64bit.rpm{sig}"),
    (re.compile(r"^Exasol\.Studio-.*\.aarch64\.rpm(\.sig)?$"), "ExasolStudio-Linux-ARM64.rpm{sig}"),
]


def call(path: str, method: str = "GET", body: dict | bytes | None = None, content_type: str = "application/json"):
    url = path if path.startswith("http") else API + path
    data = None
    if isinstance(body, dict):
        data = json.dumps(body).encode()
    elif isinstance(body, bytes):
        data = body
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    if data is not None:
        req.add_header("Content-Type", content_type)
    with urllib.request.urlopen(req) as r:
        raw = r.read()
    return json.loads(raw) if raw and content_type == "application/json" else raw


release = call(f"/releases/tags/{TAG}")
assets = {a["name"]: a for a in release["assets"]}
renames: dict[str, str] = {}

for name, asset in list(assets.items()):
    for pattern, template in RULES:
        m = pattern.match(name)
        if m:
            sig = m.group(1) if pattern.groups else ""
            new = template.format(sig=sig or "")
            if new != name:
                call(f"/releases/assets/{asset['id']}", "PATCH", {"name": new})
                renames[name] = new
                print(f"renamed: {name} -> {new}")
            break

if not renames:
    print("nothing to rename (already friendly)")
    sys.exit(0)

# Patch the updater manifest so auto-updates follow the renamed files.
manifest = assets.get("latest.json")
if manifest:
    req = urllib.request.Request(manifest["browser_download_url"])
    req.add_header("Authorization", f"Bearer {TOKEN}")
    with urllib.request.urlopen(req) as r:
        data = json.loads(r.read())
    changed = 0
    for info in data.get("platforms", {}).values():
        for old, new in renames.items():
            if old in info.get("url", ""):
                info["url"] = info["url"].replace(old, new)
                changed += 1
    if changed:
        call(f"/releases/assets/{manifest['id']}", "DELETE")
        upload = f"https://uploads.github.com/repos/{OWNER_REPO}/releases/{release['id']}/assets?name=latest.json"
        call(upload, "POST", json.dumps(data, indent=2).encode(), content_type="application/octet-stream")
        print(f"latest.json: {changed} updater URLs patched and re-uploaded")
print("done")
