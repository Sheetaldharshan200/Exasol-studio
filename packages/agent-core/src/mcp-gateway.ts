/**
 * Exasol Studio MCP gateway — the stdio MCP server external AI clients
 * (Claude Desktop/Code, Cursor, Copilot, Gemini CLI, Codex, OpenCode) launch
 * to talk to EVERY database currently connected in Exasol Studio.
 *
 * It holds no credentials and opens no database sockets itself: each tool
 * call is proxied to the running Studio agent sidecar (found via the
 * `gateway.json` marker the sidecar writes on startup), which owns the live
 * pools. One MCP entry ("exasol-studio") therefore follows whatever the user
 * connects or disconnects in Studio — no per-database MCP configs.
 *
 * Read-only: the sidecar rejects anything but single SELECT/WITH/DESCRIBE
 * statements on this route.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/** Where Studio's agent data dir lives. The client config sets
 *  EXASOL_STUDIO_AGENT_DIR explicitly; the platform defaults make even a
 *  hand-written config work. */
function agentDir(): string {
  const env = process.env.EXASOL_STUDIO_AGENT_DIR;
  if (env && env.trim()) return env.trim();
  const home = homedir();
  if (process.platform === "darwin") return join(home, "Library/Application Support/com.exasol.studio/agent");
  if (process.platform === "win32")
    return join(process.env.APPDATA ?? join(home, "AppData/Roaming"), "com.exasol.studio/agent");
  return join(home, ".local/share/com.exasol.studio/agent");
}

const NOT_RUNNING =
  "Exasol Studio is not running (or no database is connected yet). Open Exasol Studio, connect a database in the sidebar, then try again.";

/** Call the sidecar. gateway.json is re-read on EVERY call so a Studio
 *  restart (new port/token) never requires restarting the MCP client. */
async function studio<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let port: number, token: string;
  try {
    const raw = JSON.parse(readFileSync(join(agentDir(), "gateway.json"), "utf8"));
    port = raw.port;
    token = raw.token;
    if (!port || !token) throw new Error("bad marker");
  } catch {
    throw new Error(NOT_RUNNING);
  }
  let res: Response;
  try {
    res = await fetch(`http://127.0.0.1:${port}/v1${path}`, {
      method: init?.method ?? "GET",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new Error(NOT_RUNNING); // stale marker — Studio was quit
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Studio gateway error (HTTP ${res.status})`);
  return data;
}

type QueryOut = {
  database: string;
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
};

function runQuery(database: string, sql: string): Promise<QueryOut> {
  return studio<QueryOut>("/gateway/query", { method: "POST", body: { database, sql } });
}

/** Single-quote string literal for interpolating user args into canned SQL. */
function lit(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

function text(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function errText(e: unknown) {
  return { isError: true as const, content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }] };
}

const server = new McpServer({ name: "exasol-studio", version: "1.0.0" });

const DB_ARG = z
  .string()
  .describe("Which connected database to use — a name from list_databases (e.g. \"Exasol-nano\").");

server.tool(
  "list_databases",
  "List every database currently connected in Exasol Studio. Call this first: every other tool takes one of these names as its `database` argument.",
  {},
  async () => {
    try {
      const { databases } = await studio<{ databases: { id: string; name: string }[] }>("/gateway/databases");
      if (!databases.length) return text({ databases: [], hint: "No databases connected — connect one in Exasol Studio's sidebar." });
      return text({ databases: databases.map((d) => d.name) });
    } catch (e) {
      return errText(e);
    }
  },
);

server.tool(
  "list_schemas",
  "List the schemas in one connected database.",
  { database: DB_ARG },
  async ({ database }) => {
    try {
      return text(await runQuery(database, "SELECT SCHEMA_NAME, SCHEMA_OWNER FROM SYS.EXA_SCHEMAS ORDER BY SCHEMA_NAME"));
    } catch (e) {
      return errText(e);
    }
  },
);

server.tool(
  "list_tables",
  "List the tables and views in a schema of one connected database.",
  { database: DB_ARG, schema: z.string().describe("Schema name, e.g. \"TPCH\".") },
  async ({ database, schema }) => {
    try {
      const s = lit(schema.toUpperCase());
      return text(
        await runQuery(
          database,
          `SELECT TABLE_NAME AS NAME, 'TABLE' AS KIND FROM SYS.EXA_ALL_TABLES WHERE TABLE_SCHEMA = ${s}
           UNION ALL SELECT VIEW_NAME, 'VIEW' FROM SYS.EXA_ALL_VIEWS WHERE VIEW_SCHEMA = ${s} ORDER BY 1`,
        ),
      );
    } catch (e) {
      return errText(e);
    }
  },
);

server.tool(
  "describe_table",
  "Show the columns (name, type, nullability) of a table or view.",
  {
    database: DB_ARG,
    schema: z.string().describe("Schema name."),
    table: z.string().describe("Table or view name."),
  },
  async ({ database, schema, table }) => {
    try {
      return text(
        await runQuery(
          database,
          `SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_IS_NULLABLE, COLUMN_COMMENT FROM SYS.EXA_ALL_COLUMNS
           WHERE COLUMN_SCHEMA = ${lit(schema.toUpperCase())} AND COLUMN_TABLE = ${lit(table.toUpperCase())}
           ORDER BY COLUMN_ORDINAL_POSITION`,
        ),
      );
    } catch (e) {
      return errText(e);
    }
  },
);

server.tool(
  "run_query",
  "Run a read-only SQL statement (SELECT / WITH / DESCRIBE — one statement per call) against one connected database. Results are capped; add LIMIT for big tables. Exasol folds unquoted identifiers to UPPERCASE — double-quote identifiers to keep case.",
  { database: DB_ARG, sql: z.string().describe("The SQL statement to run.") },
  async ({ database, sql }) => {
    try {
      return text(await runQuery(database, sql));
    } catch (e) {
      return errText(e);
    }
  },
);

void server.connect(new StdioServerTransport());
