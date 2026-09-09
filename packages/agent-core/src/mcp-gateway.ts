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
 * The gateway is a BUS, not a single server: one connection can carry
 * several MCP services (sql, text_to_sql), and Studio itself contributes
 * bus-level services (dashboards). Selection lives in Studio under
 * Marketplace → AI clients → Databases on the gateway.
 *
 * Read-only: the sidecar rejects anything but single SELECT/WITH/DESCRIBE
 * statements on the query route, and generate_sql never executes.
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

function runQuery(database: string, sql: string, verify?: boolean): Promise<QueryOut> {
  return studio<QueryOut>("/gateway/query", { method: "POST", body: { database, sql, verify } });
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

type GatewayDb = { id: string; name: string; exposed: boolean; caps: { sql: boolean; nl2sql: boolean } };

server.tool(
  "list_databases",
  "List the databases on the Exasol Studio gateway bus with the MCP services each one carries (sql = schema discovery + read-only queries, text_to_sql = generate_sql). Call this first: the database tools take one of these names as their `database` argument. Databases with MCP exposure turned off are reported separately and cannot be used.",
  {},
  async () => {
    try {
      const { databases, services } = await studio<{ databases: GatewayDb[]; services: { id: string; exposed: boolean }[] }>(
        "/gateway/databases",
      );
      if (!databases.length) return text({ databases: [], hint: "No databases connected — connect one in Exasol Studio's sidebar." });
      const on = databases
        .filter((d) => d.exposed)
        .map((d) => ({
          name: d.name,
          services: [...(d.caps.sql ? ["sql"] : []), ...(d.caps.nl2sql ? ["text_to_sql"] : [])],
        }));
      const off = databases.filter((d) => !d.exposed).map((d) => d.name);
      return text({
        databases: on,
        studioServices: (services ?? []).filter((sv) => sv.exposed).map((sv) => sv.id),
        ...(off.length
          ? { mcpDisabled: off, hint: "These are connected in Exasol Studio but their MCP exposure is off — enable them under Marketplace → AI clients → Databases on the gateway." }
          : {}),
      });
    } catch (e) {
      return errText(e);
    }
  },
);

server.tool(
  "recall_memory",
  "Memory: recall durable facts Studio remembers — the user's preferences and verified notes about a database — ranked for your query. Use it to avoid re-asking what is already known.",
  { database: DB_ARG.optional(), query: z.string().describe("What to recall, in plain language.") },
  async ({ database, query }) => {
    try {
      return text(await studio("/gateway/memory", { method: "POST", body: { database, query } }));
    } catch (e) {
      return errText(e);
    }
  },
);

server.tool(
  "remember",
  "Memory: store ONE durable fact — a user preference (scope 'user') or a verified fact about a database (scope 'project', the default). Keep it short and true; do not store secrets.",
  {
    database: DB_ARG.optional(),
    note: z.string().describe("The fact to remember, one sentence."),
    scope: z.enum(["user", "project"]).optional().describe("'user' prefs or 'project' DB facts (default)."),
  },
  async ({ database, note, scope }) => {
    try {
      return text(await studio("/gateway/memory/remember", { method: "POST", body: { database, note, scope } }));
    } catch (e) {
      return errText(e);
    }
  },
);

server.tool(
  "search_knowledge",
  "Knowledge base: search what Exasol Studio already learned about a database — per-table summaries, key columns, and relationships — for a question. Call this BEFORE generate_sql or list_tables to ground answers in the real schema graph instead of rediscovering it. Returns the most relevant table cards.",
  {
    database: DB_ARG,
    question: z.string().describe("What you want to know, in plain language (e.g. \"customer orders and revenue\")."),
    limit: z.number().int().min(1).max(20).optional().describe("Max table cards to return (default 5)."),
  },
  async ({ database, question, limit }) => {
    try {
      return text(await studio("/gateway/kb", { method: "POST", body: { database, question, limit } }));
    } catch (e) {
      return errText(e);
    }
  },
);

server.tool(
  "generate_sql",
  "Text-to-SQL service: turn a natural-language question into ONE read-only Exasol SQL statement, grounded in the database's real schema. The SQL is returned for inspection and is NOT executed — review it, then run it with run_query.",
  { database: DB_ARG, question: z.string().describe("The question to answer, in plain language.") },
  async ({ database, question }) => {
    try {
      const out = await studio<{ database: string; sql: string }>("/gateway/nl2sql", {
        method: "POST",
        body: { database, question },
      });
      return text({ ...out, next: "Inspect this SQL, then execute it with run_query." });
    } catch (e) {
      return errText(e);
    }
  },
);

server.tool(
  "list_dashboards",
  "Dashboards service: list the BI dashboards saved in Exasol Studio (id, title, group, panel count).",
  {},
  async () => {
    try {
      return text(await studio("/gateway/dashboards"));
    } catch (e) {
      return errText(e);
    }
  },
);

server.tool(
  "get_dashboard",
  "Dashboards service: fetch one Studio dashboard definition — its panels carry the SQL each chart runs, which you can inspect or reuse with run_query.",
  { id: z.string().describe("Dashboard id from list_dashboards.") },
  async ({ id }) => {
    try {
      return text(await studio(`/gateway/dashboards/${encodeURIComponent(id)}`));
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
  "Run a read-only SQL statement (SELECT / WITH / DESCRIBE — one statement per call) against one connected database. Results are capped; add LIMIT for big tables. Exasol folds unquoted identifiers to UPPERCASE — double-quote identifiers to keep case. " +
    "Set verify:true on the query whose result you are about to present as your final answer: Studio re-runs it on an INDEPENDENT database session and returns a `verification` stamp (verified / mismatch / unverified) — quote that stamp with your answer. Leave verify off for exploration.",
  {
    database: DB_ARG,
    sql: z.string().describe("The SQL statement to run."),
    verify: z
      .boolean()
      .optional()
      .describe("true = independently reproduce this result and stamp it (use on the final answer-backing query only)."),
  },
  async ({ database, sql, verify }) => {
    try {
      return text(await runQuery(database, sql, verify));
    } catch (e) {
      return errText(e);
    }
  },
);

// ── P2: explicit plans (docs/agentic-architecture-spec.md) ──────────────────
server.tool(
  "propose_plan",
  "For MULTI-STEP work (loading files then querying, building something across several tools, any task with 3+ dependent actions): propose an explicit plan FIRST. The plan renders live in Exasol Studio with per-step status. Steps may name the tool and/or the SQL they intend to run; `dependsOn` lists step ids that must finish first. Plans containing write steps (imports, DDL/DML, installs) require the USER's explicit go-ahead — present the plan, wait for their yes, then call approve_plan. Skip plans entirely for single-step questions.",
  {
    goal: z.string().describe("One line: what the whole plan achieves."),
    steps: z
      .array(
        z.object({
          id: z.string().optional().describe("Short id (s1, s2, …) — auto-assigned when omitted."),
          title: z.string().describe("What this step does, user-readable."),
          tool: z.string().optional().describe("Tool the step will use (e.g. run_query, import via Studio)."),
          sql: z.string().optional().describe("SQL the step will run, when known."),
          dependsOn: z.array(z.string()).optional().describe("Step ids that must be done first."),
          onFailure: z.string().optional().describe("Id of a compensation step (e.g. drop the staging table) to run only if THIS step fails hard. The referenced step is excluded from normal execution."),
        }),
      )
      .min(1)
      .max(12),
  },
  async ({ goal, steps }) => {
    try {
      return text(await studio("/gateway/plan", { method: "POST", body: { goal, steps } }));
    } catch (e) {
      return errText(e);
    }
  },
);

server.tool(
  "approve_plan",
  "Mark the current plan approved — call ONLY after the user explicitly said yes to a plan with write steps. Never approve on their behalf.",
  { planId: z.string().optional().describe("Defaults to the current plan.") },
  async ({ planId }) => {
    try {
      return text(await studio("/gateway/plan/approve", { method: "POST", body: { planId } }));
    } catch (e) {
      return errText(e);
    }
  },
);

server.tool(
  "update_plan_step",
  "Advance a plan step as you work: running when you start it, done/failed (with a short note) when it settles. Keep the plan truthful — the user watches it live. Transitions are enforced (a step cannot start before its dependencies are done; write plans must be approved first).",
  {
    planId: z.string().optional().describe("Defaults to the current plan."),
    stepId: z.string(),
    status: z.enum(["running", "done", "failed", "skipped"]),
    note: z.string().optional().describe("Short outcome note (row counts, error reason)."),
  },
  async ({ planId, stepId, status, note }) => {
    try {
      return text(await studio("/gateway/plan/step", { method: "POST", body: { planId, stepId, status, note } }));
    } catch (e) {
      return errText(e);
    }
  },
);

server.tool(
  "semantic_models",
  "Snapshot of the Semantic Views layer on a connected database: models (name, DRAFT/PUBLISHED status, published schema), open validation issues, and `schemasWithoutModel` — datasets no model covers yet. Call this FIRST on databases with Semantic Views and prefer published measures/dimensions over ad-hoc SQL. When a freshly loaded dataset appears under schemasWithoutModel, OFFER to draft a model for it. DRAFTING RECIPE (never guess syntax — every admin script's exact parameter names and call template are one query away: SELECT SCRIPT_NAME, PARAMETER_NAME, CALL_TEMPLATE FROM SEMANTIC_CATALOG.ADMIN_SCRIPT_PARAMETERS via run_query): propose ONE plan whose steps are each `EXECUTE SCRIPT SEMANTIC_ADMIN.CALL_ADMIN_JSON('<SCRIPT>', '<json args>')` — CREATE_MODEL, ADD_ENTITY per table (with grain + primary_key_expr), ADD_RELATIONSHIP + ADD_UNIQUE_KEY_WITH_COLUMNS + ADD_RELATIONSHIP_KEY_MAPPING per join, ADD_SEMANTIC_OBJECT, ADD_DIMENSION per attribute, APPLY_SEMANTIC_DEFINITION for facts/metrics, then VALIDATE_MODEL — get the user's approval, execute_plan. The model stays a DRAFT until the user says publish.",
  { database: z.string().describe("Connected database (name or id from list_databases).") },
  async ({ database }) => {
    try {
      return text(await studio(`/gateway/semantic/models?database=${encodeURIComponent(database)}`, { method: "GET" }));
    } catch (e) {
      return errText(e);
    }
  },
);

server.tool(
  "semantic_call",
  "Run ONE read-only SEMANTIC_ADMIN script by name (audited list: COMPILE_REQUEST_JSON, COMPILE_SQL, DESCRIBE_SEMANTIC_OBJECT/METRIC, SEARCH_SEMANTIC_OBJECTS, GET_BUSINESS_GLOSSARY, EXPLAIN_*, EXPORT_*, SUGGEST_GRAIN_METADATA). Compile semantic requests here, then execute ONLY the returned GENERATED_SQL with run_query. Anything that WRITES to the catalog — including VALIDATE_MODEL (it records validation runs; the automatic sync validates for you) and all CREATE/ADD/… scripts — is refused on this tool: run those as EXECUTE SCRIPT steps in an approved plan instead.",
  {
    database: z.string().describe("Connected database (name or id)."),
    script: z.string().describe("SEMANTIC_ADMIN script name, e.g. COMPILE_SQL"),
    args: z.record(z.any()).optional().describe("Named parameters; omit optional ones entirely (never pass null)."),
  },
  async ({ database, script, args }) => {
    try {
      return text(await studio("/gateway/semantic", { method: "POST", body: { database, script, args: args ?? {} } }));
    } catch (e) {
      return errText(e);
    }
  },
);

server.tool(
  "current_plan",
  "The CURRENT plan and its per-step status — check this FIRST when the user says 'continue', 'do it', 'finish the todo list', or refers to pending work: the open plan IS the todo list. Resume by finishing its pending steps (update_plan_step / execute_plan for SQL steps), or propose a corrected plan if the existing one is malformed (proposing supersedes it as current).",
  {},
  async () => {
    try {
      return text(await studio("/gateway/plan/current", { method: "GET" }));
    } catch (e) {
      return errText(e);
    }
  },
);

server.tool(
  "execute_plan",
  "Execute the current plan's SQL steps as a dependency DAG: independent steps run IN PARALLEL, transient failures retry once with backoff, a hard failure skips its dependents and runs the step's onFailure compensation, and every transition persists (a crash resumes by calling this again). Requirements: every unfinished step must carry `sql` (finish tool-shaped steps yourself via update_plan_step first), and a plan with write steps must be approved (approve_plan after the user's yes). Steps update live in Studio while it runs. Prefer this over running the steps one-by-one whenever the plan has 2+ independent SQL steps; when a step's own SQL can fan out inside the database (DISTRIBUTE BY + SET UDFs, Lua pquery scripts, scheduler AFTER chains), write the step's SQL that way and let the database do the heavy graph.",
  {
    database: z.string().describe("Connected database to run against (name or id from list_databases)."),
    planId: z.string().optional().describe("Defaults to the current plan."),
  },
  async ({ database, planId }) => {
    try {
      return text(await studio("/gateway/plan/execute", { method: "POST", body: { database, planId } }));
    } catch (e) {
      return errText(e);
    }
  },
);

server.tool(
  "control_app",
  "Drive Exasol Studio's UI directly (when app control is enabled): open a view, close the active tab, search, list/check/install/uninstall a marketplace component, or connect/disconnect a database. Prefer this over telling the user to click. `action` is the verb; `args` carries its parameters. Actions: open {target: marketplace|notebook|visualizer|git|skills|mcp|settings|docs|assistant|search, arg?}, close_tab {title?}, search {query}, list_components {}, component_status {id}, install_component {id}, uninstall_component {id}, connect {name?}, disconnect {name?}. For an install, first check with component_status and ASK the user before installing.",
  {
    action: z.string().describe("The verb, e.g. open, search, install_component, list_components."),
    args: z.record(z.any()).optional().describe("Parameters for the action, e.g. { target: \"marketplace\" } or { id: \"json-tables\" }."),
  },
  async ({ action, args }) => {
    try {
      const r = await studio<{ ok: boolean; data?: unknown; error?: string }>("/gateway/action", { method: "POST", body: { action, args: args ?? {} } });
      if (!r.ok) return errText(new Error(r.error ?? "action failed"));
      return text(r.data ?? { ok: true });
    } catch (e) {
      return errText(e);
    }
  },
);

void server.connect(new StdioServerTransport());
