// Pure update-detection shared by the Marketplace panel AND the background
// badge poller, so both agree on "an update is available" from the SAME source
// (the CI-generated catalog.json mirror + per-repo upstream tags). Kept free of
// React/ipc so it's unit-testable.


/** Catalog ids that are MANAGED components (updated via the Updates panel, not
 *  the addon list). Excluded from the addon-update count so a managed component
 *  is never counted twice. */
export const CATALOG_TO_COMPONENT: Record<string, string> = {
  "exasol-personal": "personal",
  exapump: "exapump",
  "mcp-server": "mcp-server",
  "semantic-views": "semantic-views",
  "exa-agent": "exa-agent",
};

/** True only when `remote` is a STRICTLY newer version than `local` (numeric
 *  segment compare; mirrors the Rust is_newer). Equal, older, or non-numeric
 *  versions return false — so a rolled-back or ahead install is never offered a
 *  "downgrade" disguised as an update. */
export function isNewerVersion(remote: string | null | undefined, local: string | null | undefined): boolean {
  if (!remote || !local) return false;
  const seg = (v: string) => v.replace(/^v/i, "").trim().split(/[.\-+]/).map((p) => (/^\d+$/.test(p) ? parseInt(p, 10) : NaN));
  const a = seg(remote);
  const b = seg(local);
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return false;
  const width = Math.max(a.length, b.length);
  for (let i = 0; i < width; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}
