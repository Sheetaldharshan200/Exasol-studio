#!/usr/bin/env python3
"""Resolve, vendor, lock, and verify the Studio first-install components.

The source catalog contains identities and platform patterns only. This script
is the sole place that turns upstream "latest" state into immutable versions,
commits, image digests, and artifact checksums consumed by the desktop app.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import io
import json
import os
import platform
import re
import shutil
import subprocess
import tarfile
import tempfile
import tomllib
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[2]
SOURCES_PATH = ROOT / ".github/runtime-component-sources.json"
LOCK_PATH = ROOT / "apps/desktop/src-tauri/resources/runtime-components.lock.json"
PYTHON_STACK = ROOT / "apps/desktop/src-tauri/resources/python-stack"
GENERATOR = ".github/scripts/refresh_runtime_components.py"


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def request(url: str, *, accept: str = "application/vnd.github+json") -> bytes:
    headers = {"Accept": accept, "User-Agent": "exasol-studio-component-refresh"}
    if urlsplit(url).hostname == "api.github.com" and (token := os.environ.get("GITHUB_TOKEN")):
        headers["Authorization"] = f"Bearer {token}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=120) as response:
        return response.read()


def api_json(url: str) -> dict[str, Any]:
    return json.loads(request(url))


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def tree_digest(paths: list[Path], base: Path) -> str:
    """Hash path names and contents so a revision cannot mask vendored drift."""
    digest = hashlib.sha256()
    # Sort by the relative parts TUPLE, never by Path: pathlib compares paths
    # casefolded on Windows but case-sensitively elsewhere, so mixed-case names
    # (LICENSE vs install.py) ordered differently per OS and the same tree hashed
    # to different digests ("vendored content differs" only on Windows). A parts
    # tuple compares case-sensitively on every OS AND reproduces the exact order
    # POSIX pathlib always produced, so digests already stored in the lock
    # remain valid.
    files = sorted(
        (file for path in paths for file in ([path] if path.is_file() else path.rglob("*")) if file.is_file()),
        key=lambda file: file.relative_to(base).parts,
    )
    for file in files:
        digest.update(file.relative_to(base).as_posix().encode("utf-8"))
        digest.update(b"\0")
        digest.update(bytes.fromhex(sha256_file(file)))
    return digest.hexdigest()


def asset_digest(asset: dict[str, Any]) -> str:
    digest = asset.get("digest") or ""
    if re.fullmatch(r"sha256:[0-9a-fA-F]{64}", digest):
        return digest.split(":", 1)[1].lower()
    return sha256_bytes(request(asset["browser_download_url"], accept="application/octet-stream"))


def executable_bytes(payload: bytes, name: str, executable: str) -> bytes:
    if name.endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            candidates = [path for path in archive.namelist() if Path(path).name in {executable, f"{executable}.exe"}]
            if len(candidates) != 1:
                raise RuntimeError(f"{name} does not contain exactly one {executable} executable")
            return archive.read(candidates[0])
    if name.endswith((".tar.gz", ".tgz")):
        with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as archive:
            candidates = [member for member in archive.getmembers() if member.isfile() and Path(member.name).name in {executable, f"{executable}.exe"}]
            if len(candidates) != 1:
                raise RuntimeError(f"{name} does not contain exactly one {executable} executable")
            extracted = archive.extractfile(candidates[0])
            if extracted is None:
                raise RuntimeError(f"Could not extract {executable} from {name}")
            return extracted.read()
    return payload


def executable_digest(asset: dict[str, Any], executable: str) -> str:
    payload = request(asset["browser_download_url"], accept="application/octet-stream")
    return sha256_bytes(executable_bytes(payload, asset["name"], executable))


def resolve_release(source: dict[str, Any], previous: dict[str, Any] | None = None) -> dict[str, Any]:
    repository = source["repository"]
    release = api_json(f"https://api.github.com/repos/{repository}/releases/latest")
    resolved: dict[str, Any] = {
        "repository": repository,
        "version": release["tag_name"],
        "artifacts": {},
    }
    for platform, pattern in source["assets"].items():
        matches = [asset for asset in release["assets"] if re.fullmatch(pattern, asset["name"])]
        if len(matches) != 1:
            names = ", ".join(asset["name"] for asset in release["assets"])
            raise RuntimeError(
                f"{repository} {release['tag_name']} expected one {platform} asset matching "
                f"{pattern!r}; found {len(matches)} among: {names}"
            )
        asset = matches[0]
        locked_asset = {
            "name": asset["name"],
            "url": asset["browser_download_url"],
            "sha256": asset_digest(asset),
        }
        if executable := source.get("executable"):
            old = (previous or {}).get("artifacts", {}).get(platform, {})
            if old.get("sha256") == locked_asset["sha256"] and old.get("executableSha256"):
                locked_asset["executableSha256"] = old["executableSha256"]
            else:
                locked_asset["executableSha256"] = executable_digest(asset, executable)
        resolved["artifacts"][platform] = locked_asset
    return resolved


def version_key(tag: str) -> tuple[int, ...]:
    return tuple(int(value) for value in re.findall(r"\d+", tag))


def resolve_nano(source: dict[str, Any]) -> dict[str, Any]:
    repository = source["repository"]
    pattern = re.compile(source["stableTagPattern"])
    required = set(source["requiredArchitectures"])
    url = f"https://hub.docker.com/v2/repositories/{repository}/tags?page_size=100&ordering=last_updated"
    candidates: list[dict[str, Any]] = []
    while url:
        page = json.loads(request(url, accept="application/json"))
        for tag in page.get("results", []):
            architectures = {
                image.get("architecture")
                for image in tag.get("images", [])
                if image.get("os") == "linux"
            }
            if (
                pattern.fullmatch(tag.get("name", ""))
                and tag.get("content_type") == "image"
                and required.issubset(architectures)
                and re.fullmatch(r"sha256:[0-9a-fA-F]{64}", tag.get("digest", ""))
            ):
                candidates.append(tag)
        url = page.get("next")
    if not candidates:
        raise RuntimeError(f"No stable multi-architecture image found for {repository}")
    selected = max(candidates, key=lambda item: version_key(item["name"]))
    return {
        "registry": source["registry"],
        "repository": repository,
        "tag": selected["name"],
        "digest": selected["digest"].lower(),
    }


def replace_tree(source: Path, destination: Path) -> None:
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(source, destination, ignore=shutil.ignore_patterns(".git", ".github"))


def refresh_python_stack(config: dict[str, Any]) -> dict[str, str]:
    python_version = config["python"]
    packages = config["packages"]
    project = {
        "project": {
            "name": "exasol-studio-local-stack",
            "version": "0.0.0",
            "requires-python": f">={python_version},<{int(python_version.split('.')[0])}.{int(python_version.split('.')[1]) + 1}",
        }
    }
    dependencies = "\n".join(f'  "{package}",' for package in packages)
    (PYTHON_STACK / "pyproject.toml").write_text(
        "[project]\nname = \"exasol-studio-local-stack\"\nversion = \"0.0.0\"\n"
        f"requires-python = \"{project['project']['requires-python']}\"\n"
        f"dependencies = [\n{dependencies}\n]\n\n[tool.uv]\npackage = false\n",
        encoding="utf-8",
    )
    subprocess.run(
        [os.environ.get("UV", "uv"), "lock", "--upgrade", "--python", python_version],
        cwd=PYTHON_STACK,
        check=True,
    )
    locked = tomllib.loads((PYTHON_STACK / "uv.lock").read_text(encoding="utf-8"))
    versions = {package["name"]: package["version"] for package in locked["package"]}
    return {
        "pythonVersion": python_version,
        "pyexasolVersion": versions["pyexasol"],
        "mcpServerVersion": versions["exasol-mcp-server"],
        "lockSha256": sha256_file(PYTHON_STACK / "uv.lock"),
    }


def refresh() -> None:
    if LOCK_PATH.exists():
        # Refuse to turn local drift into a newly "generated" trusted hash.
        verify()
    sources = load_json(SOURCES_PATH)
    previous = load_json(LOCK_PATH) if LOCK_PATH.exists() else {}
    resolved: dict[str, Any] = {
        "schemaVersion": 1,
        "generatedBy": GENERATOR,
        "generatedAt": previous.get("generatedAt", ""),
        "personal": resolve_release(sources["githubReleases"]["personal"], previous.get("personal")),
        "nano": resolve_nano(sources["containerImages"]["nano"]),
        "uv": resolve_release(sources["githubReleases"]["uv"], previous.get("uv")),
        "pythonStack": refresh_python_stack(sources["pythonStack"]),
        "exapump": resolve_release(sources["githubReleases"]["exapump"], previous.get("exapump")),
    }
    comparable_old = {key: value for key, value in previous.items() if key != "generatedAt"}
    comparable_new = {key: value for key, value in resolved.items() if key != "generatedAt"}
    if comparable_old != comparable_new:
        resolved["generatedAt"] = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    LOCK_PATH.write_text(json.dumps(resolved, indent=2) + "\n", encoding="utf-8")


def verify() -> None:
    sources = load_json(SOURCES_PATH)
    lock = load_json(LOCK_PATH)
    if lock.get("schemaVersion") != sources.get("schemaVersion") or lock.get("generatedBy") != GENERATOR:
        raise RuntimeError("Runtime component lock schema/generator is invalid")
    sha_pattern = re.compile(r"[0-9a-f]{64}")
    expected_platforms = {
        name: set(source["assets"])
        for name, source in sources["githubReleases"].items()
    }
    for name, platforms in expected_platforms.items():
        component = lock[name]
        release_source = sources["githubReleases"][name]
        repository = release_source["repository"]
        if component["repository"] != repository:
            raise RuntimeError(f"{name} repository differs from the source catalog")
        if not component.get("version"):
            raise RuntimeError(f"{name} has no selected release version")
        if set(component["artifacts"]) != platforms:
            raise RuntimeError(f"{name} platform coverage differs from the source catalog")
        url_prefix = f"https://github.com/{repository}/releases/download/{component['version']}/"
        for platform_name, artifact in component["artifacts"].items():
            if not artifact["url"].startswith("https://") or not sha_pattern.fullmatch(artifact["sha256"]):
                raise RuntimeError(f"{name} contains an unverified artifact")
            if not re.fullmatch(release_source["assets"][platform_name], artifact["name"]):
                raise RuntimeError(f"{name} artifact name is outside the declared platform pattern")
            if artifact["url"] != f"{url_prefix}{artifact['name']}":
                raise RuntimeError(f"{name} artifact URL is outside its declared GitHub release")
            if release_source.get("executable") and not sha_pattern.fullmatch(artifact.get("executableSha256", "")):
                raise RuntimeError(f"{name} does not lock its extracted executable")
    nano_source = sources["containerImages"]["nano"]
    if lock["nano"].get("registry") != nano_source["registry"] or lock["nano"].get("repository") != nano_source["repository"]:
        raise RuntimeError("Nano image identity differs from the source catalog")
    if not re.fullmatch(nano_source["stableTagPattern"], lock["nano"].get("tag", "")):
        raise RuntimeError("Nano tag does not match the declared stable-release policy")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", lock["nano"]["digest"]):
        raise RuntimeError("Nano is not pinned to an immutable SHA-256 digest")
    if sha256_file(PYTHON_STACK / "uv.lock") != lock["pythonStack"]["lockSha256"]:
        raise RuntimeError("Python uv.lock does not match runtime-components.lock.json")
    locked = tomllib.loads((PYTHON_STACK / "uv.lock").read_text(encoding="utf-8"))
    versions = {package["name"]: package["version"] for package in locked["package"]}
    if versions.get("pyexasol") != lock["pythonStack"]["pyexasolVersion"]:
        raise RuntimeError("PyExasol version differs between uv.lock and the component lock")
    if versions.get("exasol-mcp-server") != lock["pythonStack"]["mcpServerVersion"]:
        raise RuntimeError("MCP server version differs between uv.lock and the component lock")
    rust_sources = "\n".join(path.read_text(encoding="utf-8") for path in (ROOT / "apps/desktop/src-tauri/src").glob("*.rs"))
    if re.search(r"releases/download/v?\d|@sha256:[0-9a-f]{64}", rust_sources):
        raise RuntimeError("Release versions or digests must not be embedded in Rust source")
    print("Runtime component lock and vendored bundles are consistent.")


def verify_platform_artifacts() -> None:
    sources = load_json(SOURCES_PATH)
    lock = load_json(LOCK_PATH)
    os_name = {"Darwin": "macos", "Linux": "linux", "Windows": "windows"}.get(platform.system())
    arch = {"arm64": "aarch64", "aarch64": "aarch64", "AMD64": "x86_64", "x86_64": "x86_64"}.get(platform.machine())
    if not os_name or not arch:
        raise RuntimeError(f"Unsupported validation platform: {platform.system()}/{platform.machine()}")
    key = f"{os_name}-{arch}"
    names = ["uv", "exapump"] + (["personal"] if os_name == "macos" else [])
    with tempfile.TemporaryDirectory() as folder:
        temporary = Path(folder)
        for name in names:
            artifact = lock[name]["artifacts"].get(key)
            if artifact is None:
                raise RuntimeError(f"{name} has no artifact for supported platform {key}")
            payload = request(artifact["url"], accept="application/octet-stream")
            if sha256_bytes(payload) != artifact["sha256"]:
                raise RuntimeError(f"{name} archive checksum failed for {key}")
            executable = sources["githubReleases"][name].get("executable", name)
            binary = executable_bytes(payload, artifact["name"], executable)
            expected_binary = artifact.get("executableSha256", artifact["sha256"])
            if sha256_bytes(binary) != expected_binary:
                raise RuntimeError(f"{name} executable checksum failed for {key}")
            suffix = ".exe" if os_name == "windows" else ""
            path = temporary / f"{name}{suffix}"
            path.write_bytes(binary)
            path.chmod(0o700)
            arguments = ["install", "--help"] if name == "personal" else ["--version"]
            result = subprocess.run([str(path), *arguments], capture_output=True, text=True, timeout=30)
            if result.returncode != 0:
                raise RuntimeError(f"{name} smoke test failed for {key}: {result.stderr.strip()}")
            if name == "personal" and "local" not in f"{result.stdout}\n{result.stderr}".lower():
                raise RuntimeError(f"Exasol Personal {key} does not advertise the required local preset")
    print(f"Verified and smoke-ran release artifacts for {key}.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true", help="verify checked-in generated state without network access")
    parser.add_argument("--verify-platform-artifacts", action="store_true", help="download, verify, and smoke-run this runner's artifacts")
    args = parser.parse_args()
    if args.verify_platform_artifacts:
        verify()
        verify_platform_artifacts()
    elif args.verify:
        verify()
    else:
        refresh()
        verify()


if __name__ == "__main__":
    main()
