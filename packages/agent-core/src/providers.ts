import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { ConfigStore } from "./config.ts";
import { log } from "./log.ts";
import { rankProviders } from "./engine/runtime-registry.ts";

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
  { id: "groq", name: "Groq", envKey: "GROQ_API_KEY" },
  { id: "openrouter", name: "OpenRouter", envKey: "OPENROUTER_API_KEY" },
];

/** Offline fallback so the picker is never empty before the catalog loads. */
/** Only actual chat LLMs belong in pickers — no embeddings, TTS/speech,
 * audio/realtime, image/video generation, moderation, or rerankers. */
const NON_LLM_MODEL = /embed|tts|speech|audio|whisper|transcrib|realtime|image|imagen|dall-?e|veo|sora|moderation|rerank|guard|ocr/i;
function filterCatalog(catalog: Record<string, ModelInfo[]>): Record<string, ModelInfo[]> {
  const out: Record<string, ModelInfo[]> = {};
  for (const [pid, models] of Object.entries(catalog)) {
    out[pid] = models.filter((m) => !NON_LLM_MODEL.test(m.id) && !NON_LLM_MODEL.test(m.name ?? ""));
  }
  return out;
}

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
  groq: [
    { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B (Groq)", context: 131_072, toolCall: true },
    { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant (Groq)", context: 131_072, toolCall: true },
    { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B (Groq)", context: 131_072, toolCall: true, reasoning: true },
    { id: "moonshotai/kimi-k2-instruct", name: "Kimi K2 (Groq)", context: 131_072, toolCall: true },
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
  // Ollama capabilities per model (from /api/show), cached so we probe each
  // model once. Any model the user pulls is classified accurately on next list.
  private ollamaCaps = new Map<string, { toolCall: boolean; image: boolean; context?: number }>();
  // Real, server-reported context window per local model ref (built-in via
  // /props, Ollama via /api/show). Keyed "providerId/modelId".
  private localContext = new Map<string, number>();

  private readonly config: ConfigStore;

  constructor(config: ConfigStore) {
    this.config = config;
    this.catalogFile = join(config.dataDir, "models-catalog.json");
    this.loadCachedCatalog();
    void this.refreshCatalog();
  }

  /** Ask Ollama what a model can do (tools/vision). Cached per model name. */
  private async ollamaCapabilities(
    name: string,
  ): Promise<{ toolCall: boolean; image: boolean; context?: number } | undefined> {
    const cached = this.ollamaCaps.get(name);
    if (cached) return cached;
    try {
      const res = await fetch("http://127.0.0.1:11434/api/show", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: name }),
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) return undefined;
      const body = (await res.json()) as {
        capabilities?: string[];
        model_info?: Record<string, unknown>;
        parameters?: string;
      };
      const caps = Array.isArray(body.capabilities) ? body.capabilities : [];
      // Context: the model's trained max (…context_length) capped by the
      // effective num_ctx if the Modelfile set one — so we never report more
      // than Ollama actually allocates and overflow it.
      const info = body.model_info ?? {};
      const ctxKey = Object.keys(info).find((k) => k.endsWith(".context_length"));
      const trained = ctxKey ? Number(info[ctxKey]) : undefined;
      const numCtxMatch = /(?:^|\n)\s*num_ctx\s+(\d+)/.exec(body.parameters ?? "");
      const numCtx = numCtxMatch ? Number(numCtxMatch[1]) : undefined;
      const context = numCtx ?? trained;
      const result = {
        toolCall: caps.includes("tools"),
        image: caps.includes("vision"),
        context: context && Number.isFinite(context) ? context : undefined,
      };
      this.ollamaCaps.set(name, result);
      return result;
    } catch {
      return undefined;
    }
  }

  /** llama-server exposes the exact allocated context at /props. */
  private async builtinContext(baseURL: string): Promise<number | undefined> {
    try {
      const res = await fetch(`${baseURL.replace(/\/v1$/, "")}/props`, { signal: AbortSignal.timeout(1500) });
      if (!res.ok) return undefined;
      const body = (await res.json()) as { default_generation_settings?: { n_ctx?: number }; n_ctx?: number };
      const n = body.default_generation_settings?.n_ctx ?? body.n_ctx;
      return typeof n === "number" && n > 0 ? n : undefined;
    } catch {
      return undefined;
    }
  }

  // -- catalog ----------------------------------------------------------

  private loadCachedCatalog() {
    try {
      const raw = JSON.parse(readFileSync(this.catalogFile, "utf8")) as {
        fetchedAt: number;
        catalog: Record<string, ModelInfo[]>;
      };
      // The junk filter must apply to CACHED catalogs too — a cache written
      // before the filter existed still carries whisper/tts/embedding models.
      if (raw?.catalog) this.catalog = filterCatalog({ ...EMBEDDED_CATALOG, ...raw.catalog });
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
        // Only actual chat LLMs belong in the picker: drop embeddings, TTS,
        // audio/realtime, image/video generation, moderation, and rerankers —
        // they can't run the agent and only clutter the lists.
        next[p.id] = Object.entries(models)
          .filter(([id, m]) => m.status !== "deprecated" && !NON_LLM_MODEL.test(id) && !NON_LLM_MODEL.test(m.name ?? ""))
          .filter(([, m]) => !Array.isArray(m.modalities?.input) || m.modalities!.input!.includes("text"))
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
      this.catalog = filterCatalog({ ...EMBEDDED_CATALOG, ...next });
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
      let models: ModelInfo[] = (
        server.id === "ollama"
          ? (body.models ?? []).map((m) => ({ id: m.model ?? m.name ?? "", name: m.name ?? m.model ?? "" }))
          : (body.data ?? []).map((m) => ({ id: m.id, name: m.id }))
      )
        .filter((m) => m.id)
        // The built-in engine runs llama-server with --jinja and we only ship
        // tool-capable GGUFs, so its models are known to support tool calling.
        .map((m) => (server.id === "builtin" ? { ...m, toolCall: true } : m));

      // Ollama reports real capabilities per model — use them so tool/vision
      // support is accurate for whatever the user has pulled.
      if (server.id === "ollama") {
        models = await Promise.all(
          models.map(async (m) => {
            const caps = await this.ollamaCapabilities(m.id);
            if (caps?.context) this.localContext.set(`ollama/${m.id}`, caps.context);
            return caps ? { ...m, toolCall: caps.toolCall, image: caps.image, context: caps.context } : m;
          }),
        );
      } else if (server.id === "builtin") {
        // Query the exact allocated window once; every built-in model shares it.
        const n = await this.builtinContext(server.baseURL);
        if (n) for (const m of models) this.localContext.set(`builtin/${m.id}`, n);
        models = models.map((m) => (n ? { ...m, context: n } : m));
      }
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

    // Local-first provider hierarchy (exa-agent-v2 local-runtime spec):
    // Local Runtime → In-DB AI → cloud, stable within each tier. Cloud never
    // sorts above a local runtime, so it is never the silent default.
    const ranked = rankProviders(
      out.map((p) => ({ id: p.id, kind: p.id === "in-database" ? ("in-db" as const) : p.kind, info: p })),
    );
    return ranked.map((r) => r.info);
  }

  /** Context window (tokens) for a model ref; sensible local defaults. */
  contextFor(modelRef: string): number {
    const slash = modelRef.indexOf("/");
    const providerId = modelRef.slice(0, slash);
    const modelId = modelRef.slice(slash + 1);
    const fromCatalog = this.catalog[providerId]?.find((m) => m.id === modelId)?.context;
    if (fromCatalog) return fromCatalog;
    // Local models: use the REAL server-reported window (built-in /props,
    // Ollama /api/show) discovered during detection, with ~6% headroom so
    // compaction fires before the engine's hard ceiling. Falls back to a safe
    // floor only if discovery hasn't run yet.
    const real = this.localContext.get(modelRef);
    if (real) return Math.max(4096, Math.floor(real * 0.94));
    return 8_000;
  }

  /** Whether the model accepts image input (unknown local models → false). */
  supportsImages(modelRef: string): boolean {
    const slash = modelRef.indexOf("/");
    if (slash < 0) return false;
    const providerId = modelRef.slice(0, slash);
    const modelId = modelRef.slice(slash + 1);
    return this.catalog[providerId]?.find((m) => m.id === modelId)?.image === true;
  }

  /**
   * Whether the model can call tools. Only a KNOWN false (e.g. Ollama caps
   * without "tools") disables them — unknown models get the benefit of the
   * doubt so custom providers aren't crippled.
   */
  supportsTools(modelRef: string): boolean {
    const slash = modelRef.indexOf("/");
    if (slash < 0) return true;
    const providerId = modelRef.slice(0, slash);
    const modelId = modelRef.slice(slash + 1);
    return this.catalog[providerId]?.find((m) => m.id === modelId)?.toolCall !== false;
  }

  /** Resolve "provider/model_id" into a LangChain chat model. */
  resolve(modelRef: string, opts: { temperature?: number } = {}): BaseChatModel {
    const slash = modelRef.indexOf("/");
    if (slash < 0) throw new Error(`Model must be "provider/model", got "${modelRef}"`);
    const providerId = modelRef.slice(0, slash);
    const modelId = modelRef.slice(slash + 1);
    const cfg = this.config.get();
    const pc = cfg.providers[providerId] ?? {};
    const temperature = opts.temperature;

    switch (providerId) {
      case "anthropic":
        return new ChatAnthropic({ model: modelId, apiKey: pc.apiKey ?? process.env.ANTHROPIC_API_KEY, temperature });
      case "openai":
        return new ChatOpenAI({ model: modelId, apiKey: pc.apiKey ?? process.env.OPENAI_API_KEY, temperature });
      case "google":
        return new ChatGoogleGenerativeAI({ model: modelId, apiKey: pc.apiKey ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY, temperature });
      case "openrouter":
        return new ChatOpenAI({
          model: modelId,
          apiKey: pc.apiKey ?? process.env.OPENROUTER_API_KEY ?? "not-needed",
          temperature,
          configuration: { baseURL: "https://openrouter.ai/api/v1" },
        });
      case "groq":
        // Groq is OpenAI-compatible.
        return new ChatOpenAI({
          model: modelId,
          apiKey: pc.apiKey ?? process.env.GROQ_API_KEY ?? "not-needed",
          temperature,
          configuration: { baseURL: "https://api.groq.com/openai/v1" },
        });
      case "builtin":
      case "ollama":
      case "lmstudio":
      case "llamacpp": {
        const base = pc.baseURL ?? LOCAL_SERVERS.find((s) => s.id === providerId)!.baseURL;
        return new ChatOpenAI({ model: modelId, apiKey: "not-needed", temperature, configuration: { baseURL: base } });
      }
      default: {
        if (!pc.baseURL) throw new Error(`Unknown provider "${providerId}"`);
        return new ChatOpenAI({ model: modelId, apiKey: pc.apiKey ?? "not-needed", temperature, configuration: { baseURL: pc.baseURL } });
      }
    }
  }
}
