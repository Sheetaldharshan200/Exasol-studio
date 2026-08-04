/**
 * Runtime supervisor for the Exa engine (exa-agent-v2, task 1.2). Spawns the
 * opencode release binary as a localhost server, health-checks it, restarts
 * with backoff per the pure policy, and hands out a connected client. All
 * DECISIONS live in supervisor-policy.ts (tested); this file is the thin I/O
 * that performs them. The engine is a Marketplace component: when its binary
 * is absent the supervisor reports a clean disconnected state — never a crash.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { access } from "node:fs/promises";
import { connectEngine, type EngineClient } from "./client.ts";
import { baseUrlFor, serveSpawnPlan } from "./spawn-args.ts";
import { DEFAULT_SUPERVISOR, backoffFor, nextState, pickPort, type EngineState, type SupervisorConfig } from "./supervisor-policy.ts";

export type EngineStatus = { state: EngineState; port?: number; reason?: string; binaryPresent: boolean };

export type SupervisorOptions = {
  /** Resolved engine binary path (component dir → bundled baseline). */
  binary: string;
  /** Studio-owned config/data dir shared with the exa CLI. */
  configDir: string;
  config?: SupervisorConfig;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class EngineSupervisor {
  private cfg: SupervisorConfig;
  private state: EngineState = "stopped";
  private reason?: string;
  private port?: number;
  private proc?: ChildProcess;
  private restarts = 0;
  private stopping = false;
  private opts: SupervisorOptions;

  constructor(opts: SupervisorOptions) {
    this.opts = opts;
    this.cfg = opts.config ?? DEFAULT_SUPERVISOR;
  }

  status(binaryPresent: boolean): EngineStatus {
    return { state: this.state, port: this.port, reason: this.reason, binaryPresent };
  }

  async binaryPresent(): Promise<boolean> {
    try {
      await access(this.opts.binary);
      return true;
    } catch {
      return false;
    }
  }

  /** Start the server (idempotent). No-op with a clear reason when absent. */
  async start(taken: readonly number[] = []): Promise<EngineStatus> {
    if (!(await this.binaryPresent())) {
      this.state = "stopped";
      this.reason = "Exa engine is not installed yet — install it from Managed Components.";
      return this.status(false);
    }
    if (this.state === "running" || this.state === "starting") return this.status(true);

    const port = pickPort(this.cfg, taken);
    if (port == null) {
      this.state = "failed";
      this.reason = "No free localhost port for the engine.";
      return this.status(true);
    }
    this.port = port;
    this.applyEvent("start");

    const plan = serveSpawnPlan({ binary: this.opts.binary, port, configDir: this.opts.configDir });
    this.proc = spawn(plan.command, plan.args, { env: { ...process.env, ...plan.env }, stdio: "ignore" });
    this.proc.once("exit", () => {
      if (this.stopping) return;
      this.applyEvent("crash");
      void this.maybeRestart(taken);
    });

    // Wait for the server to answer before declaring running.
    const ok = await this.waitHealthy(port);
    this.applyEvent(ok ? "ready" : "crash");
    if (!ok) void this.maybeRestart(taken);
    return this.status(true);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.proc?.kill();
    this.proc = undefined;
    this.applyEvent("stop");
    this.stopping = false;
  }

  /** A connected client for the running server, or null when not running. */
  async client(): Promise<EngineClient | null> {
    if (this.state !== "running" || this.port == null) return null;
    return connectEngine(baseUrlFor(this.port));
  }

  private applyEvent(event: "start" | "ready" | "crash" | "stop") {
    const t = nextState(this.cfg, this.state, event, this.restarts);
    this.state = t.state;
    this.reason = t.reason;
    if (event === "ready") this.restarts = 0;
  }

  private async maybeRestart(taken: readonly number[]) {
    if (this.state !== "backoff") return;
    await sleep(backoffFor(this.cfg, this.restarts));
    this.restarts += 1;
    await this.start(taken);
  }

  private async waitHealthy(port: number, tries = 40): Promise<boolean> {
    const url = `${baseUrlFor(port)}/app`;
    for (let i = 0; i < tries; i++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(500) });
        if (res.ok || res.status === 404) return true; // server is up (route may vary)
      } catch {
        /* not up yet */
      }
      await sleep(250);
    }
    return false;
  }
}
