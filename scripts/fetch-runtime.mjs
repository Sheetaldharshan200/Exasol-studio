#!/usr/bin/env node
// Fetch the platform runtime (Node + llama.cpp engine) into the Tauri bundle
// resources so a shipped app needs ZERO runtime downloads.
//
//   node scripts/fetch-runtime.mjs <rust-target-triple>
//
// This is the ONLY place platform specifics live. Adding a new platform (e.g.
// a future Windows arm64 build) means adding one row to TARGETS below and a
// matrix entry in .github/workflows/release-app.yml — never any app code. The
// Rust side resolves whatever lands in resources/runtime/ generically, and
// falls back to system Node + on-demand engine download when it's absent (so
// local dev builds don't need this).

import { createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { chmod, readdir, rename, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { pipeline } from "node:stream/promises";

// v24 LTS (Krypton): its bundled SQLite is compiled WITH fts5, so the agent's
// KnowledgeGraph gets real full-text search. v22 shipped SQLite without fts5
// (the KB falls back to LIKE there — see packages/agent-core/src/kb.ts).
const NODE_VERSION = "v24.18.0"; // pinned; bump to move every platform at once

// One row per Rust target triple. node = nodejs.org dist slug; llama =
// substring that identifies the llama.cpp release asset for this platform.
const TARGETS = {
  "aarch64-apple-darwin": { node: "darwin-arm64", nodeExt: "tar.gz", llama: "-bin-macos-arm64.", llamaExt: "tar.gz", exa: "exa-darwin-arm64.zip" },
  "x86_64-apple-darwin": { node: "darwin-x64", nodeExt: "tar.gz", llama: "-bin-macos-x64.", llamaExt: "tar.gz", exa: "exa-darwin-x64.zip" },
  "x86_64-unknown-linux-gnu": { node: "linux-x64", nodeExt: "tar.gz", llama: "-bin-ubuntu-x64.", llamaExt: "tar.gz", exa: "exa-linux-x64.tar.gz" },
  "aarch64-unknown-linux-gnu": { node: "linux-arm64", nodeExt: "tar.gz", llama: "-bin-ubuntu-arm64.", llamaExt: "tar.gz", exa: "exa-linux-arm64.tar.gz" },
  "x86_64-pc-windows-msvc": { node: "win-x64", nodeExt: "zip", llama: "-bin-win-cpu-x64.", llamaExt: "zip", exa: "exa-windows-x64.zip" },
  "aarch64-pc-windows-msvc": { node: "win-arm64", nodeExt: "zip", llama: "-bin-win-cpu-arm64.", llamaExt: "zip", exa: "exa-windows-arm64.zip" },
};

// Pinned Exa engine (opencode) — the SAME source of truth as the Marketplace
// component (catalog.json exa-agent.latest). Bumping here bundles a newer
// baseline; the component-update flow can still move users past it at runtime.
// Resolved at build time from the engine repo's latest release — the bundled
// baseline is only the offline fallback, so it should be as current as the
// build that carries it.
/** Newest exa-engine release that actually CARRIES the wanted asset. A tag
 *  push creates the release entry minutes before its binaries finish
 *  uploading — resolving blindly to "latest" raced that window and 404'd
 *  whole release builds (v2026.6.0 and v2026.6.1 both hit it). */
async function latestEngineTag(assetName) {
  // Authenticate on api.github.com when a token is around: shared Actions
  // runner IPs exhaust the unauthenticated 60/h limit constantly (v2026.7.0
  // failed its whole first build on a 403 here). Token goes ONLY to the API
  // host — never to download URLs, whose S3 redirects reject auth headers.
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const res = await fetch("https://api.github.com/repos/Sheetaldharshan200/exa-engine/releases?per_page=5", {
    headers: { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error(`could not resolve latest exa-engine release: ${res.status}`);
  const releases = await res.json();
  for (const rel of releases) {
    if (!rel.tag_name || rel.draft) continue;
    if (!assetName || (rel.assets ?? []).some((a) => a.name === assetName)) return rel.tag_name;
    process.stdout.write(`  … skipping ${rel.tag_name}: ${assetName} not uploaded yet\n`);
  }
  throw new Error(`no exa-engine release carries ${assetName ?? "a tag"}`);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtimeDir = join(root, "apps/desktop/src-tauri/resources/runtime");

async function download(url, dest) {
  process.stdout.write(`  ↓ ${url}\n`);
  const res = await fetch(url, { redirect: "follow", headers: { Accept: "application/octet-stream" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  await pipeline(res.body, createWriteStream(dest));
}

function extract(archive, dir) {
  if (archive.endsWith(".zip")) {
    // `tar` on Windows/macOS/Linux runners all handle zip via -xf.
    execFileSync("tar", ["-xf", archive, "-C", dir], { stdio: "inherit" });
  } else {
    execFileSync("tar", ["-xzf", archive, "-C", dir], { stdio: "inherit" });
  }
}

/** Find the newest llama.cpp release asset URL for this platform (no API — use
 *  the redirect from /releases/latest, which isn't rate-limited).
 *
 *  llama.cpp's "latest" is now a semver marker release (e.g. v0.3.0) whose only
 *  asset is nightly-tag.txt naming the blessed `b####` build tag — the b-tags
 *  are where the per-platform binaries actually live. Older behavior (latest
 *  IS a b-tag) still works. */
async function latestLlamaAsset(fragment, ext) {
  const r = await fetch("https://github.com/ggml-org/llama.cpp/releases/latest", { redirect: "manual" });
  const loc = r.headers.get("location") ?? "";
  let tag = loc.split("/").pop();
  if (!tag) throw new Error("could not resolve llama.cpp latest tag");
  if (!/^b\d+$/.test(tag)) {
    const nightly = await fetch(`https://github.com/ggml-org/llama.cpp/releases/download/${tag}/nightly-tag.txt`);
    if (!nightly.ok) throw new Error(`llama.cpp latest (${tag}) is not a build tag and has no nightly-tag.txt`);
    tag = (await nightly.text()).trim();
    if (!/^b\d+$/.test(tag)) throw new Error(`nightly-tag.txt named an unexpected tag: "${tag}"`);
  }
  const name = `llama-${tag}${fragment}${ext}`;
  return `https://github.com/ggml-org/llama.cpp/releases/download/${tag}/${name}`;
}

async function firstDir(parent) {
  for (const e of await readdir(parent, { withFileTypes: true })) {
    if (e.isDirectory()) return join(parent, e.name);
  }
  return parent;
}

async function main() {
  const target = process.argv[2];
  const spec = TARGETS[target];
  if (!spec) {
    console.error(`Unknown target "${target}". Known: ${Object.keys(TARGETS).join(", ")}`);
    process.exit(1);
  }
  rmSync(runtimeDir, { recursive: true, force: true });
  mkdirSync(runtimeDir, { recursive: true });
  const tmp = join(runtimeDir, ".tmp");
  mkdirSync(tmp, { recursive: true });

  // ── Node runtime ──
  console.log(`Fetching Node ${NODE_VERSION} (${spec.node})…`);
  const nodeName = `node-${NODE_VERSION}-${spec.node}`;
  const nodeArchive = join(tmp, `node.${spec.nodeExt}`);
  await download(`https://nodejs.org/dist/${NODE_VERSION}/${nodeName}.${spec.nodeExt}`, nodeArchive);
  extract(nodeArchive, tmp);
  await rename(join(tmp, nodeName), join(runtimeDir, "node"));

  // ── llama.cpp engine ──
  console.log("Fetching llama.cpp engine…");
  const llamaUrl = await latestLlamaAsset(spec.llama, spec.llamaExt);
  const llamaArchive = join(tmp, `llama.${spec.llamaExt}`);
  await download(llamaUrl, llamaArchive);
  const llamaDir = join(runtimeDir, "llama");
  mkdirSync(llamaDir, { recursive: true });
  extract(llamaArchive, llamaDir);

  // ── Exa engine — baseline for offline first run ──
  const engineTag = await latestEngineTag(spec.exa);
  console.log(`Fetching Exa engine (${engineTag})…`);
  const exaArchive = join(tmp, spec.exa);
  mkdirSync(tmp, { recursive: true });
  await download(`https://github.com/Sheetaldharshan200/exa-engine/releases/download/${engineTag}/${spec.exa}`, exaArchive);
  const exaDir = join(runtimeDir, "exa-engine");
  mkdirSync(exaDir, { recursive: true });
  extract(exaArchive, exaDir);

  rmSync(tmp, { recursive: true, force: true });

  // Executable bits (extraction can drop them on some runners).
  if (!target.includes("windows")) {
    const nodeBin = join(runtimeDir, "node", "bin", "node");
    if (existsSync(nodeBin)) await chmod(nodeBin, 0o755);
    async function chmodTree(d) {
      for (const e of await readdir(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) await chmodTree(p);
        else if (/llama-|\.(so|dylib)/.test(e.name)) await chmod(p, 0o755).catch(() => {});
      }
    }
    await chmodTree(llamaDir).catch(() => {});
    // The opencode binary lands somewhere under exa-engine/ — chmod any match.
    async function chmodExa(d) {
      for (const e of await readdir(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) await chmodExa(p);
        else if (e.name === "exa" || e.name === "opencode") await chmod(p, 0o755).catch(() => {});
      }
    }
    await chmodExa(join(runtimeDir, "exa-engine")).catch(() => {});
  }

  const nodeOut = await firstDir(join(runtimeDir, "node")).catch(() => "");
  console.log(`✓ runtime staged in ${runtimeDir}`);
  console.log(`  node → ${join(runtimeDir, "node")}`);
  console.log(`  llama → ${llamaDir}`);
  void nodeOut;
  void stat;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
