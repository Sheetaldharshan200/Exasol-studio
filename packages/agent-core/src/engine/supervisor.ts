/**
 * Runtime supervisor for the Exa engine (exa-agent-v2, task 1.2). Spawns the
 * opencode release binary as a localhost server, health-checks it, restarts
 * with backoff per the pure policy, and hands out a connected client. All
 * DECISIONS live in supervisor-policy.ts (tested); this file is the thin I/O
 * that performs them. The engine is a Marketplace component: when its binary
 * is absent the supervisor reports a clean disconnected state — never a crash.
 */
import { execFile, spawn, type ChildProcess } from "node:child_process";
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

    // NEVER adopt a survivor: an engine left over from a previous run read
    // opencode.json at ITS boot, so its agents/MCP/provider config can be
    // stale (config is cached process-for-life — verified live 2026-08-11:
    // an adopted 12:01 survivor served no exa agent while the disk config
    // had it). An occupied candidate that is OURS is killed and replaced by
    // a fresh spawn; a foreign one is left untouched (next candidate).
    const pre = await this.identify(port);
    if (pre === "foreign") {
      if (taken.length < this.cfg.portCandidates.length) {
        return this.start([...taken, port]);
      }
      this.state = "failed";
      this.reason = "Every engine port candidate is occupied by another process.";
      return this.status(true);
    }
    if (pre === "ours") {
      await killPortOwner(port);
      for (let i = 0; i < 12 && (await this.identify(port)) !== "down"; i++) await sleep(250);
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

    // Wait for the server to answer AND prove it is OURS — a user may run
    // their own opencode on this port, and adopting a foreign server would
    // silently drive their sessions/config. Identity = GET /path reporting
    // our isolated config dir.
    const verdict = await this.waitOurs(port);
    if (verdict === "foreign") {
      // Someone else's server owns this port; our spawn never bound. Leave
      // the foreign server untouched and retry on the next candidate.
      this.proc?.kill();
      this.proc = undefined;
      this.state = "stopped";
      if (taken.length < this.cfg.portCandidates.length) {
        return this.start([...taken, port]);
      }
      this.state = "failed";
      this.reason = "Every engine port candidate is occupied by another process.";
      return this.status(true);
    }
    this.applyEvent(verdict === "ours" ? "ready" : "crash");
    if (verdict !== "ours") void this.maybeRestart(taken);
    return this.status(true);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.proc?.kill();
    this.proc = undefined;
    // An ADOPTED survivor (an engine of ours left over from a previous
    // sidecar run) is not our child process, so the kill above can't reach
    // it — and a follow-up start() would silently re-adopt the stale
    // process (its config is read once at boot; verified live 2026-08-06).
    // Free the port explicitly, but only after re-proving the responder is
    // ours via GET /path.
    const port = this.port;
    if (port != null && (await this.identify(port)) === "ours") {
      await killPortOwner(port);
      // Give the process a moment to release the port before any restart.
      for (let i = 0; i < 12 && (await this.identify(port)) === "ours"; i++) await sleep(250);
    }
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

  /**
   * Poll until the server on `port` answers, then verify identity: the
   * engine's GET /path reports the config dir it runs with — it must be OUR
   * isolated dir. "foreign" means a different opencode owns the port.
   */
  private async waitOurs(port: number, tries = 40): Promise<"ours" | "foreign" | "down"> {
    for (let i = 0; i < tries; i++) {
      const verdict = await this.identify(port);
      if (verdict !== "down") return verdict;
      await sleep(250);
    }
    return "down";
  }

  /** One identity probe: GET /path and match the config dir. */
  private async identify(port: number): Promise<"ours" | "foreign" | "down"> {
    try {
      const res = await fetch(`${baseUrlFor(port)}/path`, { signal: AbortSignal.timeout(500) });
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as { config?: string } | null;
        const cfg = body?.config ?? "";
        return cfg.startsWith(this.opts.configDir) ? "ours" : "foreign";
      }
      // A server without /path is not an opencode we can trust as ours.
      if (res.status === 404) return "foreign";
    } catch {
      /* not up */
    }
    return "down";
  }
}

/** Terminate whatever process listens on a localhost port (best-effort). */
async function killPortOwner(port: number): Promise<void> {
  const run = (cmd: string, args: string[]) =>
    new Promise<string>((resolve) => {
      execFile(cmd, args, { timeout: 3000 }, (_err, stdout) => resolve(stdout ?? ""));
    });
  try {
    if (process.platform === "win32") {
      const out = await run("netstat", ["-ano", "-p", "tcp"]);
      const pids = new Set(
        out
          .split(/\r?\n/)
          .filter((l) => l.includes(`:${port} `) && l.includes("LISTENING"))
          .map((l) => l.trim().split(/\s+/).pop() ?? ""),
      );
      for (const pid of pids) if (/^\d+$/.test(pid)) await run("taskkill", ["/pid", pid, "/f"]);
      return;
    }
    const out = await run("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"]);
    for (const pid of out.split(/\s+/)) {
      if (/^\d+$/.test(pid)) {
        try {
          process.kill(Number(pid), "SIGTERM");
        } catch {
          /* already gone */
        }
      }
    }
  } catch {
    /* best-effort — a stale survivor is better than a crash here */
  }
}
