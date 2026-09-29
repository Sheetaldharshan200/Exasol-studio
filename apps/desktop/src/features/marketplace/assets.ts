// Release-asset selection for marketplace installs — pure, so the platform
// rules are unit-tested. Two hazards this guards against, both seen in real
// Exasol releases: checksum/metadata files listed BEFORE the artifact
// (tableau-connector leads with error_code_report.json), and platform-specific
// projects with no build for the host (exa-postgres-interface is linux-only) —
// silently handing those the wrong file used to "install" a useless artifact.

import type { InstallSource, MarketEnv, ReleaseAsset } from "@/lib/ipc";

/** Checksums, signatures and metadata — never the artifact itself. */
const METADATA = /(\.sha256|\.sha1|\.md5|\.asc|\.sig|\.txt|\.json|(^|[^a-z])sha256sums?)$/i;

const OS_TOKENS: Record<string, string[]> = {
  macos: ["darwin", "macos", "apple", "osx", ".dmg"],
  windows: ["windows", "win32", "win64", "win-", "win_", ".exe", ".msi"],
  linux: ["linux", ".appimage", ".deb"],
};
const ALL_OS_TOKENS = [...new Set(Object.values(OS_TOKENS).flat())];

/** Pick the release asset that best matches the host platform — or, when the
 *  item names one by pattern, THAT asset.
 *
 *  A pattern must match exactly one artifact. Zero is a renamed upstream file
 *  and many is an ambiguous release (spark-connector ships five variants);
 *  both return null so the card says "unavailable" rather than guessing.
 *  Without a pattern, platform rules apply, and null means the release is
 *  platform-specific but ships no build for this host. */
export function pickAsset(assets: ReleaseAsset[], env: MarketEnv | null, pattern?: string): ReleaseAsset | null {
  const artifacts = assets.filter((a) => !METADATA.test(a.name.toLowerCase()));
  if (!artifacts.length) return null;
  if (pattern) {
    let re: RegExp;
    try {
      re = new RegExp(pattern);
    } catch {
      return null;
    }
    const hits = artifacts.filter((a) => re.test(a.name));
    return hits.length === 1 ? hits[0] : null;
  }
  if (!env) return artifacts[0];
  const osTokens = OS_TOKENS[env.os] ?? OS_TOKENS.linux;
  const archTokens = env.arch === "aarch64" ? ["arm64", "aarch64"] : ["x86_64", "amd64", "x64"];
  const has = (name: string, tokens: string[]) => tokens.some((t) => name.includes(t));
  const byOsArch = artifacts.find((a) => has(a.name.toLowerCase(), osTokens) && has(a.name.toLowerCase(), archTokens));
  if (byOsArch) return byOsArch;
  // Same OS but another architecture is not a fallback — review found this
  // handing an aarch64 host the x86_64 build. Only an OS build that names no
  // architecture at all (a universal binary, a script) may stand in.
  const ANY_ARCH = ["arm64", "aarch64", "x86_64", "amd64", "x64", "i386", "i686"];
  const byOs = artifacts.find((a) => has(a.name.toLowerCase(), osTokens) && !has(a.name.toLowerCase(), ANY_ARCH));
  if (byOs) return byOs;
  if (artifacts.some((a) => has(a.name.toLowerCase(), osTokens))) return null;
  // Platform-tagged release with nothing for this host → no honest pick.
  const platformSpecific = artifacts.some((a) => has(a.name.toLowerCase(), ALL_OS_TOKENS));
  if (platformSpecific) return null;
  // Platform-neutral artifact (a plugin zip, a .taco, a jar) — take the first.
  return artifacts[0];
}

/** The pattern an item's coordinate names, if it names one. */
export function assetPatternOf(source: InstallSource | undefined): string | undefined {
  if (source?.kind === "gh-asset" || source?.kind === "host-plugin" || source?.kind === "deliver") return source.assetPattern;
  return undefined;
}

/** Whether an install can only proceed with a file from the release — so a
 *  release that has files, but none for this host, means "unavailable". A
 *  delivered source archive or dbt package needs only the tag. */
export function needsReleaseAsset(item: { install: string; source?: InstallSource }): boolean {
  if (item.install === "binary" || item.install === "host-plugin") return true;
  return item.source?.kind === "deliver" && item.source.format !== "source" && item.source.format !== "dbt-package";
}

/** `pickAsset` for a catalogue item: its own pattern if it has one, else the
 *  platform rules. Every caller goes through this so an item cannot be picked
 *  for by platform when its coordinate said which file. */
export function pickAssetFor(item: { source?: InstallSource }, assets: ReleaseAsset[], env: MarketEnv | null): ReleaseAsset | null {
  return pickAsset(assets, env, assetPatternOf(item.source));
}
