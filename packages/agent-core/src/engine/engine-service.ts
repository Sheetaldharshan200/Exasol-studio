/**
 * Engine service (exa-agent-v2): the sidecar-side singleton that owns the
 * EngineSupervisor + connected client and exposes the operations the server
 * routes call.
 *
 * Resolution is LAZY, so installing the engine while the sidecar is already
 * running takes effect on the very next call — no restart. Each call resolves,
 * in order: the installed component copy under the data root
 * (`<root>/personal-local/components/exa-agent/bin/<binary>`, from
 * EXA_ENGINE_DATA_ROOT), then the bundled baseline (EXA_ENGINE_BIN). Absent →
 * every op degrades cleanly to "not installed".
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { EngineSupervisor, type EngineStatus } from "./supervisor.ts";
import type { EngineClient } from "./client.ts";
import { upsertProviderAuth } from "./auth-store.ts";
import { mapCatalog, type CatalogProvider } from "./catalog-map.ts";

export type EngineEnv = { binary: string; configDir: string } | null;

const binaryName = () => (process.platform === "win32" ? "opencode.exe" : "opencode");

/**
 * Where the engine binary + config live, resolved from env each call: the
 * installed component copy first, then the bundled baseline. Pure given env.
 */
export function resolveEngineEnv(env: Record<string, string | undefined>): EngineEnv {
  const root = env.EXA_ENGINE_DATA_ROOT?.trim();
  if (root) {
    const dir = join(root, "personal-local", "components", "exa-agent");
    const bin = join(dir, "bin", binaryName());
    if (existsSync(bin)) return { binary: bin, configDir: join(dir, "config") };
  }
  const baseline = env.EXA_ENGINE_BIN?.trim();
  const cfg = env.EXA_ENGINE_CONFIG_DIR?.trim();
  if (baseline && cfg && existsSync(baseline)) return { binary: baseline, configDir: cfg };
  return null;
}

const NOT_INSTALLED: EngineStatus = {
  state: "stopped",
  reason: "Exa engine is not installed yet — click Install to fetch it.",
  binaryPresent: false,
};

export class EngineService {
  private supervisor: EngineSupervisor | null = null;
  private supervisorBinary: string | null = null;
  private client: EngineClient | null = null;
  private env: Record<string, string | undefined>;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.env = env;
  }

  /** (Re)build the supervisor when a binary is resolvable; null when absent. */
  private resolveSupervisor(): EngineSupervisor | null {
    const resolved = resolveEngineEnv(this.env);
    if (!resolved) {
      this.supervisor = null;
      this.supervisorBinary = null;
      return null;
    }
    if (this.supervisor && this.supervisorBinary === resolved.binary) return this.supervisor;
    // Binary appeared or changed (install/update) — rebuild + drop stale client.
    this.supervisor = new EngineSupervisor({ binary: resolved.binary, configDir: resolved.configDir });
    this.supervisorBinary = resolved.binary;
    this.client = null;
    return this.supervisor;
  }

  get provisioned(): boolean {
    return resolveEngineEnv(this.env) !== null;
  }

  async status(): Promise<EngineStatus> {
    const s = this.resolveSupervisor();
    if (!s) return NOT_INSTALLED;
    return s.status(await s.binaryPresent());
  }

  /** Ensure the server is running and return a connected client, or null. */
  private async ensureClient(): Promise<EngineClient | null> {
    const supervisor = this.resolveSupervisor();
    if (!supervisor) return null;
    if (this.client) return this.client;
    await supervisor.start();
    this.client = await supervisor.client();
    return this.client;
  }

  async listSessions() {
    const c = await this.ensureClient();
    return c ? c.listSessions() : [];
  }


  /** The engine's own provider/model catalog; empty when not installed. */
  async providers(): Promise<{ providers: import("./client.ts").EngineProvider[]; defaults: Record<string, string> }> {
    const c = await this.ensureClient();
    return c ? c.providers() : { providers: [], defaults: {} };
  }


  async stop(): Promise<void> {
    await this.supervisor?.stop();
    this.client = null;
  }

  /**
   * Save a provider API key. Preferred path: the ENGINE's own PUT /auth/:id
   * route followed by /instance/dispose (hot reload, exactly what the TUI
   * does). Fallback when the server can't start: write auth.json directly.
   * False when the engine isn't installed at all.
   */
  async setProviderAuth(providerId: string, apiKey: string): Promise<boolean> {
    const resolved = resolveEngineEnv(this.env);
    if (!resolved) return false;
    const c = await this.ensureClient().catch(() => null);
    if (c) {
      try {
        await c.setAuthKey(providerId, apiKey);
        await c.dispose().catch(() => undefined);
        return true;
      } catch {
        /* fall through to the file path */
      }
    }
    upsertProviderAuth(resolved.configDir, providerId, apiKey);
    await this.stop(); // next call restarts with the new credentials
    return true;
  }

  // ── Engine config (opencode.json): this service is the ONLY writer. ──
  // Rust and this process both used to write the file; a read-modify-write
  // race wiped seeded blocks. All mutations now serialize through configLock.
  private configLock: Promise<void> = Promise.resolve();
  private seeded = false;
  private lastProviderSync = "";

  /** Read-mutate-write opencode.json under the in-process lock. */
  private async withConfig(mutate: (root: Record<string, unknown>) => boolean): Promise<boolean> {
    const resolved = resolveEngineEnv(this.env);
    if (!resolved) return false;
    let changed = false;
    const run = this.configLock.then(async () => {
      const { readFileSync, writeFileSync, mkdirSync } = await import("node:fs");
      const dir = join(resolved.configDir, "opencode");
      const cfgPath = join(dir, "opencode.json");
      let root: Record<string, unknown> = {};
      try {
        root = JSON.parse(readFileSync(cfgPath, "utf8")) as Record<string, unknown>;
      } catch {
        /* first write */
      }
      if (typeof root !== "object" || root === null) root = {};
      changed = mutate(root);
      if (changed) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(cfgPath, JSON.stringify(root, null, 2));
      }
    });
    this.configLock = run.catch(() => undefined);
    await run;
    return changed;
  }

  /**
   * Seed the engine defaults once per sidecar run (merge-only): the
   * exasol-studio MCP gateway + a filesystem MCP server (launch ingredients
   * arrive from Rust via env — the sidecar is the single config writer), and
   * the "exa" agent: the data-work guardrail persona with the engine's
   * coding/filesystem tools disabled, so it works through the MCP servers
   * instead of behaving like a coding assistant.
   */
  async ensureSeedConfig(): Promise<void> {
    if (this.seeded) return;
    this.seeded = true;
    const gatewayNode = this.env.EXA_GATEWAY_NODE?.trim();
    const gatewayScript = this.env.EXA_GATEWAY_SCRIPT?.trim();
    const agentDir = this.env.EXA_AGENT_DIR?.trim();
    const npx = this.env.EXA_NPX?.trim();
    const home = this.env.HOME || this.env.USERPROFILE;
    const changed = await this.withConfig((root) => {
      let dirty = false;
      if (root.mcp === undefined) root.mcp = {};
      const mcp = root.mcp;
      if (typeof mcp === "object" && mcp !== null && !Array.isArray(mcp)) {
        const m = mcp as Record<string, unknown>;
        if (!("exasol-studio" in m) && gatewayNode && gatewayScript) {
          m["exasol-studio"] = {
            type: "local",
            command: [gatewayNode, gatewayScript],
            environment: agentDir ? { EXASOL_STUDIO_AGENT_DIR: agentDir } : {},
            enabled: true,
          };
          dirty = true;
        }
        if (!("filesystem" in m) && npx && home) {
          m.filesystem = {
            type: "local",
            command: [npx, "-y", "@modelcontextprotocol/server-filesystem", home],
            enabled: true,
          };
          dirty = true;
        } else {
          // Migrate an earlier bare-"npx" seed (broken under the GUI PATH).
          const fs = m.filesystem as { command?: unknown[] } | undefined;
          if (fs && Array.isArray(fs.command) && fs.command[0] === "npx" && npx) {
            fs.command[0] = npx;
            dirty = true;
          }
        }
      }
      if (root.agent === undefined) root.agent = {};
      const agents = root.agent;
      if (typeof agents === "object" && agents !== null && !Array.isArray(agents)) {
        const a = agents as Record<string, Record<string, unknown>>;
        const guardrailPrompt =
          "You are Exa, the AI data analyst inside Exasol Studio. Identify yourself only as Exa. Scope: the user's connected databases (Exasol first), SQL, data quality, analysis, insights, reporting and dashboards. Use the exasol-studio MCP tools to inspect schemas and run read-only queries, and the filesystem MCP for local data files. Never present yourself as a general coding assistant and do not explore source code. SQL safety: prefer SELECT/WITH/DESCRIBE; never run destructive statements (DROP, DELETE, TRUNCATE, UPDATE, INSERT, ALTER, GRANT) unless the user explicitly requested that exact change. Exasol notes: identifiers fold to uppercase unless quoted; use LIMIT n. When you need the user to decide something (which database, which schema, naming, scope), do NOT ask in plain prose: first look up the real options with the exasol-studio MCP tools (e.g. list the connected databases or schemas), then call the question tool with those concrete options as choices so the user can click an answer. If a request is unrelated to data work, decline in one sentence and steer back to the user's data.";
        // Tool lockdown MUST use `permission` — the engine's AgentConfig
        // accepts a `tools` map in its schema but v1.18.12 never reads it
        // (agent merge consumes only value.permission; verified in the fork
        // source, agent.ts config loop). "edit" covers write/patch too via
        // Permission.disabled's alias list.
        const codingDeny = {
          bash: "deny",
          edit: "deny",
          read: "deny",
          grep: "deny",
          glob: "deny",
          list: "deny",
          todowrite: "deny",
          todoread: "deny",
          task: "deny",
          // The engine denies `question` by default; Exa uses it to ask
          // structured multiple-choice questions the panel renders natively.
          question: "allow",
        };
        if (!("exa" in a)) {
          a.exa = {
            description: "Exa — the Exasol Studio data agent (databases, SQL, insights, dashboards)",
            mode: "primary",
            prompt: guardrailPrompt,
            permission: codingDeny,
          };
          dirty = true;
        } else if (a.exa.permission === undefined) {
          // Migrate an earlier seed that used the inert `tools` map.
          a.exa.permission = codingDeny;
          delete a.exa.tools;
          dirty = true;
        } else {
          // Keep an existing seed current: the question tool and prompt
          // evolve with Studio (idempotent — writes only on drift).
          const perm = a.exa.permission as Record<string, unknown>;
          if (perm.question !== "allow") {
            perm.question = "allow";
            dirty = true;
          }
          if (a.exa.prompt !== guardrailPrompt) {
            a.exa.prompt = guardrailPrompt;
            dirty = true;
          }
        }
        // Chat mode's agent: NO tools at all ("*" deny, the same pattern the
        // engine's own title/compaction agents use). Besides honoring "Chat =
        // no tools", this keeps small local models usable: attaching tools
        // makes llama-server enforce its native tool-call grammar, which tiny
        // models fail (verified live with Llama 3.2 3B: errors with tools
        // attached, answers fine without).
        if (!("exa-chat" in a)) {
          a["exa-chat"] = {
            description: "Exa (chat) — conversation only, no tools",
            mode: "primary",
            prompt: guardrailPrompt + " You are in chat mode: answer from knowledge and the conversation only; you have no tools in this mode.",
            permission: { "*": "deny" },
          };
          dirty = true;
        }
      }
      return dirty;
    });
    if (changed) await this.restartForConfig();
  }

  /**
   * Apply an opencode.json change to a RUNNING engine. /instance/dispose is
   * NOT enough: the engine caches the global config with an infinite TTL
   * (config.ts cachedInvalidateWithTTL(…, Duration.infinity)) and only its
   * own TUI worker ever invalidates it — mcp/agent/provider blocks are read
   * at process boot. Verified live 2026-08-06: a running engine kept serving
   * the pre-seed agent list after dispose; a restart loaded the seeded
   * config. No-op when the engine isn't running (next start reads the file).
   */
  private async restartForConfig(): Promise<void> {
    const s = this.supervisor;
    if (!s) return;
    const status = s.status(await s.binaryPresent());
    if (status.state === "stopped") return;
    await s.stop().catch(() => undefined);
    this.client = null;
    await s.start().catch(() => undefined);
  }

  /**
   * Declare Studio's LOCAL runtimes (Built-in AI, Ollama, LM Studio, …) to
   * the ENGINE as OpenAI-compatible providers, keyed by the SAME ids the
   * panel sends with prompts — without this, prompting a local model fails
   * because opencode has never heard of the provider. Merge-only.
   */
  async syncLocalProviders(
    servers: { id: string; name: string; baseURL: string; models: { id: string; name?: string }[] }[],
  ): Promise<void> {
    if (servers.length === 0) return;
    const entries: Record<string, unknown> = {};
    for (const sv of servers) {
      entries[sv.id] = {
        npm: "@ai-sdk/openai-compatible",
        name: sv.name,
        options: { baseURL: sv.baseURL },
        models: Object.fromEntries(sv.models.map((m) => [m.id, { name: m.name ?? m.id }])),
      };
    }
    const serialized = JSON.stringify(entries);
    if (serialized === this.lastProviderSync) return;
    const changed = await this.withConfig((root) => {
      if (root.provider === undefined) root.provider = {};
      const provider = root.provider;
      if (typeof provider !== "object" || provider === null || Array.isArray(provider)) return false;
      for (const [id, entry] of Object.entries(entries)) (provider as Record<string, unknown>)[id] = entry;
      return true;
    });
    this.lastProviderSync = serialized;
    // Restart so the providers are usable immediately (boot-time config).
    if (changed) await this.restartForConfig();
  }

  /** MCP servers: status map / add / connect-disconnect (engine-side). */
  async mcpList() {
    const c = await this.ensureClient();
    return c ? c.mcpList() : {};
  }

  async mcpAdd(name: string, config: import("./client.ts").McpConfig): Promise<boolean> {
    const c = await this.ensureClient();
    if (!c) return false;
    await c.mcpAdd(name, config);
    return true;
  }

  async mcpToggle(name: string, connect: boolean): Promise<boolean> {
    const c = await this.ensureClient();
    if (!c) return false;
    await c.mcpToggle(name, connect);
    return true;
  }

  /** Remove a provider's credential and hot-reload; false when absent. */
  async removeProviderAuth(providerId: string): Promise<boolean> {
    const c = await this.ensureClient();
    if (!c) return false;
    await c.removeAuth(providerId);
    await c.dispose().catch(() => undefined);
    return true;
  }

  /** Provider ids the engine considers connected; empty when absent. */
  async connectedProviders(): Promise<string[]> {
    const c = await this.ensureClient();
    return c ? c.connectedProviders() : [];
  }

  /** Per-provider auth methods (the connect-flow spec); empty when absent. */
  async authMethods() {
    const c = await this.ensureClient();
    return c ? c.authMethods() : {};
  }

  /** Start an OAuth flow. Null when not installed or for non-oauth methods. */
  async oauthAuthorize(providerId: string, method: number, inputs?: Record<string, string>) {
    const c = await this.ensureClient();
    return c ? c.oauthAuthorize(providerId, method, inputs) : null;
  }

  /**
   * Complete an OAuth flow (blocks while the engine polls), then hot-reload
   * providers so the new credential is usable immediately.
   */
  async oauthCallback(providerId: string, method: number, code?: string): Promise<boolean> {
    const c = await this.ensureClient();
    if (!c) return false;
    const ok = await c.oauthCallback(providerId, method, code);
    if (ok) await c.dispose().catch(() => undefined);
    return ok;
  }

  /** Compact (summarize) a session engine-side to reclaim context. */
  async compact(sessionId: string): Promise<boolean> {
    const c = await this.ensureClient();
    if (!c) return false;
    await c.summarize(sessionId);
    return true;
  }

  /** Undo (revert) / redo (unrevert) the last message; false when absent. */
  async undo(sessionId: string): Promise<boolean> {
    const c = await this.ensureClient();
    if (!c) return false;
    await c.revert(sessionId);
    return true;
  }

  async redo(sessionId: string): Promise<boolean> {
    const c = await this.ensureClient();
    if (!c) return false;
    await c.unrevert(sessionId);
    return true;
  }

  /** Permanently delete a stored session; false when not installed. */
  async deleteSession(sessionId: string): Promise<boolean> {
    const c = await this.ensureClient();
    if (!c) return false;
    await c.deleteSession(sessionId);
    return true;
  }

  /** Rename a stored session; false when not installed. */
  async renameSession(sessionId: string, title: string): Promise<boolean> {
    const c = await this.ensureClient();
    if (!c) return false;
    await c.renameSession(sessionId, title);
    return true;
  }

  // The full models.dev catalog (the same source opencode uses), cached so
  // opening the connect UI repeatedly doesn't hammer the network.
  private catalogCache: { at: number; providers: CatalogProvider[] } | null = null;

  async catalog(): Promise<CatalogProvider[]> {
    const TTL = 10 * 60_000;
    if (this.catalogCache && Date.now() - this.catalogCache.at < TTL) return this.catalogCache.providers;
    const url = this.env.OPENCODE_MODELS_URL?.trim() || "https://models.opencode.ai/api.json";
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
    const providers = mapCatalog((await res.json()) as Parameters<typeof mapCatalog>[0]);
    this.catalogCache = { at: Date.now(), providers };
    return providers;
  }
}
