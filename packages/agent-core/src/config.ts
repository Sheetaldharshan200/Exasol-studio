import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Editable guardrails + behavior for the agent loop and tools. */
export type AgentSettings = {
  /** Built-in or user-overridden skills injected into every turn. */
  defaultSkills: string[];
  /** Read statements: run automatically or ask first. */
  readPolicy: "allow" | "ask";
  /** Write statements: ask first (default) or refuse entirely. */
  writePolicy: "ask" | "deny";
  /** Max tool-loop steps per turn. */
  maxSteps: number;
  /** Sampling temperature. */
  temperature: number;
  /** Extra instructions appended to the system prompt. */
  customInstructions: string;
  /** Allow parallel read-only researcher sub-agents. */
  enableResearcher: boolean;
  /** Save/inject cross-session insights. */
  enableInsights: boolean;
  /** Auto-compact near the context window. */
  enableCompaction: boolean;
  /** Graphical UI actions (agent drives the app: connect/open/insert). Beta,
   *  off by default — enable in AI Settings. */
  enableUiTools: boolean;
  /** Pet companion mode for UI actions: pet, cursor-only, or background. */
  petMode: "pet" | "cursor" | "off";
  /** Which companion character to show. */
  petAvatar: "exa" | "byte" | "pixel" | "quill" | "dot";
  /** Allow UI actions that are destructive (disconnect, delete, drop). */
  allowDestructiveUi: boolean;
  /** Allow the agent to read/edit workspace files. */
  allowFileAccess: boolean;
  /** Commit workspace changes to git after each agent turn (deterministic —
   *  the app does it, not the model). */
  autoCommit: boolean;
};

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  defaultSkills: ["fable-method"],
  readPolicy: "allow",
  writePolicy: "ask",
  maxSteps: 12,
  temperature: 0.2,
  customInstructions: "",
  enableResearcher: true,
  enableInsights: true,
  enableCompaction: true,
  enableUiTools: false,
  petMode: "off",
  petAvatar: "exa",
  allowDestructiveUi: false,
  allowFileAccess: false,
  autoCommit: true,
};

/** Persistent agent configuration: provider keys, default model, options. */
export type AgentConfig = {
  version: 1;
  /** Default model as "provider/model_id". */
  model?: string;
  /** Guardrails + behavior (missing fields fall back to defaults). */
  agent?: Partial<AgentSettings>;
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

  settings(): AgentSettings {
    const merged = { ...DEFAULT_AGENT_SETTINGS, ...this.cache.agent };
    return {
      ...merged,
      defaultSkills: Array.isArray(merged.defaultSkills)
        ? merged.defaultSkills.filter((name): name is string => typeof name === "string")
        : [...DEFAULT_AGENT_SETTINGS.defaultSkills],
    };
  }

  update(mutate: (cfg: AgentConfig) => void) {
    mutate(this.cache);
    writeFileSync(this.file, JSON.stringify(this.cache, null, 2), { mode: 0o600 });
  }
}
