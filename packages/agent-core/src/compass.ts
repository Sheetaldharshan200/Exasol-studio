import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { jsonSchema, tool, type ToolSet } from "ai";
import type { DbConnectionInfo } from "./db.ts";
import { log } from "./log.ts";

/**
 * Bridge to leadership's `exasol-compass` MCP server (schema knowledge graph).
 *
 * Policy: used ONLY for cloud models. Local models keep Ada's native KB, which
 * is already token-optimized and injected per turn. Everything here is
 * best-effort — if compass isn't installed or the handshake fails, we return
 * null and the caller falls back to the native KB, so the default experience
 * is never affected.
 *
 * A minimal JSON-RPC-over-stdio MCP client (no extra dependency): spawn
 * `exasol-compass serve` for the connection, initialize, list tools, and wrap
 * each as an AI SDK tool that calls back over stdio.
 */

type Pending = (result: unknown, error?: string) => void;

class CompassClient {
  private proc: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private buffer = "";

  constructor(command: string, args: string[], env: NodeJS.ProcessEnv) {
    this.proc = spawn(command, args, { env, stdio: ["pipe", "pipe", "pipe"] }) as ChildProcessWithoutNullStreams;
    const rl = createInterface({ input: this.proc.stdout });
    rl.on("line", (line) => this.onLine(line));
    this.proc.stderr.on("data", () => {}); // compass logs to stderr — ignore
  }

  private onLine(line: string) {
    const t = line.trim();
    if (!t.startsWith("{")) return;
    let msg: { id?: number; result?: unknown; error?: { message?: string } };
    try {
      msg = JSON.parse(t);
    } catch {
      return;
    }
    if (typeof msg.id === "number" && this.pending.has(msg.id)) {
      const done = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      done(msg.result, msg.error?.message);
    }
  }

  private rpc(method: string, params: unknown, timeoutMs = 20_000): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`compass ${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, (result, error) => {
        clearTimeout(timer);
        if (error) reject(new Error(error));
        else resolve(result);
      });
      this.proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  private notify(method: string, params: unknown) {
    this.proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  async initialize(): Promise<void> {
    await this.rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "exasol-studio", version: "1" },
    });
    this.notify("notifications/initialized", {});
  }

  async listTools(): Promise<{ name: string; description?: string; inputSchema?: unknown }[]> {
    const res = (await this.rpc("tools/list", {})) as { tools?: { name: string; description?: string; inputSchema?: unknown }[] };
    return res.tools ?? [];
  }

  async callTool(name: string, args: unknown): Promise<unknown> {
    const res = (await this.rpc("tools/call", { name, arguments: args ?? {} })) as {
      content?: { type: string; text?: string }[];
    };
    // MCP returns content parts; hand text back to the model directly.
    const text = (res.content ?? [])
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text)
      .join("\n");
    return text || res;
  }

  alive(): boolean {
    return this.proc.exitCode === null && !this.proc.killed;
  }

  dispose() {
    try {
      this.proc.kill();
    } catch {
      // ignore
    }
  }
}

export class CompassBridge {
  private availableCache: boolean | null = null;
  private clients = new Map<string, CompassClient>();

  /** Is the `exasol-compass` CLI on PATH? Cached. */
  available(): boolean {
    if (this.availableCache !== null) return this.availableCache;
    try {
      const r = spawnSync("exasol-compass", ["--help"], { timeout: 4000 });
      this.availableCache = r.status === 0 || r.status === 1; // --help may exit 0/1
    } catch {
      this.availableCache = false;
    }
    return this.availableCache;
  }

  /**
   * Compass tools for a connection, or null if unavailable/failed (→ native KB).
   * Best-effort: spawns compass with the connection's credentials.
   */
  async tools(conn: DbConnectionInfo): Promise<ToolSet | null> {
    if (!this.available()) return null;
    try {
      let client = this.clients.get(conn.id);
      if (!client || !client.alive()) {
        client?.dispose();
        client = new CompassClient(
          "exasol-compass",
          ["serve", "--host", conn.host, "--port", String(conn.port), "--user", conn.user],
          {
            ...process.env,
            EXA_PASSWORD: conn.password,
            EXA_SSL_CERT_VALIDATION: "no",
          },
        );
        await client.initialize();
        this.clients.set(conn.id, client);
      }
      const defs = await client.listTools();
      if (!defs.length) return null;
      const out: ToolSet = {};
      for (const d of defs) {
        out[d.name] = tool({
          description: `[exasol-compass] ${d.description ?? d.name}`,
          inputSchema: jsonSchema((d.inputSchema as object) ?? { type: "object", properties: {} }),
          execute: async (args: unknown) => client!.callTool(d.name, args),
        });
      }
      log.info("compass tools loaded", { conn: conn.id, tools: defs.length });
      return out;
    } catch (e) {
      log.warn("compass unavailable — falling back to native KB", { error: String(e) });
      return null;
    }
  }

  disposeAll() {
    for (const c of this.clients.values()) c.dispose();
    this.clients.clear();
  }
}
