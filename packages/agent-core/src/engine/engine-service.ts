/**
 * Engine service (exa-agent-v2): the sidecar-side singleton that owns the
 * EngineSupervisor + connected client and exposes the operations the server
 * routes call. The Tauri app passes the resolved engine binary + Studio config
 * dir to the sidecar via env (EXA_ENGINE_BIN / EXA_ENGINE_CONFIG_DIR); when
 * they are absent the engine is simply "not installed" and every op degrades
 * cleanly. The env resolution is pure + tested; the supervisor is the I/O.
 */
import { EngineSupervisor, type EngineStatus } from "./supervisor.ts";
import type { EngineClient } from "./client.ts";
import type { StudioAgentEvent } from "./bridge-map.ts";

export type EngineEnv = { binary: string; configDir: string } | null;

/** Read the engine location from env; null when not provisioned/installed. */
export function resolveEngineEnv(env: Record<string, string | undefined>): EngineEnv {
  const binary = env.EXA_ENGINE_BIN?.trim();
  const configDir = env.EXA_ENGINE_CONFIG_DIR?.trim();
  if (!binary || !configDir) return null;
  return { binary, configDir };
}

const NOT_INSTALLED: EngineStatus = {
  state: "stopped",
  reason: "Exa engine is not installed — install it from Managed Components.",
  binaryPresent: false,
};

export class EngineService {
  private supervisor: EngineSupervisor | null;
  private client: EngineClient | null = null;

  constructor(env: Record<string, string | undefined> = process.env) {
    const resolved = resolveEngineEnv(env);
    this.supervisor = resolved ? new EngineSupervisor({ binary: resolved.binary, configDir: resolved.configDir }) : null;
  }

  get provisioned(): boolean {
    return this.supervisor !== null;
  }

  async status(): Promise<EngineStatus> {
    if (!this.supervisor) return NOT_INSTALLED;
    return this.supervisor.status(await this.supervisor.binaryPresent());
  }

  /** Ensure the server is running and return a connected client, or null. */
  private async ensureClient(): Promise<EngineClient | null> {
    if (!this.supervisor) return null;
    if (this.client) return this.client;
    await this.supervisor.start();
    this.client = await this.supervisor.client();
    return this.client;
  }

  async listSessions() {
    const c = await this.ensureClient();
    return c ? c.listSessions() : [];
  }

  async createSession(): Promise<string | null> {
    const c = await this.ensureClient();
    return c ? c.createSession() : null;
  }

  async prompt(sessionId: string, text: string, model?: { providerID: string; modelID: string }): Promise<boolean> {
    const c = await this.ensureClient();
    if (!c) return false;
    await c.prompt(sessionId, text, model);
    return true;
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
}
