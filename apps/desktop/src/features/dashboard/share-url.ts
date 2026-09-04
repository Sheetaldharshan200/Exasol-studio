// Pure share-URL composition — dependency-free so it unit-tests without the
// browser ipc chain (share-manager.ts pulls in agent-client/ipc).

/** Compose the shareable URL from its parts, url-encoding id and token. */
export function shareUrl(s: { base: string; id: string; token: string }): string {
  return `${s.base}/s/${encodeURIComponent(s.id)}?t=${encodeURIComponent(s.token)}`;
}
