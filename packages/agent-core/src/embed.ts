import { log } from "./log.ts";

// Lightweight embeddings for semantic recall (jcode-style ambient memory).
// Local-first: use Ollama's embedding endpoint when a model is present; else
// fall back to a deterministic hashed bag-of-words vector so recall ALWAYS
// works offline with zero extra dependencies or downloads.

const OLLAMA = "http://127.0.0.1:11434";
const EMBED_MODELS = ["nomic-embed-text", "mxbai-embed-large", "all-minilm", "bge-m3"];
const DIM = 384;

let ollamaModel: string | null | undefined; // undefined = not probed yet

async function detectOllamaEmbedder(): Promise<string | null> {
  if (ollamaModel !== undefined) return ollamaModel;
  ollamaModel = null;
  try {
    const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(800) });
    if (res.ok) {
      const body = (await res.json()) as { models?: { name?: string; model?: string }[] };
      const names = (body.models ?? []).map((m) => (m.model ?? m.name ?? "").toLowerCase());
      const hit = EMBED_MODELS.find((want) => names.some((n) => n.startsWith(want)));
      if (hit) ollamaModel = names.find((n) => n.startsWith(hit))!;
    }
  } catch {
    // no Ollama — hashed fallback
  }
  if (ollamaModel) log.info("embeddings: using Ollama", { model: ollamaModel });
  return ollamaModel;
}

/** Deterministic hashed bag-of-words embedding — lexical, offline, no deps. */
function hashedEmbed(text: string): number[] {
  const vec = new Array<number>(DIM).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
  for (const t of tokens) {
    let h = 2166136261;
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % DIM;
    const sign = (h & 1) === 0 ? 1 : -1;
    vec[idx] += sign;
  }
  return normalize(vec);
}

function normalize(v: number[]): number[] {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

export function cosine(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  return dot; // both sides are L2-normalized
}

/** Embed a batch of texts. Uses Ollama if available, else hashed fallback. */
export async function embed(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const model = await detectOllamaEmbedder();
  if (model) {
    try {
      const out: number[][] = [];
      for (const t of texts) {
        const res = await fetch(`${OLLAMA}/api/embeddings`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model, prompt: t }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`ollama ${res.status}`);
        const body = (await res.json()) as { embedding?: number[] };
        out.push(body.embedding?.length ? normalize(body.embedding) : hashedEmbed(t));
      }
      return out;
    } catch (e) {
      log.warn("ollama embed failed; using hashed fallback", { error: String(e) });
      ollamaModel = null; // stop retrying this session
    }
  }
  return texts.map(hashedEmbed);
}

export async function embedOne(text: string): Promise<number[]> {
  return (await embed([text]))[0];
}
