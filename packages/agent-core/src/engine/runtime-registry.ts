/**
 * Pure runtime-discovery helpers for the Local Runtime layer (exa-agent-v2,
 * tasks 2.1/2.2). The network probe (fetch to :11434 / :1234 / a user URL) is
 * thin I/O in providers.ts; the SHAPE parsing, dedupe, and the local→in-DB→
 * cloud provider ranking are pure and tested here — the untested inline
 * parsing in providers.ts adopts these.
 */

export type RuntimeKind = "ollama" | "openai-compatible";

export type RuntimeModel = { id: string; name: string };

export type DiscoveredRuntime = {
  /** Stable id (server slug or a hash of the URL for user endpoints). */
  id: string;
  label: string;
  kind: RuntimeKind;
  baseUrl: string;
  models: RuntimeModel[];
};

/**
 * Parse a runtime's model-list response into models, tolerating both shapes:
 *  - Ollama `/api/tags`  → { models: [{ name, model }] }
 *  - OpenAI `/v1/models` → { data: [{ id }] }
 * Anything without a usable id is dropped; a non-object body yields [].
 */
export function parseModelList(kind: RuntimeKind, body: unknown): RuntimeModel[] {
  if (!body || typeof body !== "object") return [];
  const b = body as { models?: unknown; data?: unknown };
  const rows: unknown[] = kind === "ollama" ? (Array.isArray(b.models) ? b.models : []) : Array.isArray(b.data) ? b.data : [];
  const out: RuntimeModel[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const id = String(kind === "ollama" ? (o.model ?? o.name ?? "") : (o.id ?? "")).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = String((o.name ?? o.id ?? id) as unknown).trim() || id;
    out.push({ id, name });
  }
  return out;
}

/** True when a probe response body looks like the runtime it claims to be —
 *  guards against listing an unrelated service that happens to answer a port. */
export function looksLikeRuntime(kind: RuntimeKind, body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return kind === "ollama" ? Array.isArray(b.models) : Array.isArray(b.data);
}

/** Merge discovered runtimes by baseUrl (last write wins), dropping blanks. */
export function dedupeRuntimes(runtimes: readonly DiscoveredRuntime[]): DiscoveredRuntime[] {
  const byUrl = new Map<string, DiscoveredRuntime>();
  for (const r of runtimes) {
    const key = r.baseUrl.replace(/\/+$/, "");
    if (key) byUrl.set(key, r);
  }
  return [...byUrl.values()];
}

export type RankableProvider = { id: string; kind: "cloud" | "local" | "in-db" };

/**
 * The local-first provider hierarchy (local-runtime spec): (1) Local Runtime,
 * (2) In-DB AI, (3) cloud. Stable within a tier (input order preserved), so a
 * cloud provider can never sort above a local one.
 */
export function rankProviders<T extends RankableProvider>(providers: readonly T[]): T[] {
  const tier = (k: RankableProvider["kind"]) => (k === "local" ? 0 : k === "in-db" ? 1 : 2);
  return providers
    .map((p, i) => ({ p, i }))
    .sort((a, b) => tier(a.p.kind) - tier(b.p.kind) || a.i - b.i)
    .map(({ p }) => p);
}

/**
 * The default provider/model on first run: the first ranked provider that is
 * actually usable (a local runtime with models, or in-db). Cloud is NEVER the
 * silent default — it is returned only when nothing local/in-db is usable AND
 * the caller explicitly allows a cloud fallback.
 */
export function pickDefaultProvider<T extends RankableProvider & { models?: unknown[] }>(
  providers: readonly T[],
  opts: { allowCloudFallback: boolean } = { allowCloudFallback: false },
): T | null {
  const ranked = rankProviders(providers);
  const usable = ranked.filter((p) => p.kind !== "cloud" && (p.kind === "in-db" || (p.models?.length ?? 0) > 0));
  if (usable.length > 0) return usable[0];
  return opts.allowCloudFallback ? (ranked.find((p) => p.kind === "cloud") ?? null) : null;
}
