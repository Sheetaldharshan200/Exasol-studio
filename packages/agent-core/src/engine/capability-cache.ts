/**
 * Per-model capability cache (exa-agent-v2, task 2.3). Local models vary in
 * tool-calling support; probing every turn is wasteful and probing is I/O. The
 * cache (pure) records what a one-time probe found, with TTL expiry and
 * explicit invalidation, so the agent can pick answer-only vs tool mode
 * honestly without re-probing constantly. The probe itself lives in the
 * provider layer; only the bookkeeping is here.
 */

export type ModelCapabilities = { toolCall: boolean; probedAt: number };

export type CapabilityCache = Map<string, ModelCapabilities>;

/** `${runtimeId}/${modelId}` — the stable key a capability is cached under. */
export function capKey(runtimeId: string, modelId: string): string {
  return `${runtimeId}/${modelId}`;
}

export function createCapabilityCache(): CapabilityCache {
  return new Map();
}

/** Cached capabilities if present and not older than ttlMs; else null (probe). */
export function getCapabilities(
  cache: CapabilityCache,
  key: string,
  now: number,
  ttlMs: number,
): ModelCapabilities | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (now - hit.probedAt > ttlMs) {
    cache.delete(key); // stale — force a re-probe
    return null;
  }
  return hit;
}

export function setCapabilities(cache: CapabilityCache, key: string, toolCall: boolean, now: number): void {
  cache.set(key, { toolCall, probedAt: now });
}

/** Invalidate one model, one runtime's models, or everything (model swap /
 *  runtime restart / manual refresh). */
export function invalidate(cache: CapabilityCache, opts?: { key?: string; runtimeId?: string }): void {
  if (!opts) return cache.clear();
  if (opts.key) return void cache.delete(opts.key);
  if (opts.runtimeId) {
    const prefix = `${opts.runtimeId}/`;
    for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
  }
}
