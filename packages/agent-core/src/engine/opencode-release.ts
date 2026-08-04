/**
 * opencode GitHub Releases as the source of truth for the Exa engine binary
 * (exa-agent-v2, task 1.1). The engine is a Marketplace component whose payload
 * is the opencode CLI/server release asset for this platform — fetched through
 * the same mirror mechanism as the other components. The platform→asset mapping
 * and version tagging are pure and tested here; the download/extract is I/O in
 * the component installer.
 *
 * Asset naming from anomalyco/opencode releases (verified v1.18.x):
 *   macOS   arm64 → opencode-darwin-arm64.zip     x64 → opencode-darwin-x64.zip
 *   Linux   arm64 → opencode-linux-arm64.tar.gz   x64 → opencode-linux-x64.tar.gz
 *   Windows arm64 → opencode-windows-arm64.zip     x64 → opencode-windows-x64.zip
 * (The `opencode-desktop-*` assets are their Electron app — NOT what we embed.)
 */

export const OPENCODE_REPO = "anomalyco/opencode";

/** Node's process.platform / process.arch, or any equivalent pair. */
export type Platform = { os: "darwin" | "linux" | "win32" | string; arch: "arm64" | "x64" | string };

/** The release asset filename for a platform, or null when unsupported. */
export function assetFor(p: Platform): string | null {
  const arch = p.arch === "arm64" ? "arm64" : p.arch === "x64" || p.arch === "x86_64" ? "x64" : null;
  if (!arch) return null;
  switch (p.os) {
    case "darwin":
      return `opencode-darwin-${arch}.zip`;
    case "linux":
      return `opencode-linux-${arch}.tar.gz`;
    case "win32":
    case "windows":
      return `opencode-windows-${arch}.zip`;
    default:
      return null;
  }
}

/** The binary's name inside the extracted archive. */
export function binaryName(os: Platform["os"]): string {
  return os === "win32" || os === "windows" ? "opencode.exe" : "opencode";
}

/** GitHub release download URL for a tag + asset. */
export function downloadUrl(tag: string, asset: string): string {
  return `https://github.com/${OPENCODE_REPO}/releases/download/${tag}/${asset}`;
}

/** Normalize a release tag to a comparable version ("v1.18.12" → "1.18.12"). */
export function versionFromTag(tag: string): string {
  return tag.trim().replace(/^v/i, "");
}
