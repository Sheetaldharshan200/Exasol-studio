// Release-asset selection for marketplace installs — pure, so the platform
// rules are unit-tested. Two hazards this guards against, both seen in real
// Exasol releases: checksum/metadata files listed BEFORE the artifact
// (tableau-connector leads with error_code_report.json), and platform-specific
// projects with no build for the host (exa-postgres-interface is linux-only) —
// silently handing those the wrong file used to "install" a useless artifact.

import type { MarketEnv, ReleaseAsset } from "@/lib/ipc";

/** Checksums, signatures and metadata — never the artifact itself. */
const METADATA = /(\.sha256|\.sha1|\.md5|\.asc|\.sig|\.txt|\.json|(^|[^a-z])sha256sums?)$/i;

const OS_TOKENS: Record<string, string[]> = {
  macos: ["darwin", "macos", "apple", "osx"],
  windows: ["windows", "win32", "win64", ".exe", ".msi"],
  linux: ["linux"],
};
const ALL_OS_TOKENS = [...new Set(Object.values(OS_TOKENS).flat())];

/** Pick the release asset that best matches the host platform.
 *  Returns null when the release is platform-specific but ships no build for
 *  this host — the UI then says so instead of downloading the wrong binary. */
export function pickAsset(assets: ReleaseAsset[], env: MarketEnv | null): ReleaseAsset | null {
  const artifacts = assets.filter((a) => !METADATA.test(a.name.toLowerCase()));
  if (!artifacts.length) return null;
  if (!env) return artifacts[0];
  const osTokens = OS_TOKENS[env.os] ?? OS_TOKENS.linux;
  const archTokens = env.arch === "aarch64" ? ["arm64", "aarch64"] : ["x86_64", "amd64", "x64"];
  const has = (name: string, tokens: string[]) => tokens.some((t) => name.includes(t));
  const byOsArch = artifacts.find((a) => has(a.name.toLowerCase(), osTokens) && has(a.name.toLowerCase(), archTokens));
  if (byOsArch) return byOsArch;
  const byOs = artifacts.find((a) => has(a.name.toLowerCase(), osTokens));
  if (byOs) return byOs;
  // Platform-tagged release with nothing for this host → no honest pick.
  const platformSpecific = artifacts.some((a) => has(a.name.toLowerCase(), ALL_OS_TOKENS));
  if (platformSpecific) return null;
  // Platform-neutral artifact (a plugin zip, a .taco, a jar) — take the first.
  return artifacts[0];
}
