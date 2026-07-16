import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { ConfigStore } from "./config.ts";
import { log } from "./log.ts";

// ---------------------------------------------------------------------------
// Model catalog: models.dev (fetched + cached) with an embedded fallback so
// the agent works offline on first run. Local servers (Ollama, LM Studio) are
// auto-detected and need no catalog at all.
// ---------------------------------------------------------------------------

export type ModelInfo = {
  id: string;
  name: string;
  context?: number;
  toolCall?: boolean;
  reasoning?: boolean;
  /** Model accepts image input (from models.dev modalities). */
  image?: boolean;
};

export type ProviderInfo = {
  id: string;
  name: string;
  /** "local" providers are detected servers on this machine. */
  kind: "cloud" | "local";
  /** Cloud providers need a key; local ones are ready when detected. */
  configured: boolean;
  /** For local providers: whether the server is currently reachable. */
  running?: boolean;
  /** For local providers detected as installed but not running. */
  installedOnly?: boolean;
  envKey?: string;
  models: ModelInfo[];
};

const MODELS_DEV_URL = "https://models.dev/api.json";
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

/** Cloud providers we surface in the UI (all resolvable via AI SDK). */
const CLOUD_PROVIDERS: { id: string; name: string; envKey: string }[] = [
  { id: "anthropic", name: "Anthropic", envKey: "ANTHROPIC_API_KEY" },
  { id: "openai", name: "OpenAI", envKey: "OPENAI_API_KEY" },
  { id: "google", name: "Google", envKey: "GOOGLE_GENERATIVE_AI_API_KEY" },
  { id: "openrouter", name: "OpenRouter", envKey: "OPENROUTER_API_KEY" },
];

/** Offline fallback so the picker is never empty before the catalog loads. */
const EMBEDDED_CATALOG: Record<string, ModelInfo[]> = {
  anthropic: [
    { id: "claude-opus-4-8", name: "Claude Opus 4.8", context: 200_000, toolCall: true, reasoning: true, image: true },
    { id: "claude-sonnet-5", name: "Claude Sonnet 5", context: 200_000, toolCall: true, reasoning: true, image: true },
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", context: 200_000, toolCall: true },
  ],
  openai: [
    { id: "gpt-5", name: "GPT-5", context: 400_000, toolCall: true, reasoning: true, image: true },
    { id: "gpt-5-mini", name: "GPT-5 mini", context: 400_000, toolCall: true },
  ],
  google: [
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", context: 1_000_000, toolCall: true, reasoning: true, image: true },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", context: 1_000_000, toolCall: true, image: true },
  ],
  openrouter: [],
};

type LocalServer = { id: string; name: string; baseURL: string };
const LOCAL_SERVERS: LocalServer[] = [
  // Exasol Studio's managed llama-server (see local_llm.rs) — fixed port.
  { id: "builtin", name: "Built-in AI", baseURL: "http://127.0.0.1:41414/v1" },
  { id: "ollama", name: "Ollama (local)", baseURL: "http://127.0.0.1:11434/v1" },
  { id: "lmstudio", name: "LM Studio (local)", baseURL: "http://127.0.0.1:1234/v1" },
  { id: "llamacpp", name: "llama.cpp (local)", baseURL: "http://127.0.0.1:8080/v1" },
];

export class ProviderRegistry {
  private catalog: Record<string, ModelInfo[]> = EMBEDDED_CATALOG;
  private readonly catalogFile: string;

  constructor(private readonly config: ConfigStore) {
    this.catalogFile = join(config.dataDir, "models-catalog.json");
    this.loadCachedCatalog();
    void this.refreshCatalog();
  }

  // -- catalog ----------------------------------------------------------

  private loadCachedCatalog() {
    try {
      const raw = JSON.parse(readFileSync(this.catalogFile, "utf8")) as {
        fetchedAt: number;
        catalog: Record<string, ModelInfo[]>;
      };
      if (raw?.catalog) this.catalog = { ...EMBEDDED_CATALOG, ...raw.catalog };
    } catch {
      // No cache yet — embedded fallback stays active.
    }
  }

  private catalogFresh(): boolean {
    try {
      const raw = JSON.parse(readFileSync(this.catalogFile, "utf8")) as { fetchedAt: number };
      return Date.now() - raw.fetchedAt < CATALOG_TTL_MS;
    } catch {
      return false;
    }
  }

  /** Fetch models.dev and reduce it to the fields we care about. */
  async refreshCatalog() {
    if (this.catalogFresh()) return;
    try {
      const res = await fetch(MODELS_DEV_URL, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`models.dev ${res.status}`);
      const api = (await res.json()) as Record<
        string,
        { models?: Record<string, { name?: string; limit?: { context?: number }; tool_call?: boolean; reasoning?: boolean; status?: string; modalities?: { input?: string[] } }> }
      >;
      const next: Record<string, ModelInfo[]> = {};
      for (const p of CLOUD_PROVIDERS) {
        const models = api[p.id]?.models;
        if (!models) continue;
        next[p.id] = Object.entries(models)
          .filter(([, m]) => m.status !== "deprecated")
          .map(([id, m]) => ({
            id,
            name: m.name ?? id,
            context: m.limit?.context,
            toolCall: m.tool_call,
            reasoning: m.reasoning,
            image: Array.isArray(m.modalities?.input) ? m.modalities!.input!.includes("image") : undefined,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }
      this.catalog = { ...EMBEDDED_CATALOG, ...next };
      writeFileSync(this.catalogFile, JSON.stringify({ fetchedAt: Date.now(), catalog: next }));
      log.info("models.dev catalog refreshed", { providers: Object.keys(next).length });
    } catch (e) {
      log.warn("models.dev fetch failed; using cached/embedded catalog", { error: String(e) });
    }
  }

  // -- local detection ---------------------------------------------------

  private async detectLocal(server: LocalServer): Promise<ProviderInfo | null> {
    // Ollama has a richer native API; the others are OpenAI-compatible.
    const probe = server.id === "ollama" ? "http://127.0.0.1:11434/api/tags" : `${server.baseURL}/models`;
    try {
      const res = await fetch(probe, { signal: AbortSignal.timeout(1_200) });
      if (!res.ok) return null;
      const body = (await res.json()) as { models?: { name?: string; model?: string }[]; data?: { id: string }[] };
      const models: ModelInfo[] = (
        server.id === "ollama"
          ? (body.models ?? []).map((m) => ({ id: m.model ?? m.name ?? "", name: m.name ?? m.model ?? "" }))
          : (body.data ?? []).map((m) => ({ id: m.id, name: m.id }))
      ).filter((m) => m.id);
      return {
        id: server.id,
        name: server.name,
        kind: "local",
        configured: true,
        running: true,
        models,
      };
    } catch {
      return null;
    }
  }

  /** Ollama installed but server not running → still worth surfacing. */
  private async ollamaInstalledOnly(): Promise<ProviderInfo | null> {
    const { access } = await import("node:fs/promises");
    for (const p of ["/usr/local/bin/ollama", "/opt/homebrew/bin/ollama"]) {
      try {
        await access(p);
        return {
          id: "ollama",
          name: "Ollama (local)",
          kind: "local",
          configured: true,
          running: false,
          installedOnly: true,
          models: [],
        };
      } catch {
        // keep looking
      }
    }
    return null;
  }

  // -- public API --------------------------------------------------------

  async list(): Promise<ProviderInfo[]> {
    const cfg = this.config.get();
    const out: ProviderInfo[] = [];

    const locals = await Promise.all(LOCAL_SERVERS.map((s) => this.detectLocal(s)));
    let sawOllama = false;
    for (const l of locals) {
      if (l) {
        out.push(l);
        if (l.id === "ollama") sawOllama = true;
      }
    }
    if (!sawOllama) {
      const installed = await this.ollamaInstalledOnly();
      if (installed) out.push(installed);
    }

    for (const p of CLOUD_PROVIDERS) {
      const hasKey = Boolean(cfg.providers[p.id]?.apiKey || process.env[p.envKey]);
      out.push({
        id: p.id,
        name: p.name,
        kind: "cloud",
        configured: hasKey,
        envKey: p.envKey,
        models: this.catalog[p.id] ?? [],
      });
    }

    // User-declared custom providers (any OpenAI-compatible endpoint), incl.
    // the In-Database / Enterprise AI endpoint an org hosts on its own cluster.
    for (const [id, pc] of Object.entries(cfg.providers)) {
      if (out.some((o) => o.id === id) || !pc.baseURL) continue;
      out.push({
        id,
        name: id === "in-database" ? "In-Database / Enterprise AI" : id,
        kind: pc.baseURL.includes("127.0.0.1") || pc.baseURL.includes("localhost") ? "local" : "cloud",
        configured: true,
        models: (pc.models ?? []).map((m) => ({ id: m.id, name: m.name ?? m.id, context: m.context })),
      });
    }

    return out;
  }

  /** Context window (tokens) for a model ref; sensible local defaults. */
  contextFor(modelRef: string): number {
    const slash = modelRef.indexOf("/");
    const providerId = modelRef.slice(0, slash);
    const modelId = modelRef.slice(slash + 1);
    const fromCatalog = this.catalog[providerId]?.find((m) => m.id === modelId)?.context;
    if (fromCatalog) return fromCatalog;
    // Local servers: builtin runs llama-server with -c 16384; Ollama defaults
    // vary — 16k is a safe floor that triggers compaction before truncation.
    return 16_000;
  }

  /** Whether the model accepts image input (unknown local models → false). */
  supportsImages(modelRef: string): boolean {
    const slash = modelRef.indexOf("/");
    if (slash < 0) return false;
    const providerId = modelRef.slice(0, slash);
    const modelId = modelRef.slice(slash + 1);
    return this.catalog[providerId]?.find((m) => m.id === modelId)?.image === true;
  }

  /** Resolve "provider/model_id" into an AI SDK LanguageModel. */
  resolve(modelRef: string): LanguageModel {
    const slash = modelRef.indexOf("/");
    if (slash < 0) throw new Error(`Model must be "provider/model", got "${modelRef}"`);
    const providerId = modelRef.slice(0, slash);
    const modelId = modelRef.slice(slash + 1);
    const cfg = this.config.get();
    const pc = cfg.providers[providerId] ?? {};

    switch (providerId) {
      case "anthropic":
        return createAnthropic({ apiKey: pc.apiKey ?? process.env.ANTHROPIC_API_KEY })(modelId);
      case "openai":
        return createOpenAI({ apiKey: pc.apiKey ?? process.env.OPENAI_API_KEY })(modelId);
      case "google":
        return createGoogleGenerativeAI({ apiKey: pc.apiKey ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY })(modelId);
      case "openrouter":
        return createOpenAICompatible({
          name: "openrouter",
          baseURL: "https://openrouter.ai/api/v1",
          apiKey: pc.apiKey ?? process.env.OPENROUTER_API_KEY,
        })(modelId);
      case "builtin":
      case "ollama":
      case "lmstudio":
      case "llamacpp": {
        const base = pc.baseURL ?? LOCAL_SERVERS.find((s) => s.id === providerId)!.baseURL;
        return createOpenAICompatible({ name: providerId, baseURL: base })(modelId);
      }
      default: {
        if (!pc.baseURL) throw new Error(`Unknown provider "${providerId}"`);
        return createOpenAICompatible({ name: providerId, baseURL: pc.baseURL, apiKey: pc.apiKey })(modelId);
      }
    }
  }
}
