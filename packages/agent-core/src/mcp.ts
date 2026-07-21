import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { log } from "./log.ts";
import { Audit } from "./audit.ts";
import { SecretBox } from "./secretbox.ts";

/**
 * Connector manifests: the product source of truth for what each first-party
 * connector is allowed to do, how it authenticates, and its licensing basis.
 * Third-party (custom) servers get the conservative default manifest.
 */
export type ConnectorManifest = {
  id: string;
  license: string;
  auth: "user_token" | "none" | "oauth_or_pat";
  scopes: string[];
  can_read: boolean;
  can_write: boolean;
  can_export: boolean;
  requires_user_credentials: boolean;
};

export const CONNECTOR_MANIFESTS: ConnectorManifest[] = [
  { id: "jira-confluence", license: "MIT (mcp-atlassian) / Atlassian API terms", auth: "user_token", scopes: ["issues:read", "pages:read"], can_read: true, can_write: false, can_export: true, requires_user_credentials: true },
  { id: "github", license: "MIT (@modelcontextprotocol/server-github) / GitHub API terms", auth: "oauth_or_pat", scopes: ["repo:read", "issues:read"], can_read: true, can_write: true, can_export: true, requires_user_credentials: true },
  { id: "excel-workbooks", license: "MIT (excel-mcp-server)", auth: "none", scopes: ["local-files"], can_read: true, can_write: true, can_export: true, requires_user_credentials: false },
  { id: "local-files", license: "MIT (@modelcontextprotocol/server-filesystem)", auth: "none", scopes: ["local-files"], can_read: true, can_write: true, can_export: true, requires_user_credentials: false },
];

const DEFAULT_MANIFEST: Omit<ConnectorManifest, "id"> = {
  license: "third-party — check the server's own license and provider API terms",
  auth: "user_token",
  scopes: [],
  can_read: true,
  can_write: true,
  can_export: true,
  requires_user_credentials: false,
};

export function manifestFor(id: string): ConnectorManifest {
  return CONNECTOR_MANIFESTS.find((m) => m.id === id) ?? { id, ...DEFAULT_MANIFEST };
}

/**
 * MCP marketplace backbone: Studio as an MCP CLIENT host. Users connect
 * external MCP servers (Jira, Excel, filesystem, GitHub, …); their tools are
 * bridged into the agent's toolset (every call approval-gated), so external
 * data can flow INTO Exasol through one conversation.
 */

export type McpServerConfig = {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
};

export type McpToolInfo = {
  serverId: string;
  serverName: string;
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments (passed through to the model). */
  inputSchema: unknown;
};

type Live = { client: Client; tools: McpToolInfo[] };

/** GUI apps get a restricted PATH — npx/uvx live in user dirs. */
const SPAWN_PATH = [
  join(homedir(), ".local/bin"),
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  process.env.PATH ?? "",
].join(":");

export class McpManager {
  private file: string;
  private servers: McpServerConfig[] = [];
  private live = new Map<string, Live>();
  readonly audit: Audit;
  private box: SecretBox;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.audit = new Audit(dataDir);
    this.box = new SecretBox(dataDir);
    this.file = join(dataDir, "mcp-servers.json");
    try {
      this.servers = JSON.parse(readFileSync(this.file, "utf8")) as McpServerConfig[];
    } catch {
      this.servers = [];
    }
  }

  private persist() {
    writeFileSync(this.file, JSON.stringify(this.servers, null, 2));
  }

  list(): (McpServerConfig & { connected: boolean; toolCount: number })[] {
    return this.servers.map((s) => ({
      ...s,
      env: s.env ? Object.fromEntries(Object.keys(s.env).map((k) => [k, "•••"])) : undefined, // never leak secrets
      connected: this.live.has(s.id),
      toolCount: this.live.get(s.id)?.tools.length ?? 0,
      tools: (this.live.get(s.id)?.tools ?? []).slice(0, 12).map((t) => t.name),
    }));
  }

  async add(cfg: Omit<McpServerConfig, "id" | "enabled">): Promise<McpServerConfig> {
    const id = cfg.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `srv-${Date.now()}`;
    const env = cfg.env
      ? Object.fromEntries(Object.entries(cfg.env).map(([k, v]) => [k, this.box.seal(v)]))
      : undefined;
    const server: McpServerConfig = { id, enabled: true, ...cfg, env };
    this.servers = [...this.servers.filter((s) => s.id !== id), server];
    this.persist();
    this.audit.log({ kind: "connector.add", id, name: cfg.name, command: cfg.command, manifest: manifestFor(id) });
    await this.connect(id);
    return server;
  }

  async remove(id: string): Promise<void> {
    await this.disconnect(id);
    this.servers = this.servers.filter((s) => s.id !== id);
    this.persist();
    this.audit.log({ kind: "connector.remove", id });
  }

  async connect(id: string): Promise<{ ok: boolean; error?: string; tools?: number }> {
    const cfg = this.servers.find((s) => s.id === id);
    if (!cfg) return { ok: false, error: "unknown server" };
    await this.disconnect(id);
    try {
      const transport = new StdioClientTransport({
        command: cfg.command,
        args: cfg.args,
        env: {
          ...process.env,
          PATH: SPAWN_PATH,
          ...Object.fromEntries(Object.entries(cfg.env ?? {}).map(([k, v]) => [k, this.box.open(v)])),
        } as Record<string, string>,
        stderr: "ignore",
      });
      const client = new Client({ name: "exasol-studio", version: "1.0.0" }, { capabilities: {} });
      await client.connect(transport);
      const listed = await client.listTools();
      const tools: McpToolInfo[] = (listed.tools ?? []).map((t) => ({
        serverId: cfg.id,
        serverName: cfg.name,
        name: t.name,
        description: t.description ?? "",
        inputSchema: t.inputSchema,
      }));
      this.live.set(id, { client, tools });
      log.info("mcp connected", { id, tools: tools.length });
      this.audit.log({ kind: "connector.connect", id, ok: true, tools: tools.length });
      return { ok: true, tools: tools.length };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      log.warn("mcp connect failed", { id, error });
      this.audit.log({ kind: "connector.connect", id, ok: false, error });
      return { ok: false, error };
    }
  }

  async disconnect(id: string): Promise<void> {
    const live = this.live.get(id);
    if (live) {
      this.live.delete(id);
      await live.client.close().catch(() => undefined);
    }
  }

  /** Reconnect every enabled server (called at startup). */
  async connectAll(): Promise<void> {
    for (const s of this.servers.filter((x) => x.enabled)) {
      await this.connect(s.id).catch(() => undefined);
    }
  }

  /** All tools across connected servers — bridged into the agent's toolset. */
  tools(): McpToolInfo[] {
    return [...this.live.values()].flatMap((l) => l.tools);
  }

  async call(serverId: string, tool: string, args: Record<string, unknown>): Promise<string> {
    const live = this.live.get(serverId);
    if (!live) throw new Error(`MCP server "${serverId}" is not connected`);
    const started = Date.now();
    try {
      const res = await live.client.callTool({ name: tool, arguments: args });
      const content = (res.content ?? []) as { type: string; text?: string }[];
      const text = content.map((c) => (c.type === "text" ? c.text ?? "" : `[${c.type}]`)).join("\n");
      if (res.isError) throw new Error(text || "MCP tool returned an error");
      this.audit.log({ kind: "connector.call", server: serverId, tool, ok: true, ms: Date.now() - started, bytes: text.length });
      return text;
    } catch (e) {
      this.audit.log({ kind: "connector.call", server: serverId, tool, ok: false, ms: Date.now() - started, error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  }

  /** Denials are audit events too — the record of what the user refused. */
  auditDenied(serverId: string, tool: string): void {
    this.audit.log({ kind: "connector.call", server: serverId, tool, denied: true });
  }
}
