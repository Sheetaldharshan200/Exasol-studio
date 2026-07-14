import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Persistent agent configuration: provider keys, default model, options. */
export type AgentConfig = {
  version: 1;
  /** Default model as "provider/model_id". */
  model?: string;
  providers: Record<
    string,
    {
      apiKey?: string;
      /** Base URL override (local servers / proxies). */
      baseURL?: string;
      /** Manually declared models for custom/local providers. */
      models?: { id: string; name?: string; context?: number }[];
    }
  >;
};

const DEFAULT_CONFIG: AgentConfig = { version: 1, providers: {} };

export function defaultDataDir(): string {
  // Matches the Tauri app identifier so everything lives in one place.
  if (process.platform === "darwin")
    return join(homedir(), "Library", "Application Support", "com.exasol.studio", "agent");
  if (process.platform === "win32")
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "com.exasol.studio", "agent");
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "com.exasol.studio", "agent");
}

export class ConfigStore {
  readonly dataDir: string;
  private readonly file: string;
  private cache: AgentConfig;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, "agent.json");
    this.cache = this.load();
  }

  private load(): AgentConfig {
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8")) as AgentConfig;
      if (parsed && parsed.version === 1 && typeof parsed.providers === "object") return parsed;
    } catch {
      // Missing or corrupt config falls back to defaults.
    }
    return structuredClone(DEFAULT_CONFIG);
  }

  get(): AgentConfig {
    return this.cache;
  }

  update(mutate: (cfg: AgentConfig) => void) {
    mutate(this.cache);
    writeFileSync(this.file, JSON.stringify(this.cache, null, 2), { mode: 0o600 });
  }
}
