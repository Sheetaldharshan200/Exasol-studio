/**
 * Provider catalog mapping (exa-agent-v2): slim the models.dev catalog (the
 * the canonical public catalog — 200+ providers) into what the connect
 * UI needs, with the popular providers pinned first. Pure; tested in
 * catalog-map.test.ts.
 */

export type CatalogProvider = {
  id: string;
  name: string;
  /** Env var(s) that carry the API key, e.g. ["OPENAI_API_KEY"]. */
  env: string[];
  modelCount: number;
  popular: boolean;
};

/** Pinned first, in this order (the providers our users actually reach for). */
const POPULAR = ["ollama", "lmstudio", "openai", "google", "openrouter", "anthropic", "groq", "github-copilot"];

type RawCatalog = Record<string, { name?: string; env?: string[]; models?: Record<string, unknown> } | undefined>;

/** Map + sort the raw models.dev object: popular first, then A–Z by name. */
export function mapCatalog(raw: RawCatalog): CatalogProvider[] {
  const out: CatalogProvider[] = [];
  for (const [id, p] of Object.entries(raw)) {
    if (!p || typeof p !== "object") continue;
    out.push({
      id,
      name: p.name ?? id,
      env: Array.isArray(p.env) ? p.env : [],
      modelCount: p.models ? Object.keys(p.models).length : 0,
      popular: POPULAR.includes(id),
    });
  }
  return out.sort((a, b) => {
    const pa = POPULAR.indexOf(a.id);
    const pb = POPULAR.indexOf(b.id);
    if (pa !== -1 || pb !== -1) return (pa === -1 ? POPULAR.length : pa) - (pb === -1 ? POPULAR.length : pb);
    return a.name.localeCompare(b.name);
  });
}
