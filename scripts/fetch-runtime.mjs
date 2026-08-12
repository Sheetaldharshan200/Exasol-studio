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
  "aarch64-apple-darwin": { node: "darwin-arm64", nodeExt: "tar.gz", llama: "-bin-macos-arm64.", llamaExt: "tar.gz", exa: "opencode-darwin-arm64.zip" },
  "x86_64-apple-darwin": { node: "darwin-x64", nodeExt: "tar.gz", llama: "-bin-macos-x64.", llamaExt: "tar.gz", exa: "opencode-darwin-x64.zip" },
  "x86_64-unknown-linux-gnu": { node: "linux-x64", nodeExt: "tar.gz", llama: "-bin-ubuntu-x64.", llamaExt: "tar.gz", exa: "opencode-linux-x64.tar.gz" },
  "aarch64-unknown-linux-gnu": { node: "linux-arm64", nodeExt: "tar.gz", llama: "-bin-ubuntu-arm64.", llamaExt: "tar.gz", exa: "opencode-linux-arm64.tar.gz" },
  "x86_64-pc-windows-msvc": { node: "win-x64", nodeExt: "zip", llama: "-bin-win-cpu-x64.", llamaExt: "zip", exa: "opencode-windows-x64.zip" },
  "aarch64-pc-windows-msvc": { node: "win-arm64", nodeExt: "zip", llama: "-bin-win-cpu-arm64.", llamaExt: "zip", exa: "opencode-windows-arm64.zip" },
};

// Pinned Exa engine (opencode) — the SAME source of truth as the Marketplace
// component (catalog.json exa-agent.latest). Bumping here bundles a newer
// baseline; the component-update flow can still move users past it at runtime.
const EXA_ENGINE_TAG = "v1.18.12-exa.5";

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
 *  the redirect from /releases/latest, which isn't rate-limited). */
async function latestLlamaAsset(fragment, ext) {
  const r = await fetch("https://github.com/ggml-org/llama.cpp/releases/latest", { redirect: "manual" });
  const loc = r.headers.get("location") ?? "";
  const tag = loc.split("/").pop();
  if (!tag) throw new Error("could not resolve llama.cpp latest tag");
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

  // ── Exa engine (opencode) — baseline for offline first run ──
  console.log(`Fetching Exa engine (opencode ${EXA_ENGINE_TAG})…`);
  const exaArchive = join(tmp, spec.exa);
  mkdirSync(tmp, { recursive: true });
  await download(`https://github.com/Sheetaldharshan200/exa/releases/download/${EXA_ENGINE_TAG}/${spec.exa}`, exaArchive);
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
        else if (e.name === "opencode") await chmod(p, 0o755).catch(() => {});
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
