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
import type { StudioAgentEvent } from "./bridge-map.ts";
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

  /** A session's stored messages (part-based); empty when not installed. */
  async listMessages(sessionId: string) {
    const c = await this.ensureClient();
    return c ? c.listMessages(sessionId) : [];
  }

  async createSession(): Promise<string | null> {
    const c = await this.ensureClient();
    return c ? c.createSession() : null;
  }

  async prompt(sessionId: string, text: string, model?: { providerID: string; modelID: string }, agentName?: string): Promise<boolean> {
    const c = await this.ensureClient();
    if (!c) return false;
    await c.prompt(sessionId, text, model, agentName);
    return true;
  }

  /** The engine's own provider/model catalog; empty when not installed. */
  async providers(): Promise<{ providers: import("./client.ts").EngineProvider[]; defaults: Record<string, string> }> {
    const c = await this.ensureClient();
    return c ? c.providers() : { providers: [], defaults: {} };
  }

  async abort(sessionId: string): Promise<void> {
    const c = await this.ensureClient();
    await c?.abort(sessionId);
  }

  async respondPermission(sessionId: string, permissionId: string, approve: boolean): Promise<void> {
    const c = await this.ensureClient();
    await c?.respondPermission(sessionId, permissionId, approve);
  }

  async subscribe(onEvent: (e: StudioAgentEvent) => void, signal?: AbortSignal): Promise<void> {
    const c = await this.ensureClient();
    if (c) await c.subscribe(onEvent, signal);
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
