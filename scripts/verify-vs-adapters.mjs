#!/usr/bin/env node
/**
 * Check that every virtual-schema adapter can still find its artifact.
 *
 * Studio installs an adapter from its repository's LATEST release, picking the
 * artifact with the adapter's `release.asset` pattern. Nothing is pinned, which
 * is the point — an adapter released upstream is installable the same day — but
 * it does mean that pattern is the only thing between a user and a failed
 * install. If upstream renames an artifact, the install breaks with no code
 * change on our side, and nothing else would notice.
 *
 * So this asks GitHub what each repo's latest release actually contains and
 * fails when a pattern matches none of the assets, or more than one.
 *
 * Needs network and the `gh` CLI (for the API token). Run it manually, or on a
 * schedule — not in the unit-test suite, which is offline by design.
 *
 *   node scripts/verify-vs-adapters.mjs
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const DIR = path.join(import.meta.dirname, "../apps/desktop/src/features/connection/virtual-schemas/adapters");

/** Pull the three fields we need out of an adapter file. */
function readAdapter(file) {
  const src = readFileSync(path.join(DIR, file), "utf8");
  const pick = (re) => re.exec(src)?.[1];
  const raw = pick(/release:\s*\{\s*asset:\s*"((?:[^"\\]|\\.)*)"/);
  return {
    file,
    repo: pick(/repo:\s*"([^"]+)"/),
    runtime: pick(/runtime:\s*"([^"]+)"/),
    // The file holds a TypeScript string literal, so `\\d` on disk is `\d` in
    // the pattern. Reading it literally makes every pattern match nothing.
    asset: raw === undefined ? undefined : JSON.parse(`"${raw}"`),
  };
}

function latestRelease(repo) {
  const out = execFileSync("gh", ["api", `repos/${repo}/releases/latest`, "--jq", '{tag: .tag_name, assets: [.assets[].name]}'], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return JSON.parse(out);
}

const adapters = readdirSync(DIR)
  .filter((f) => f.endsWith(".ts") && f !== "index.ts" && !f.endsWith(".test.ts"))
  .map(readAdapter);

let failed = 0;
for (const a of adapters) {
  if (!a.repo) {
    console.error(`FAIL ${a.file}: no repo`);
    failed++;
    continue;
  }
  // A Lua adapter's source is inlined into the DDL — there is no artifact.
  if (a.runtime === "lua") {
    console.log(`ok   ${a.repo} — Lua, source inlined in DDL`);
    continue;
  }
  let release;
  try {
    release = latestRelease(a.repo);
  } catch {
    console.error(`FAIL ${a.repo}: no latest release to install from`);
    failed++;
    continue;
  }
  const hits = release.assets.filter((name) => new RegExp(a.asset).test(name));
  if (hits.length === 1) {
    console.log(`ok   ${a.repo} ${release.tag} → ${hits[0]}`);
    continue;
  }
  console.error(
    `FAIL ${a.repo} ${release.tag}: pattern /${a.asset}/ matched ${hits.length} of ${release.assets.length} assets` +
      `\n     assets: ${release.assets.join(", ")}`,
  );
  failed++;
}

console.log(`\n${adapters.length - failed}/${adapters.length} adapters resolve exactly one artifact.`);
process.exit(failed === 0 ? 0 : 1);
