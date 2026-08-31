import { generateText, tool, type ToolSet } from "./llm.ts";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import type { DbRegistry, QueryOutput } from "./db.ts";
import type { Session } from "./session.ts";
import type { AgentSettings } from "./config.ts";
import type { MemoryStore } from "./memory.ts";
import type { DocumentStore } from "./documents.ts";
import type { SessionStore } from "./session.ts";
import type { KnowledgeGraph } from "./kb.ts";
import { PanelSchema, type DashboardStore } from "./dashboards.ts";
import type { ArtifactStore } from "./artifacts.ts";
import type { Skill } from "./skills.ts";
import { parseCsv, buildPlan, buildInsert, typeToSql, objectsToTable, type CsvTable } from "./csv-import.ts";
import { TaskManager } from "./a2a.ts";
import { exapumpLoad, findExapump } from "./exapump.ts";
import { writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { TurnBoard, Finding } from "./board.ts";
import { parquetReadObjects } from "hyparquet";
import uiMap from "../data/ui-map.json" with { type: "json" };

// The agent's Exasol tools. Metadata queries are ported from the official
// exasol/mcp-server (MIT) SYS-catalog SQL. Reads run freely (row-capped);
// anything that mutates goes through the human-in-the-loop permission gate.

const READ_KEYWORDS = new Set(["SELECT", "WITH", "SHOW", "DESC", "DESCRIBE", "VALUES", "EXPLAIN"]);

/**
 * Classify a statement: reads auto-run, everything else needs approval.
 *
 * Fail-closed by construction — the only acceptable failure mode is an
 * unnecessary approval prompt, never an unapproved mutation. Beyond the
 * first-keyword whitelist, two bypasses are explicitly closed (both found in
 * review): `SELECT … INTO TABLE t` is Exasol's CTAS variant and mutates state,
 * and `SELECT 1; DROP TABLE t` is a batch whose first token lies about the
 * rest. String literals and quoted identifiers are blinded first so their
 * CONTENTS can neither fake nor hide a keyword or semicolon; an unterminated
 * literal is left visible, which errs toward "write".
 */
export function classifySql(sql: string): "read" | "write" {
  const blinded = sql
    .replace(/--[^\n]*\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
    .trim();
  const first = blinded.split(/[\s(]+/)[0]?.toUpperCase();
  if (!READ_KEYWORDS.has(first ?? "")) return "write";
  // A second statement after a semicolon makes the whole batch a write.
  const semi = blinded.indexOf(";");
  if (semi !== -1 && blinded.slice(semi + 1).trim() !== "") return "write";
  // SELECT … INTO TABLE creates a table. INTO cannot appear unquoted in a
  // legitimate read (it is reserved), so its presence anywhere outside
  // strings/identifiers means this is not a plain read.
  if (/\bINTO\b/i.test(blinded)) return "write";
  return "read";
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Escape a string literal for SQL. */
function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Cap a single cell so one huge VARCHAR/JSON value can't flood the context. */
const CELL_CAP = 300;
function capCell(v: unknown): unknown {
  if (typeof v === "string" && v.length > CELL_CAP) return v.slice(0, CELL_CAP) + `… [+${v.length - CELL_CAP} chars]`;
  return v;
}

function shape(out: QueryOutput) {
  return {
    columns: out.columns,
    rows: out.rows.map((r) => r.map(capCell)),
    rowCount: out.rowCount,
    ...(out.truncated ? { note: `Only the first ${out.rows.length} rows are shown.` } : {}),
  };
}

export function buildTools(ctx: {
  db: DbRegistry;
  session: Session;
  connectionId: string | null;
  memory?: MemoryStore;
  documents?: DocumentStore;
  store?: SessionStore;
  kb?: KnowledgeGraph;
  settings?: AgentSettings;
  dashboards?: DashboardStore;
  artifacts?: ArtifactStore;
  /** Model for sub-agents; omitting disables spawn_researcher. */
  model?: BaseChatModel;
  /** Read-only mode (sub-agents): writes fail instead of asking. */
  readOnly?: boolean;
  skills?: Skill[];
  /** Desktop bootstrap confirmed that the SEMANTIC_ADMIN scripts are ready. */
  semanticViewsReady?: boolean;
  /** Connection profile that owns the ready Semantic Views installation. */
  semanticViewsConnectionId?: string;
  /** Where this session runs — the guidance for "not connected" differs. */
  surface?: "app" | "cli";
  /** Shared per-turn findings board for multi-agent work. */
  board?: TurnBoard;
  /** Connected external MCP servers — their tools are bridged in. */
  mcp?: import("./mcp.ts").McpManager;
}): ToolSet {
  const { db, session } = ctx;

  const requireConn = (): string => {
    if (!ctx.connectionId) {
      const saved = db.list();
      if (ctx.surface === "cli") {
        throw new Error(
          "No database connection is active in this terminal session. Tell the user to run /connect (a guided form) or restart with --db exa://user:pass@host:port. Do not ask for credentials in chat.",
        );
      }
      throw new Error(
        saved.length
          ? `No connection is active in this chat. Saved connections exist (${saved.map((c) => c.name).join(", ")}) — tell the user to connect via the Connect button in the title bar, then retry. Do not ask for credentials.`
          : "No database connection is active. Tell the user to connect via the Connect button in the title bar; the saved Local Exasol profile contains its generated vault-backed credential. Do not ask for credentials in chat — Exasol Studio manages them.",
      );
    }
    return ctx.connectionId;
  };

  const tools: ToolSet = {
    ...(ctx.skills && ctx.skills.length
      ? {
          load_skill: tool({
            description: "Load a skill's full step-by-step instructions before doing that kind of task.",
            inputSchema: z.object({ name: z.string() }),
            execute: async ({ name }) => {
              const sk = ctx.skills!.find((x) => x.name === name || x.name.includes(name));
              return sk ? { name: sk.name, instructions: sk.body } : { error: `No skill "${name}".`, available: ctx.skills!.map((x) => x.name) };
            },
          }),
        }
      : {}),

    ...(ctx.kb
      ? {
          kb_search: tool({
            description:
              "FASTEST way to find the right tables: search the pre-built schema knowledge graph with the user's question. " +
              "Returns compact table cards (columns, row counts, join conditions). Use this FIRST for any data question, then verify details with describe_table if needed.",
            inputSchema: z.object({
              question: z.string().describe("The user's question or keywords, e.g. 'revenue by region'"),
            }),
            execute: async ({ question }) => {
              const id = requireConn();
              if (!ctx.kb!.crawledAt(id)) {
                await ctx.kb!.refresh(id, db);
              }
              const cards = ctx.kb!.search(id, question);
              session.record({ kind: "tool.kb_search", question, hits: cards.length });
              return cards.length
                ? { tables: cards }
                : { tables: [], note: "No graph matches — fall back to list_schemas / list_tables discovery." };
            },
          }),

          find_columns: tool({
            description:
              "Locate WHERE data lives without reading tables: search every column across the database by keyword " +
              "(name or comment) and get each match's table, type, and row count. Like grep for the schema — " +
              "use it to find which table holds 'revenue', 'email', 'timestamp', etc. before writing SQL.",
            inputSchema: z.object({
              keyword: z.string().describe("Substring to match in column or table names, e.g. 'price', 'date', 'email'"),
            }),
            execute: async ({ keyword }) => {
              const id = requireConn();
              const kw = keyword.replace(/'/g, "''").toUpperCase();
              const out = await db.query(
                id,
                `SELECT c.COLUMN_SCHEMA AS SCHEMA, c.COLUMN_TABLE AS TABLE_NAME, c.COLUMN_NAME AS COLUMN_NAME,
                        c.COLUMN_TYPE AS TYPE, t.TABLE_ROW_COUNT AS ROWS, c.COLUMN_COMMENT AS REMARKS
                   FROM SYS.EXA_ALL_COLUMNS c
                   LEFT JOIN SYS.EXA_ALL_TABLES t
                     ON t.TABLE_SCHEMA = c.COLUMN_SCHEMA AND t.TABLE_NAME = c.COLUMN_TABLE
                  WHERE c.COLUMN_SCHEMA NOT IN ('SYS','EXA_STATISTICS')
                    AND (UPPER(c.COLUMN_NAME) LIKE '%' || '${kw}' || '%'
                         OR UPPER(c.COLUMN_TABLE) LIKE '%' || '${kw}' || '%'
                         OR UPPER(NVL(c.COLUMN_COMMENT,'')) LIKE '%' || '${kw}' || '%')
                  ORDER BY t.TABLE_ROW_COUNT DESC NULLS LAST
                  LIMIT 60`,
              );
              session.record({ kind: "tool.find_columns", keyword, hits: out.rowCount });
              return out.rowCount
                ? { columns: shape(out) }
                : { columns: [], note: `No column or table matches "${keyword}". Try kb_search with the concept, or list_schemas.` };
            },
          }),

          kb_join_path: tool({
            description: "Find how two tables join (shortest path over foreign keys and inferred keys).",
            inputSchema: z.object({
              from_table: z.string(),
              to_table: z.string(),
            }),
            execute: async ({ from_table, to_table }) => {
              const id = requireConn();
              const path = ctx.kb!.joinPath(id, from_table, to_table);
              return path
                ? { joins: path }
                : { joins: null, note: "No known join path — inspect both tables with describe_table." };
            },
          }),

          kb_subsystem: tool({
            description:
              "Pull a whole join-connected area of the schema at once (e.g. the 'orders' subsystem). Give a table name or subsystem keyword; " +
              "returns every table in that connected area with its join edges — the efficient way to understand a domain without many describe_table calls.",
            inputSchema: z.object({
              near: z.string().describe("A table name or keyword in the area of interest"),
            }),
            execute: async ({ near }) => {
              const id = requireConn();
              const key = near.toUpperCase();
              const subs = ctx.kb!.subsystems(id);
              const match =
                subs.find((s) => s.tables.some((t) => t.toUpperCase().includes(key))) ??
                subs.find((s) => s.name.toUpperCase().includes(key));
              if (!match) return { note: `No connected subsystem found near "${near}". Try kb_search.` };
              const cards = match.tables
                .map((t) => ctx.kb!.card(id, t.split(".")[0], t.split(".")[1]))
                .filter(Boolean);
              return { subsystem: match.name, tableCount: match.tables.length, tables: cards };
            },
          }),

          kb_refresh: tool({
            description: "Re-crawl the database schema into the knowledge graph (after DDL changes).",
            inputSchema: z.object({}),
            execute: async () => {
              const id = requireConn();
              return ctx.kb!.refresh(id, db);
            },
          }),
        }
      : {}),

    list_schemas: tool({
      description: "List all schemas in the connected Exasol database.",
      inputSchema: z.object({}),
      execute: async () => {
        const id = requireConn();
        return shape(
          await db.query(id, "SELECT SCHEMA_NAME, SCHEMA_COMMENT FROM SYS.EXA_SCHEMAS ORDER BY SCHEMA_NAME"),
        );
      },
    }),

    list_tables: tool({
      description: "List tables and views in a schema, with row counts for tables.",
      inputSchema: z.object({
        schema: z.string().describe("Schema name (unquoted identifiers are UPPERCASE in Exasol)"),
      }),
      execute: async ({ schema }) => {
        const id = requireConn();
        const s = lit(schema.toUpperCase());
        const tables = await db.query(
          id,
          `SELECT TABLE_NAME AS NAME, 'TABLE' AS TYPE, TABLE_ROW_COUNT AS ROW_COUNT, TABLE_COMMENT AS REMARKS
             FROM SYS.EXA_ALL_TABLES WHERE TABLE_SCHEMA = ${s}
           UNION ALL
           SELECT VIEW_NAME, 'VIEW', NULL, VIEW_COMMENT
             FROM SYS.EXA_ALL_VIEWS WHERE VIEW_SCHEMA = ${s}
           ORDER BY 2, 1`,
        );
        return shape(tables);
      },
    }),

    describe_table: tool({
      description:
        "Describe a table or view: columns with types, nullability, defaults, comments, and primary/foreign keys.",
      inputSchema: z.object({
        schema: z.string(),
        table: z.string(),
      }),
      execute: async ({ schema, table }) => {
        const id = requireConn();
        const s = lit(schema.toUpperCase());
        const t = lit(table.toUpperCase());
        const columns = await db.query(
          id,
          `SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_IS_NULLABLE AS NULLABLE,
                  COLUMN_DEFAULT AS DEFAULT_VALUE, COLUMN_IDENTITY AS IDENTITY_START, COLUMN_COMMENT AS REMARKS
             FROM SYS.EXA_ALL_COLUMNS
            WHERE COLUMN_SCHEMA = ${s} AND COLUMN_TABLE = ${t}
            ORDER BY COLUMN_ORDINAL_POSITION`,
        );
        const constraints = await db.query(
          id,
          `SELECT c.CONSTRAINT_TYPE, cc.COLUMN_NAME,
                  cc.REFERENCED_SCHEMA, cc.REFERENCED_TABLE, cc.REFERENCED_COLUMN
             FROM SYS.EXA_ALL_CONSTRAINTS c
             JOIN SYS.EXA_ALL_CONSTRAINT_COLUMNS cc
               ON c.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA AND c.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
            WHERE c.CONSTRAINT_SCHEMA = ${s} AND c.CONSTRAINT_TABLE = ${t}
            ORDER BY c.CONSTRAINT_TYPE, cc.ORDINAL_POSITION`,
        );
        return { columns: shape(columns), constraints: shape(constraints) };
      },
    }),

    run_sql: tool({
      description:
        "Run a SQL statement on the connected Exasol database. SELECT/WITH queries run directly (row-capped). " +
        "INSERT/UPDATE/DELETE/CREATE/ALTER/DROP require the user's explicit approval — use them only when the user asked for a change.",
      inputSchema: z.object({
        sql: z.string().describe("A single Exasol SQL statement"),
        purpose: z.string().optional().describe("One short line: why this statement is needed"),
      }),
      execute: async ({ sql, purpose }) => {
        const id = requireConn();
        const kind = classifySql(sql);
        if (kind === "read") {
          if (ctx.settings?.readPolicy === "ask" && !ctx.readOnly) {
            const ok = await session.askPermission({
              tool: "run_sql",
              summary: purpose || "Run a read query",
              detail: sql,
            });
            if (!ok) return { denied: true, message: "The user declined this query." };
          }
          const started = Date.now();
          const out = await db.query(id, sql);
          session.record({ kind: "tool.run_sql", mode: "read", sql, rows: out.rowCount, ms: Date.now() - started });
          return shape(out);
        }
        // Mutation: human in the loop, always.
        if (ctx.readOnly) {
          return { denied: true, message: "This researcher context is read-only. Report the statement back instead of running it." };
        }
        if (ctx.settings?.writePolicy === "deny") {
          return {
            denied: true,
            message: "Write statements are disabled in this workspace's AI guardrails. Provide the SQL for the user to run manually instead.",
          };
        }
        const allowed = await session.askPermission({
          tool: "run_sql",
          summary: purpose || "Execute a statement that modifies the database",
          detail: sql,
        });
        session.record({ kind: "tool.run_sql", mode: "write", sql, allowed });
        if (!allowed) {
          return { denied: true, message: "The user declined this statement. Do not retry it; ask what they want instead." };
        }
        const started = Date.now();
        const affected = await db.execute(id, sql);
        session.record({ kind: "tool.run_sql", mode: "write-done", sql, affected, ms: Date.now() - started });
        // DDL (CREATE/DROP/ALTER) reports 0 rows — say so explicitly so the
        // model doesn't mistake success for a no-op and re-verify in a loop.
        return {
          ok: true,
          affectedRows: affected,
          message: `Statement executed successfully${affected > 0 ? ` (${affected} row(s) affected)` : " (DDL — no rows affected, this is normal)"}. The change is applied; do not re-verify by listing everything.`,
        };
      },
    }),

    ...(ctx.semanticViewsReady
      ? {
          semantic_compile_request: tool({
            description:
              "Compile a structured analytics request through Exasol Semantic Views. " +
              "This calls SEMANTIC_ADMIN.COMPILE_REQUEST_JSON as a read-like compiler operation and returns GENERATED_SQL, PLAN_JSON, clarification, and trace handles. " +
              "After STATUS=OK, execute only the returned GENERATED_SQL with run_sql.",
            inputSchema: z.object({
              request: z.record(z.unknown()).describe("Semantic request with model, object, metrics, dimensions, filters, order_by, limit, and client"),
            }),
            execute: async ({ request }) => {
              const id = requireConn();
              if (id !== ctx.semanticViewsConnectionId) {
                return { error: "Semantic Views is not ready for the active connection." };
              }
              const requestJson = JSON.stringify(request);
              const out = await db.query(
                id,
                `EXECUTE SCRIPT SEMANTIC_ADMIN.COMPILE_REQUEST_JSON(${lit(requestJson)})`,
              );
              session.record({ kind: "tool.semantic_compile_request", request, rows: out.rowCount });
              return shape(out);
            },
          }),

          semantic_compile_sql: tool({
            description:
              "Compile user-supplied semantic SQL through SEMANTIC_ADMIN.COMPILE_SQL. " +
              "Supports semantic fields, MEASURE(), and GROUP BY ALL. This is a read-like compiler operation; after STATUS=OK, execute only the returned GENERATED_SQL with run_sql.",
            inputSchema: z.object({
              sql: z.string().min(1).describe("Semantic SQL to compile, not physical-table SQL"),
            }),
            execute: async ({ sql }) => {
              const id = requireConn();
              if (id !== ctx.semanticViewsConnectionId) {
                return { error: "Semantic Views is not ready for the active connection." };
              }
              const out = await db.query(id, `EXECUTE SCRIPT SEMANTIC_ADMIN.COMPILE_SQL(${lit(sql)})`);
              session.record({ kind: "tool.semantic_compile_sql", sql, rows: out.rowCount });
              return shape(out);
            },
          }),
        }
      : {}),

    profile_query: tool({
      description:
        "Profile a SELECT query to analyze performance (Exasol has no EXPLAIN — profiling is the mechanism). " +
        "Returns the per-part execution plan breakdown with durations, row counts, and CPU.",
      inputSchema: z.object({
        sql: z.string().describe("The SELECT query to profile"),
      }),
      execute: async ({ sql }) => {
        const id = requireConn();
        if (classifySql(sql) !== "read") {
          return { error: "Only read queries can be profiled." };
        }
        return db.sameSession(id, async (d) => {
          await d.execute("ALTER SESSION SET PROFILE = 'ON'");
          try {
            await d.query(sql);
          } finally {
            await d.execute("ALTER SESSION SET PROFILE = 'OFF'").catch(() => undefined);
          }
          await d.execute("FLUSH STATISTICS");
          const prof = await d.query(
            `SELECT STMT_ID, PART_ID, PART_NAME, PART_INFO, OBJECT_SCHEMA, OBJECT_NAME,
                    OBJECT_ROWS, OUT_ROWS, DURATION, CPU, TEMP_DB_RAM_PEAK, HDD_READ
               FROM EXA_STATISTICS.EXA_USER_PROFILE_LAST_DAY
              WHERE SESSION_ID = CURRENT_SESSION
              ORDER BY STMT_ID DESC, PART_ID
              LIMIT 40`,
          );
          const columns = prof.getColumns().map((c) => c.name);
          const rows = prof.getRows();
          // Keep only the parts of the most recent (profiled) statement.
          const latest = rows.length ? rows[0].STMT_ID : null;
          const parts = rows.filter((r) => r.STMT_ID === latest).map((r) => columns.map((c) => r[c] ?? null));
          return { columns, rows: parts, rowCount: parts.length };
        });
      },
    }),

    ...(ctx.artifacts && !ctx.readOnly
      ? {
          render_artifact: tool({
            description:
              "Render a self-contained HTML page as a tab in Exasol Studio — for rich insights, reports, or small interactive views. " +
              "html must be ONE complete document with inline CSS/JS and NO external URLs.",
            inputSchema: z.object({
              title: z.string(),
              html: z.string().min(1),
            }),
            execute: async ({ title, html }) => {
              const a = ctx.artifacts!.save(title, html);
              session.record({ kind: "artifact.created", id: a.id, title });
              session.emit({ type: "artifact-created", id: a.id, title });
              return { ok: true, id: a.id, note: "Rendered and opened as a tab for the user." };
            },
          }),
        }
      : {}),

    ...(ctx.dashboards && !ctx.readOnly
      ? {
          dashboard_list: tool({
            description: "List saved dashboards (id, title, panel count).",
            inputSchema: z.object({}),
            execute: async () => ({ dashboards: ctx.dashboards!.list() }),
          }),

          dashboard_get: tool({
            description: "Fetch a dashboard's full JSON spec for editing.",
            inputSchema: z.object({ id: z.string() }),
            execute: async ({ id }) => {
              const d = ctx.dashboards!.get(id);
              return d ? { dashboard: d } : { error: "not found" };
            },
          }),

          dashboard_save: tool({
            description:
              "Create or update a dashboard. Panels live on a 12-column grid; each has SQL and a viz " +
              "(echarts bar/line/area/pie/scatter with xField/yFields, kpi with valueField, or table). " +
              'Markdown text panels — {viz:{type:"markdown",content:"…"}, NO query} — add narrative: a summary up top, insight notes beside charts. Use them to make report-style dashboards. ' +
              "TEST each panel's SQL with run_sql before saving. Omit id to create.",
            inputSchema: z.object({
              dashboard: z.object({
                id: z.string().optional().describe("Omit to create a new dashboard"),
                title: z.string(),
                description: z.string().optional(),
                panels: z
                  .array(PanelSchema)
                  .min(1)
                  .max(24)
                  .describe(
                    'Each panel: {id, title, grid:{x(0-11),y,w(2-12),h(2-24)}, query:{sql}, viz:{type:"echarts",chart:"bar|line|area|pie|scatter",xField?,yFields?} | {type:"kpi",valueField?,unit?} | {type:"table"} | {type:"markdown",content} (markdown panels take NO query)}',
                  ),
              }),
            }),
            execute: async ({ dashboard }) => {
              try {
                const saved = ctx.dashboards!.save({ version: 1, description: "", ...dashboard });
                session.record({ kind: "dashboard.saved", id: saved.id, title: saved.title, panels: saved.panels.length });
                session.emit({ type: "dashboard-saved", id: saved.id, title: saved.title });
                return { ok: true, id: saved.id, note: "Saved and opened in the Dashboards view for the user." };
              } catch (e) {
                return {
                  ok: false,
                  error: e instanceof Error ? e.message : String(e),
                  hint: 'Match this working example exactly: {"id":"p1","title":"Revenue by segment","grid":{"x":0,"y":0,"w":6,"h":8},"query":{"sql":"SELECT C_MKTSEGMENT, SUM(O_TOTALPRICE) AS REVENUE FROM TPCH.ORDERS o JOIN TPCH.CUSTOMER c ON o.O_CUSTKEY=c.C_CUSTKEY GROUP BY C_MKTSEGMENT"},"viz":{"type":"echarts","chart":"bar"}}. Avoid reserved words (VALUE) as column aliases.',
                };
              }
            },
          }),
        }
      : {}),

    ...(!ctx.readOnly && ctx.settings?.enableUiTools
      ? {
          ui_connect: tool({
            description:
              "Connect the app to a database by driving the UI (the pet/cursor performs it visibly, per the user's settings). " +
              "Use a saved connection by name, OR pass explicit details the user gave you (host/port/username/password) — " +
              "the app saves them as a profile (password encrypted in the vault) and connects. Optionally set a profile name and notes/description. " +
              "After ok, the connection is granted automatically — verify with list_connections and continue.",
            inputSchema: z.object({
              connection_name: z.string().optional().describe("Saved connection name, e.g. 'Exasol Personal'"),
              host: z.string().optional().describe("Host, only if the user provided one"),
              port: z.number().int().optional().describe("Port (Exasol default 8563)"),
              username: z.string().optional(),
              password: z.string().optional().describe("Only if the user explicitly gave it in this conversation"),
              schema: z.string().optional().describe("Schema to open on connect"),
              notes: z.string().optional().describe("Description/notes to store on the connection profile"),
            }),
            execute: async ({ connection_name, host, port, username, password, schema, notes }) => {
              const r = await session.askUi("connect", {
                name: connection_name ?? null,
                host: host ?? null,
                port: port ?? null,
                username: username ?? null,
                password: password ?? null,
                schema: schema ?? null,
                notes: notes ?? null,
              });
              if (r.ok && r.detail) ctx.connectionId = r.detail; // granted id reported back
              return r.ok
                ? { ok: true, connected: r.detail ?? true }
                : { ok: false, error: r.detail ?? "the app could not complete the connection" };
            },
          }),

          ui_open: tool({
            description:
              "Open a part of the Exasol Studio UI for the user (pet/cursor drives it): " +
              "databases, files, favorites, visualizer, git, marketplace, guides, dashboards, settings, or a new query tab ('query').",
            inputSchema: z.object({
              target: z.enum([
                "databases",
                "files",
                "favorites",
                "visualizer",
                "git",
                "marketplace",
                "guides",
                "dashboards",
                "settings",
                "query",
              ]),
            }),
            execute: async ({ target }) => session.askUi("open", { target }),
          }),

          ui_editor_insert: tool({
            description:
              "Open a new query tab containing SQL for the user to review/run themselves (does NOT execute anything).",
            inputSchema: z.object({
              sql: z.string().min(1),
            }),
            execute: async ({ sql }) => session.askUi("editor_insert", { sql }),
          }),
        }
      : {}),

    list_connections: tool({
      description:
        "List the database connections Exasol Studio has granted to this agent (names only). Useful to check whether a connection is available before answering.",
      inputSchema: z.object({}),
      execute: async () => {
        const conns = db.list();
        return {
          connections: conns,
          active: ctx.connectionId,
          note: conns.length
            ? undefined
            : "None granted yet — the user must connect via the Connect button in the title bar.",
        };
      },
    }),

    app_ui_locate: tool({
      description:
        "Find where something lives in the Exasol Studio app UI (panels, buttons, windows) so you can tell the user exactly where to click.",
      inputSchema: z.object({
        query: z.string().describe("What the user is looking for, e.g. 'where do I add an API key'"),
      }),
      execute: async ({ query }) => {
        const q = query.toLowerCase();
        const terms = q.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
        const scored = (uiMap.entries as { id: string; label: string; where: string; hint: string }[])
          .map((e) => {
            const hay = `${e.id} ${e.label} ${e.hint}`.toLowerCase();
            const score = terms.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
            return { e, score };
          })
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 4)
          .map((x) => x.e);
        return scored.length ? { places: scored } : { places: [], note: "Nothing matched — describe the goal and I can suggest the closest surface." };
      },
    }),

    ...(ctx.store && !ctx.readOnly
      ? {
          search_sessions: tool({
            description:
              "Search your PAST chat sessions semantically — recall earlier work (\"what did we explore about revenue before?\"). Returns matching sessions with a snippet.",
            inputSchema: z.object({ query: z.string() }),
            execute: async ({ query }) => {
              const hits = await ctx.store!.search(query, session.id, 4);
              return hits.length
                ? { sessions: hits.map((h) => ({ title: h.title, when: new Date(h.updatedAt).toISOString().slice(0, 10), about: h.snippet.slice(0, 160) })) }
                : { sessions: [], note: "No earlier sessions match." };
            },
          }),
        }
      : {}),

    ...(ctx.documents
      ? {
          search_documents: tool({
            description:
              "Search the files the user attached to this chat. Returns the most relevant sections (with source + section number). " +
              "Use this instead of assuming a file's contents — read only what you need.",
            inputSchema: z.object({
              query: z.string().describe("What to look for in the attached files"),
            }),
            execute: async ({ query }) => {
              const hits = await ctx.documents!.hybrid(session.id, query, 5);
              if (!hits.length) {
                const docs = ctx.documents!.list(session.id);
                if (!docs.length) return { hits: [], note: "No files are attached to this chat." };
                // Forgiving by design: with exactly ONE attached text file, an
                // empty search returns its opening sections — an empty result
                // is what makes weak models hallucinate file contents.
                const readable = docs.filter((d) => !d.binary);
                if (readable.length === 1) {
                  const parts = ctx.documents!.read(session.id, readable[0].id).slice(0, 3);
                  return {
                    hits: parts.map((p) => ({ docId: p.docId, docName: p.docName, section: p.index, heading: p.heading, text: p.text })),
                    note: `No keyword match — showing the start of the only attached file (${readable[0].name}). Use read_document(docId: "${readable[0].id}") for the rest. Answer ONLY from this real content.`,
                  };
                }
                return { hits: [], note: `No matching sections. Attached files: ${docs.map((d) => `${d.name} (id ${d.id})`).join(", ")}. Use read_document with a docId — do NOT guess file contents.` };
              }
              return {
                hits: hits.map((h) => ({ docId: h.docId, docName: h.docName, section: h.index, heading: h.heading, text: h.text })),
              };
            },
          }),
          read_document: tool({
            description: "Read a specific attached document, or one section of it by number. Use search_documents first to find the right section.",
            inputSchema: z.object({
              docId: z.string().describe("The document id from search_documents or the attachment note"),
              section: z.number().int().optional().describe("A specific section number; omit to read the whole file"),
            }),
            execute: async ({ docId, section }) => {
              const parts = ctx.documents!.read(session.id, docId, section);
              if (!parts.length) return { error: "No such document or section in this chat." };
              return { docName: parts[0].docName, sections: parts.map((p) => ({ section: p.index, heading: p.heading, text: p.text })) };
            },
          }),
          import_csv: tool({
            description:
              "Load an attached data file (CSV, TSV, other delimited text, or Parquet) into a REAL Exasol table. This is the correct way to 'add', 'load', 'import', or 'pump' an uploaded data file into the database — never write IMPORT/EXA_PUMP SQL by hand. " +
              "It auto-detects the format and delimiter, infers column names and types (tolerating messy rows), creates the schema and table if needed, and bulk-inserts the rows (one approval covers the whole load). Repeat per file to load several into the same schema.",
            inputSchema: z.object({
              docId: z.string().describe("The attached file's id (from the attachment note or search_documents)"),
              schema: z.string().describe("Target schema, e.g. 'TPCH' (created if missing)"),
              table: z.string().optional().describe("Target table; defaults to the file name without extension"),
              replace: z.boolean().optional().describe("Drop and recreate the table first (default: create if missing, then append)"),
            }),
            execute: async ({ docId, schema, table, replace }) => {
              const id = requireConn();
              if (ctx.readOnly) {
                return { denied: true, message: "This researcher context is read-only; it cannot load data." };
              }
              if (ctx.settings?.writePolicy === "deny") {
                return { denied: true, message: "Writes are disabled in this workspace's AI guardrails, so files can't be loaded." };
              }
              const file = ctx.documents!.raw(session.id, docId);
              if (!file) {
                const docs = ctx.documents!.list(session.id);
                return { error: `No attached file with id "${docId}". Attached: ${docs.map((d) => `${d.name} (id ${d.id})`).join(", ") || "none"}.` };
              }
              const isParquet = file.binary || /\.parquet$/i.test(file.name) || /parquet/i.test(file.mime);
              let csv: CsvTable;
              let assumeHeader = false;
              if (isParquet) {
                try {
                  const bytes = Buffer.from(file.text, "base64");
                  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
                  const asyncBuffer = { byteLength: ab.byteLength, slice: (s: number, e?: number) => ab.slice(s, e) };
                  const objs = await parquetReadObjects({ file: asyncBuffer, utf8: true });
                  if (!objs.length) return { error: `"${file.name}" is an empty Parquet file.` };
                  csv = objectsToTable(objs as Record<string, unknown>[]);
                  assumeHeader = true;
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  return { error: `Could not read Parquet "${file.name}": ${msg}. Snappy and uncompressed Parquet are supported; for other codecs (zstd/brotli) re-export as CSV or Snappy.` };
                }
              } else {
                csv = parseCsv(file.text);
                if (!csv.header.length || !csv.rows.length) {
                  return { error: `"${file.name}" has no parseable rows — is it a delimited or Parquet file?` };
                }
              }
              const tableName = table || file.name.replace(/\.[^.]+$/, "");
              const plan = buildPlan(csv, schema, tableName, { replace, assumeHeader });

              const fmt = isParquet ? "Parquet" : `delimiter "${csv.delimiter === "\t" ? "\\t" : csv.delimiter}"`;
              const detail =
                `File: ${file.name} (${plan.rowCount} rows, ${fmt})\n` +
                `Target: ${plan.schema}.${plan.table}${replace ? " (replace)" : ""}\n` +
                `Creates schema ${plan.schema} and table ${plan.table} if missing.\n\n` +
                plan.columns.map((c) => `  ${c.name} ${typeToSql(c.type)}`).join("\n");
              const allowed = await session.askPermission({
                tool: "import_csv",
                summary: `Load ${plan.rowCount} rows into ${plan.schema}.${plan.table}`,
                detail,
              });
              session.record({ kind: "tool.import_csv", file: file.name, target: `${plan.schema}.${plan.table}`, rows: plan.rowCount, allowed });
              if (!allowed) {
                return { denied: true, message: "The user declined the import. Do not retry; ask what they want instead." };
              }

              const started = Date.now();
              try {
                // BEST path when available: exapump (native bulk IMPORT via
                // HTTP transport — the production tool for this job). CLI is
                // verified before use; any miss falls back to inserts.
                const pumpBin = await findExapump();
                const info = db.get(id);
                if (pumpBin && info && !isParquet) {
                  await db.execute(id, plan.createSchemaSql);
                  if (plan.dropSql) await db.execute(id, plan.dropSql);
                  await db.execute(id, plan.createTableSql);
                  const rows = await exapumpLoad(file.text, {
                    host: info.host, port: info.port, user: info.user, password: info.password,
                    schema: plan.schema, table: plan.table,
                  });
                  if (rows !== null) {
                    session.record({ kind: "tool.import_csv.done", target: `${plan.schema}.${plan.table}`, inserted: rows, skipped: 0, ms: Date.now() - started, engine: "exapump" });
                    return {
                      ok: true, schema: plan.schema, table: plan.table,
                      columns: plan.columns.map((c) => ({ name: c.name, type: typeToSql(c.type) })),
                      rowsInserted: rows, rowsSkipped: 0, engine: "exapump",
                      message: `Loaded ${rows} row(s) into ${plan.schema}.${plan.table} via exapump (native bulk IMPORT — the production path for this job).`,
                    };
                  }
                }
                // Production path: ONE dedicated autocommit-off connection —
                // all batches join a single transaction with one COMMIT
                // (fewer fsyncs, atomic load); batch-level row fallback kept.
                const BATCH = 1000;
                const { inserted, skipped } = await db.bulkLoad(id, async (exec) => {
                  await exec(plan.createSchemaSql);
                  if (plan.dropSql) await exec(plan.dropSql);
                  await exec(plan.createTableSql);
                  let inserted = 0;
                  let skipped = 0;
                  for (let i = 0; i < plan.rows.length; i += BATCH) {
                    const slice = plan.rows.slice(i, i + BATCH);
                    try {
                      inserted += await exec(buildInsert(plan, slice));
                    } catch {
                      for (const row of slice) {
                        try {
                          inserted += await exec(buildInsert(plan, [row]));
                        } catch {
                          skipped += 1;
                        }
                      }
                    }
                  }
                  return { inserted, skipped };
                });
                session.record({ kind: "tool.import_csv.done", target: `${plan.schema}.${plan.table}`, inserted, skipped, ms: Date.now() - started });
                return {
                  ok: true,
                  schema: plan.schema,
                  table: plan.table,
                  columns: plan.columns.map((c) => ({ name: c.name, type: typeToSql(c.type) })),
                  rowsInserted: inserted,
                  rowsSkipped: skipped,
                  message:
                    `Loaded ${inserted} row(s) into ${plan.schema}.${plan.table}` +
                    (skipped ? `; ${skipped} malformed row(s) were skipped` : "") +
                    `. The data is in the database now — do not re-verify by re-listing everything.` +
                    ` Note: for bulk loads, exapump is the best tool for this kind of job (native IMPORT, much faster on large files) — it isn't installed, so the standard insert path was used; it can be installed from the Marketplace.`,
                };
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                session.record({ kind: "tool.import_csv.error", target: `${plan.schema}.${plan.table}`, error: msg });
                return { error: `Import failed while loading ${plan.schema}.${plan.table}: ${msg}` };
              }
            },
          }),

          import_attachments: tool({
            description:
              "Load ALL attached data files (CSV/TSV/Parquet) into a schema in ONE call — the correct tool when the user attached SEVERAL files. " +
              "Each file becomes its own table (named after the file) and runs as an A2A task; this tool WAITS until every task completes and reports per-file results. " +
              "One approval covers the whole batch. Never import multiple files one-by-one with import_csv.",
            inputSchema: z.object({
              schema: z.string().describe("Target schema, e.g. 'TPCH' (created if missing)"),
              replace: z.boolean().optional().describe("Drop and recreate each table first"),
              files: z.array(z.string()).optional().describe("Only these attached file names (default: every attached data file)"),
            }),
            execute: async ({ schema, replace, files }) => {
              const id = requireConn();
              if (ctx.readOnly) return { denied: true, message: "This researcher context is read-only; it cannot load data." };
              if (ctx.settings?.writePolicy === "deny") {
                return { denied: true, message: "Writes are disabled in this workspace's AI guardrails, so files can't be loaded." };
              }
              const docs = ctx.documents!.list(session.id)
                .filter((d) => /\.(csv|tsv|txt|parquet)$/i.test(d.name))
                .filter((d) => !files?.length || files.some((f) => f.toLowerCase() === d.name.toLowerCase()));
              if (!docs.length) return { error: "No attached data files found." };

              // Parse + plan every file up front so ONE approval shows the
              // whole batch (files, row counts, tables).
              const plans: { doc: (typeof docs)[number]; plan: ReturnType<typeof buildPlan> }[] = [];
              const unreadable: string[] = [];
              for (const d of docs) {
                const file = ctx.documents!.raw(session.id, d.id)!;
                try {
                  let csv: CsvTable;
                  let assumeHeader = false;
                  if (file.binary || /\.parquet$/i.test(file.name)) {
                    const bytes = Buffer.from(file.text, "base64");
                    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
                    const objs = await parquetReadObjects({ file: { byteLength: ab.byteLength, slice: (s: number, e?: number) => ab.slice(s, e) }, utf8: true });
                    csv = objectsToTable(objs as Record<string, unknown>[]);
                    assumeHeader = true;
                  } else {
                    csv = parseCsv(file.text);
                  }
                  if (!csv.header.length || !csv.rows.length) throw new Error("no parseable rows");
                  plans.push({ doc: d, plan: buildPlan(csv, schema, d.name.replace(/\.[^.]+$/, ""), { replace, assumeHeader }) });
                } catch (e) {
                  unreadable.push(`${d.name}: ${e instanceof Error ? e.message : String(e)}`);
                }
              }
              if (!plans.length) return { error: `None of the attached files were readable: ${unreadable.join("; ")}` };

              const totalRows = plans.reduce((n, p) => n + p.plan.rowCount, 0);
              const allowed = await session.askPermission({
                tool: "import_csv",
                summary: `Load ${plans.length} files (${totalRows} rows) into ${plans[0].plan.schema}`,
                detail:
                  `Creates schema ${plans[0].plan.schema} and each table if missing.\n` +
                  plans.map((p) => `${p.doc.name} → ${p.plan.schema}.${p.plan.table} (${p.plan.rowCount} rows)`).join("\n"),
              });
              session.record({ kind: "tool.import_attachments", schema, files: plans.length, rows: totalRows, allowed });
              if (!allowed) return { denied: true, message: "The user declined the batch import. Do not retry; ask what they want instead." };

              // One A2A task per file; drain sequentially (single DB pool) and
              // stream each task as its own tool card so the UI shows the
              // whole swarm running until the last file lands.
              const manager = new TaskManager();
              for (const { doc, plan } of plans) {
                manager.submit(doc.name, async (report) => {
                  const pumpBin = await findExapump();
                  const info = db.get(id);
                  const rawFile = ctx.documents!.raw(session.id, doc.id);
                  if (pumpBin && info && rawFile && !rawFile.binary && !/\.parquet$/i.test(rawFile.name)) {
                    await db.execute(id, plan.createSchemaSql);
                    if (plan.dropSql) await db.execute(id, plan.dropSql);
                    await db.execute(id, plan.createTableSql);
                    const rows = await exapumpLoad(rawFile.text, {
                      host: info.host, port: info.port, user: info.user, password: info.password,
                      schema: plan.schema, table: plan.table,
                    });
                    if (rows !== null) {
                      report(`${rows} rows via exapump`);
                      return { table: `${plan.schema}.${plan.table}`, rowsInserted: rows, rowsSkipped: 0, engine: "exapump" };
                    }
                  }
                  const BATCH = 1000;
                  return db.bulkLoad(id, async (exec) => {
                    await exec(plan.createSchemaSql);
                    if (plan.dropSql) await exec(plan.dropSql);
                    await exec(plan.createTableSql);
                    let inserted = 0;
                    let skipped = 0;
                    for (let i = 0; i < plan.rows.length; i += BATCH) {
                      const slice = plan.rows.slice(i, i + BATCH);
                      try {
                        inserted += await exec(buildInsert(plan, slice));
                      } catch {
                        for (const row of slice) {
                          try {
                            inserted += await exec(buildInsert(plan, [row]));
                          } catch {
                            skipped += 1;
                          }
                        }
                      }
                      report(`${Math.min(i + BATCH, plan.rows.length)}/${plan.rows.length} rows`);
                    }
                    return { table: `${plan.schema}.${plan.table}`, rowsInserted: inserted, rowsSkipped: skipped };
                  });
                });
              }
              const emitted = new Set<string>();
              const results = await manager.drain(1, (t) => {
                const callId = `a2a-${t.id}`;
                if (t.state === "working" && !emitted.has(callId)) {
                  emitted.add(callId);
                  session.emit({ type: "tool-start", callId, name: "import_csv", args: { file: t.title, schema } });
                } else if (t.state === "completed" || t.state === "failed") {
                  const r = t.result as { table?: string; rowsInserted?: number; rowsSkipped?: number } | undefined;
                  session.emit({
                    type: "tool-end",
                    callId,
                    name: "import_csv",
                    ok: t.state === "completed",
                    summary: t.state === "completed"
                      ? `loaded ${r?.rowsInserted ?? 0} rows into ${r?.table}${r?.rowsSkipped ? ` (${r.rowsSkipped} skipped)` : ""}`
                      : t.error ?? "failed",
                  });
                }
              });
              const done = results.filter((t) => t.state === "completed");
              const failed = results.filter((t) => t.state === "failed");
              session.record({ kind: "tool.import_attachments.done", completed: done.length, failed: failed.length });
              return {
                ok: failed.length === 0,
                completed: done.map((t) => ({ file: t.title, ...(t.result as object) })),
                failed: failed.map((t) => ({ file: t.title, error: t.error })),
                unreadable,
                message:
                  `Batch finished: ${done.length}/${results.length} files loaded into ${plans[0].plan.schema}.` +
                  (failed.length ? ` Failed: ${failed.map((t) => t.title).join(", ")}.` : "") +
                  " Report the per-file tables and row counts to the user now — every file above is already in the database.",
              };
            },
          }),
        }
      : {}),

    remember: tool({
      description:
        "Save a short, durable fact to memory so it carries across sessions. " +
        "scope 'project' = a verified fact about this database (join keys, table meanings, business definitions — only save what tool results confirmed). " +
        "scope 'user' = a stable preference or fact about the user (how they like answers, their role, naming conventions they use). " +
        "Never save assumptions or one-off conversational noise.",
      inputSchema: z.object({
        scope: z.enum(["project", "user"]).describe("'project' for database facts, 'user' for user preferences"),
        note: z.string().max(300).describe("One concise fact or preference"),
      }),
      execute: async ({ scope, note }) => {
        if (ctx.settings && !ctx.settings.enableInsights) {
          return { saved: false, note: "Memory is disabled in settings." };
        }
        ctx.memory?.remember(scope, scope === "user" ? null : ctx.connectionId, note);
        session.record({ kind: "memory.saved", scope, note });
        return { saved: true };
      },
    }),

    ...(ctx.model && !ctx.readOnly && ctx.settings?.enableResearcher !== false
      ? {
          spawn_researcher: tool({
            description:
              "Spawn a parallel read-only researcher to explore part of the database (schemas, tables, sampling, read queries) and report findings. " +
              "Use MULTIPLE calls in one turn to fan out across independent questions — they run concurrently, share a findings board, and keep your own context small.",
            inputSchema: z.object({
              task: z.string().describe("A focused research question, e.g. 'Map the tables and join keys related to orders'"),
            }),
            execute: async ({ task }) => {
              const taskId = ctx.board?.begin(task);
              // Typed handoff: the researcher ends by SUBMITTING structured
              // findings (tables, tested SQL, facts) — not just prose. They
              // land on the shared board every later spawn can see.
              let submitted: { summary: string; findings: Finding[] } | null = null;
              const subTools: ToolSet = {
                ...buildTools({
                  db,
                  session,
                  connectionId: ctx.connectionId,
                  memory: ctx.memory,
                  kb: ctx.kb,
                  settings: ctx.settings,
                  readOnly: true,
                  surface: ctx.surface,
                  semanticViewsReady: ctx.semanticViewsReady,
                  semanticViewsConnectionId: ctx.semanticViewsConnectionId,
                }),
                submit_report: tool({
                  description:
                    "Submit your final research report as STRUCTURED findings. Call this exactly once, at the end, then stop.",
                  inputSchema: z.object({
                    summary: z.string().describe("2-4 sentence factual summary of what you found"),
                    findings: z
                      .array(
                        z.object({
                          kind: z.enum(["table", "sql", "fact"]),
                          schema: z.string().optional(),
                          table: z.string().optional(),
                          columns: z.array(z.string()).optional(),
                          purpose: z.string().optional().describe("What an sql finding is for"),
                          sql: z.string().optional().describe("The exact SELECT, schema-qualified"),
                          tested: z.boolean().optional().describe("true only if you ran it successfully"),
                          rows: z.number().optional(),
                          note: z.string().optional(),
                        }),
                      )
                      .max(20),
                  }),
                  execute: async ({ summary, findings }) => {
                    submitted = { summary, findings: findings as Finding[] };
                    return { ok: true, note: "Report recorded. You are done — do not call more tools." };
                  },
                }),
              };
              const known = ctx.board?.digest();
              const res = await generateText({
                model: ctx.model!,
                system:
                  "You are a read-only database researcher inside Exasol Studio. Investigate the task with tools, then FINISH by calling submit_report with structured findings (tables with columns, tested SQL with purpose, facts). " +
                  "Every claim must come from a tool result — if something is unknown, state that plainly. Exasol dialect: LIMIT n, UPPERCASE identifiers, SYS.EXA_ALL_* metadata." +
                  (known ? `\n\nAlready gathered by other researchers this turn (build on it, do not redo):\n${known}` : ""),
                prompt: task,
                tools: subTools,
                maxSteps: 6,
                abortSignal: session.abort?.signal,
                // REALTIME: surface the researcher's inner tool activity as it
                // happens — parallel subagents render live in the app and CLI
                // (↳-prefixed steps) instead of a silent multi-second blob.
                onEvent: (e) => {
                  try {
                    if (e.type === "tool-call" && e.toolName !== "submit_report") {
                      session.emit({ type: "tool-start", callId: `sub-${e.toolCallId}`, name: `↳ ${e.toolName}`, args: e.input });
                    } else if (e.type === "tool-result" && e.toolName !== "submit_report") {
                      const out = e.output as { rowCount?: number; error?: unknown } | undefined;
                      const summary =
                        out && typeof out === "object"
                          ? typeof out.rowCount === "number"
                            ? `${out.rowCount} rows`
                            : out.error
                              ? String(out.error).slice(0, 80)
                              : "done"
                          : "done";
                      session.emit({ type: "tool-end", callId: `sub-${e.toolCallId}`, name: `↳ ${e.toolName}`, ok: !out?.error, summary });
                    } else if (e.type === "tool-error" && e.toolName !== "submit_report") {
                      session.emit({ type: "tool-end", callId: `sub-${e.toolCallId}`, name: `↳ ${e.toolName}`, ok: false, summary: e.error.slice(0, 80) });
                    }
                  } catch {
                    /* progress display must never break research */
                  }
                },
              });
              const sub = submitted as { summary: string; findings: Finding[] } | null;
              const report = sub?.summary ?? res.text;
              const findings = sub?.findings ?? [];
              if (taskId !== undefined) ctx.board?.complete(taskId, true, findings, report.slice(0, 300));
              session.record({ kind: "subagent", task, report: report.slice(0, 2000), findings: findings.length });
              return {
                report,
                findings,
                ...(ctx.board && ctx.board.size > 1 ? { sharedBoard: ctx.board.digest() } : {}),
              };
            },
          }),
        }
      : {}),

    get_table_sample: tool({
      description: "Fetch a few sample rows from a table to understand its data.",
      inputSchema: z.object({
        schema: z.string(),
        table: z.string(),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ schema, table, limit }) => {
        const id = requireConn();
        const out = await db.query(
          id,
          `SELECT * FROM ${quoteIdent(schema.toUpperCase())}.${quoteIdent(table.toUpperCase())} LIMIT ${limit ?? 5}`,
        );
        return shape(out);
      },
    }),

    run_sql_batch: tool({
      description:
        "Run MANY read-only SQL statements as one batch of A2A tasks — the right tool whenever a job needs several independent SELECTs (collecting stats per table for an artifact or dashboard, profiling many tables, checking row counts across schemas). " +
        "Up to 50 statements run concurrently; this waits until ALL finish and returns each statement's rows. One approval covers the whole batch. Never loop run_sql one-by-one for work like this.",
      inputSchema: z.object({
        statements: z
          .array(z.object({
            purpose: z.string().describe("One short line: what this statement gathers"),
            sql: z.string().describe("A single read-only SELECT/WITH statement, schema-qualified"),
          }))
          .min(1)
          .max(50),
      }),
      execute: async ({ statements }) => {
        const id = requireConn();
        const writes = statements.filter((s) => classifySql(s.sql) !== "read");
        if (writes.length) {
          return { error: `run_sql_batch is read-only; these statements write: ${writes.map((w) => w.purpose).join(", ")}. Use run_sql (with approval) for writes.` };
        }
        if (ctx.settings?.readPolicy === "ask" && !ctx.readOnly) {
          const allowed = await session.askPermission({
            tool: "run_sql",
            summary: `Run ${statements.length} read-only statements`,
            detail: statements.map((s) => `- ${s.purpose}`).join("\n"),
          });
          if (!allowed) return { denied: true, message: "The user declined the batch. Ask what they want instead." };
        }
        const manager = new TaskManager();
        for (const s of statements) {
          manager.submit(s.purpose, async () => shape(await db.query(id, s.sql)));
        }
        const emitted = new Set<string>();
        const results = await manager.drain(4, (t) => {
          const callId = `a2a-${t.id}`;
          if (t.state === "working" && !emitted.has(callId)) {
            emitted.add(callId);
            session.emit({ type: "tool-start", callId, name: "run_sql", args: { purpose: t.title } });
          } else if (t.state === "completed" || t.state === "failed") {
            const r = t.result as { rowCount?: number } | undefined;
            session.emit({
              type: "tool-end",
              callId,
              name: "run_sql",
              ok: t.state === "completed",
              summary: t.state === "completed" ? `${r?.rowCount ?? 0} rows` : (t.error ?? "failed").slice(0, 80),
            });
          }
        });
        session.record({ kind: "tool.run_sql_batch", count: statements.length, failed: results.filter((t) => t.state === "failed").length });
        return {
          ok: results.every((t) => t.state === "completed"),
          results: results.map((t) => ({
            purpose: t.title,
            ...(t.state === "completed" ? (t.result as object) : { error: t.error }),
          })),
          message: "All batch statements finished. Use the data above directly — do not re-run them.",
        };
      },
    }),

    profile_tables: tool({
      description:
        "Data-quality/profiling SWEEP: profile many tables concurrently (A2A tasks) — row count plus per-column non-null % and distinct counts. " +
        "The right tool for 'check data quality', 'profile this schema', or gathering table stats for an artifact. Waits until every table is profiled.",
      inputSchema: z.object({
        schema: z.string().describe("Schema to profile, e.g. 'TPCH'"),
        tables: z.array(z.string()).max(50).optional().describe("Specific tables; defaults to every table in the schema"),
      }),
      execute: async ({ schema, tables }) => {
        const id = requireConn();
        const sch = schema.toUpperCase();
        let names = tables?.map((t) => t.toUpperCase());
        if (!names?.length) {
          const out = await db.query(id, `SELECT TABLE_NAME FROM SYS.EXA_ALL_TABLES WHERE TABLE_SCHEMA = ${lit(sch)} ORDER BY TABLE_NAME LIMIT 50`);
          names = out.rows.map((r) => String(r[0]));
        }
        if (!names.length) return { error: `No tables found in schema ${sch}.` };
        if (ctx.settings?.readPolicy === "ask" && !ctx.readOnly) {
          const allowed = await session.askPermission({
            tool: "run_sql",
            summary: `Profile ${names.length} tables in ${sch}`,
            detail: names.join(", "),
          });
          if (!allowed) return { denied: true, message: "The user declined the profiling sweep." };
        }
        const manager = new TaskManager();
        for (const table of names) {
          manager.submit(`${sch}.${table}`, async () => {
            const cols = await db.query(id, `SELECT COLUMN_NAME FROM SYS.EXA_ALL_COLUMNS WHERE COLUMN_SCHEMA = ${lit(sch)} AND COLUMN_TABLE = ${lit(table)} ORDER BY COLUMN_ORDINAL_POSITION LIMIT 20`);
            const colNames = cols.rows.map((r) => String(r[0]));
            const aggs = colNames.map((c) => `COUNT(${quoteIdent(c)}), COUNT(DISTINCT ${quoteIdent(c)})`).join(", ");
            const stats = await db.query(id, `SELECT COUNT(*)${aggs ? `, ${aggs}` : ""} FROM ${quoteIdent(sch)}.${quoteIdent(table)}`);
            const row = stats.rows[0] ?? [];
            const total = Number(row[0] ?? 0);
            return {
              table: `${sch}.${table}`,
              rows: total,
              columns: colNames.map((c, i) => ({
                name: c,
                nonNullPct: total ? Math.round((Number(row[1 + i * 2] ?? 0) / total) * 100) : 0,
                distinct: Number(row[2 + i * 2] ?? 0),
              })),
            };
          });
        }
        const emitted = new Set<string>();
        const results = await manager.drain(4, (t) => {
          const callId = `a2a-${t.id}`;
          if (t.state === "working" && !emitted.has(callId)) {
            emitted.add(callId);
            session.emit({ type: "tool-start", callId, name: "profile_query", args: { table: t.title } });
          } else if (t.state === "completed" || t.state === "failed") {
            const r = t.result as { rows?: number } | undefined;
            session.emit({ type: "tool-end", callId, name: "profile_query", ok: t.state === "completed", summary: t.state === "completed" ? `${r?.rows ?? 0} rows profiled` : (t.error ?? "failed").slice(0, 80) });
          }
        });
        session.record({ kind: "tool.profile_tables", schema: sch, count: names.length, failed: results.filter((t) => t.state === "failed").length });
        return {
          ok: results.every((t) => t.state === "completed"),
          profiles: results.map((t) => (t.state === "completed" ? t.result : { table: t.title, error: t.error })),
          message: "Profiling sweep complete. Columns with low non-null % or distinct=1 are quality flags worth mentioning.",
        };
      },
    }),

    export_tables: tool({
      description:
        "Export many tables to CSV files on the user's disk in one batch (A2A tasks) — for 'export all tables', 'give me these as CSV', backups before changes. " +
        "Files land in ~/Downloads/exasol-exports. One approval covers the batch; waits until every file is written.",
      inputSchema: z.object({
        schema: z.string().describe("Schema to export from"),
        tables: z.array(z.string()).max(50).optional().describe("Specific tables; defaults to every table in the schema"),
      }),
      execute: async ({ schema, tables }) => {
        const id = requireConn();
        const sch = schema.toUpperCase();
        let names = tables?.map((t) => t.toUpperCase());
        if (!names?.length) {
          const out = await db.query(id, `SELECT TABLE_NAME FROM SYS.EXA_ALL_TABLES WHERE TABLE_SCHEMA = ${lit(sch)} ORDER BY TABLE_NAME LIMIT 50`);
          names = out.rows.map((r) => String(r[0]));
        }
        if (!names.length) return { error: `No tables found in schema ${sch}.` };
        const dir = join(homedir(), "Downloads", "exasol-exports");
        const allowed = await session.askPermission({
          tool: "export_tables",
          summary: `Export ${names.length} tables from ${sch} to CSV`,
          detail: `Folder: ${dir}\n${names.map((t) => `- ${sch}.${t} → ${t.toLowerCase()}.csv`).join("\n")}`,
        });
        if (!allowed) return { denied: true, message: "The user declined the export." };
        await mkdir(dir, { recursive: true });
        const csvCell = (v: unknown) => {
          if (v === null || v === undefined) return "";
          const s = String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const manager = new TaskManager();
        for (const table of names) {
          manager.submit(`${sch}.${table}`, async (report) => {
            const out = await db.query(id, `SELECT * FROM ${quoteIdent(sch)}.${quoteIdent(table)} LIMIT 500000`);
            report(`${out.rows.length} rows fetched`);
            const lines = [out.columns.map((c) => csvCell(c)).join(",")];
            for (const row of out.rows) lines.push(row.map(csvCell).join(","));
            const path = join(dir, `${table.toLowerCase()}.csv`);
            await writeFile(path, lines.join("\n"), "utf8");
            return { table: `${sch}.${table}`, path, rows: out.rows.length };
          });
        }
        const emitted = new Set<string>();
        const results = await manager.drain(3, (t) => {
          const callId = `a2a-${t.id}`;
          if (t.state === "working" && !emitted.has(callId)) {
            emitted.add(callId);
            session.emit({ type: "tool-start", callId, name: "export_tables", args: { table: t.title } });
          } else if (t.state === "completed" || t.state === "failed") {
            const r = t.result as { rows?: number } | undefined;
            session.emit({ type: "tool-end", callId, name: "export_tables", ok: t.state === "completed", summary: t.state === "completed" ? `${r?.rows ?? 0} rows exported` : (t.error ?? "failed").slice(0, 80) });
          }
        });
        session.record({ kind: "tool.export_tables", schema: sch, count: names.length, failed: results.filter((t) => t.state === "failed").length });
        return {
          ok: results.every((t) => t.state === "completed"),
          exported: results.map((t) => (t.state === "completed" ? t.result : { table: t.title, error: t.error })),
          folder: dir,
          message: `Export finished into ${dir}. Tell the user the folder and per-file row counts.`,
        };
      },
    }),

    run_pipeline: tool({
      description:
        "Compose a MULTI-STAGE plan into one orchestrated run: stages execute in order, each stage is either a parallel research fan-out (`research`: list of questions) or an agent step (`instruction`: e.g. 'run the SELECTs the research suggests via run_sql_batch', 'render an artifact from the gathered data'). " +
        "Each stage sees a digest of everything earlier stages produced. Use for jobs like research → batch-query → render artifact/dashboard, done end-to-end in one call.",
      inputSchema: z.object({
        goal: z.string().describe("What the whole pipeline should accomplish"),
        stages: z
          .array(z.object({
            title: z.string().describe("Short stage name, e.g. 'Map the schema'"),
            research: z.array(z.string()).max(10).optional().describe("Parallel research questions (research stage)"),
            instruction: z.string().optional().describe("What the agent step must do with prior results (agent stage)"),
          }))
          .min(2)
          .max(6),
      }),
      execute: async ({ goal, stages }) => {
        if (!ctx.model) return { error: "Pipelines need a model for agent stages; unavailable in this context." };
        if (ctx.readOnly) return { error: "Pipelines are unavailable in read-only researcher contexts." };
        const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);
        let context = "";
        const stageSummaries: { title: string; ok: boolean; summary: string }[] = [];
        // Agent stages get the real toolset minus recursion/swarm-of-swarms.
        const stageTools: ToolSet = Object.fromEntries(
          Object.entries(tools).filter(([name]) => !["run_pipeline", "spawn_researcher", "spawn_researchers"].includes(name)),
        );
        const mirror = (e: { type: string; toolCallId?: string; toolName?: string; input?: unknown; output?: unknown; error?: string }) => {
          try {
            if (e.type === "tool-call") {
              session.emit({ type: "tool-start", callId: `sub-${e.toolCallId}`, name: `↳ ${e.toolName}`, args: e.input });
            } else if (e.type === "tool-result") {
              const out = e.output as { rowCount?: number; error?: unknown } | undefined;
              session.emit({ type: "tool-end", callId: `sub-${e.toolCallId}`, name: `↳ ${e.toolName}`, ok: !out?.error, summary: typeof out?.rowCount === "number" ? `${out.rowCount} rows` : out?.error ? String(out.error).slice(0, 80) : "done" });
            } else if (e.type === "tool-error") {
              session.emit({ type: "tool-end", callId: `sub-${e.toolCallId}`, name: `↳ ${e.toolName}`, ok: false, summary: (e.error ?? "").slice(0, 80) });
            }
          } catch { /* progress display must never break the pipeline */ }
        };
        for (const [i, stage] of stages.entries()) {
          const callId = `pipe-${Date.now()}-${i}`;
          session.emit({ type: "tool-start", callId, name: "run_pipeline", args: { stage: `${i + 1}/${stages.length}`, title: stage.title } });
          try {
            if (stage.research?.length) {
              const swarm = tools["spawn_researchers"] as { execute?: (a: unknown, o: unknown) => Promise<unknown> };
              const res = (await swarm.execute!({ tasks: stage.research }, { toolCallId: callId, messages: [] })) as { reports?: unknown };
              context += `\n\n## Stage ${i + 1}: ${stage.title} (research findings)\n${cap(JSON.stringify(res.reports ?? res), 8000)}`;
              stageSummaries.push({ title: stage.title, ok: true, summary: `${stage.research.length} researchers reported` });
              session.emit({ type: "tool-end", callId, name: "run_pipeline", ok: true, summary: `${stage.title}: research complete` });
            } else if (stage.instruction) {
              const res = await generateText({
                model: ctx.model!,
                system:
                  "You are ONE STAGE of a data pipeline inside Exasol Studio. Do your stage's job with tools invoked natively (prefer batch tools like run_sql_batch/profile_tables for many statements; render_artifact/dashboard_save for outputs), then finish with a short factual summary of what you produced. " +
                  "Exasol dialect: LIMIT n, UPPERCASE identifiers, schema-qualified names. Never print tool calls as text.",
                prompt: `Pipeline goal: ${goal}\n${cap(context, 9000)}\n\nYOUR STAGE (${i + 1}/${stages.length} — ${stage.title}): ${stage.instruction}`,
                tools: stageTools,
                maxSteps: 10,
                abortSignal: session.abort?.signal,
                onEvent: mirror,
              });
              context += `\n\n## Stage ${i + 1}: ${stage.title}\n${cap(res.text, 4000)}`;
              stageSummaries.push({ title: stage.title, ok: true, summary: cap(res.text.replace(/\s+/g, " "), 160) });
              session.emit({ type: "tool-end", callId, name: "run_pipeline", ok: true, summary: `${stage.title}: done` });
            } else {
              stageSummaries.push({ title: stage.title, ok: false, summary: "stage had neither research nor instruction" });
              session.emit({ type: "tool-end", callId, name: "run_pipeline", ok: false, summary: `${stage.title}: empty stage skipped` });
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            stageSummaries.push({ title: stage.title, ok: false, summary: msg.slice(0, 160) });
            session.emit({ type: "tool-end", callId, name: "run_pipeline", ok: false, summary: `${stage.title}: ${msg.slice(0, 60)}` });
            session.record({ kind: "tool.run_pipeline.stage_error", stage: stage.title, error: msg });
            // Later stages depend on this one — stop rather than cascade garbage.
            return {
              ok: false,
              stages: stageSummaries,
              message: `Pipeline stopped at stage "${stage.title}": ${msg}. Report what completed and ask how to proceed.`,
            };
          }
        }
        session.record({ kind: "tool.run_pipeline.done", goal, stages: stageSummaries.length });
        return {
          ok: stageSummaries.every((s) => s.ok),
          stages: stageSummaries,
          message: "Pipeline complete. Report each stage's outcome and where the final output lives (artifact/dashboard/tables).",
        };
      },
    }),

    spawn_researchers: tool({
      description:
        "Spawn a SWARM of parallel read-only researcher agents in one call (A2A tasks) — use when a job decomposes into several independent questions (e.g. 'profile each schema', 'investigate these 6 subsystems'). " +
        "Waits until every researcher reports, then returns all reports. Prefer this over calling spawn_researcher repeatedly.",
      inputSchema: z.object({
        tasks: z.array(z.string()).min(1).max(50).describe("One focused research question per agent"),
      }),
      execute: async ({ tasks }) => {
        const researcher = tools["spawn_researcher"] as
          | { execute?: (a: { task: string }, o: unknown) => Promise<unknown> }
          | undefined;
        if (typeof researcher?.execute !== "function") {
          return { error: "Researchers are unavailable here (no model, read-only context, or disabled in settings)." };
        }
        const manager = new TaskManager();
        for (const task of tasks) {
          manager.submit(task, async () => researcher.execute!({ task }, { toolCallId: `swarm-${Date.now()}`, messages: [] }));
        }
        const emitted = new Set<string>();
        const results = await manager.drain(2, (t) => {
          const callId = `a2a-${t.id}`;
          if (t.state === "working" && !emitted.has(callId)) {
            emitted.add(callId);
            session.emit({ type: "tool-start", callId, name: "spawn_researcher", args: { task: t.title } });
          } else if (t.state === "completed" || t.state === "failed") {
            session.emit({
              type: "tool-end",
              callId,
              name: "spawn_researcher",
              ok: t.state === "completed",
              summary: t.state === "completed" ? "reported" : (t.error ?? "failed").slice(0, 80),
            });
          }
        });
        session.record({ kind: "tool.spawn_researchers", count: tasks.length, failed: results.filter((t) => t.state === "failed").length });
        return {
          ok: results.every((t) => t.state === "completed"),
          reports: results.map((t) => ({ task: t.title, ...(t.state === "completed" ? { report: t.result } : { error: t.error }) })),
          message: "Every researcher has reported. Synthesize the findings above into the answer now.",
        };
      },
    }),
  };

  // ── MCP bridge: every tool of every CONNECTED external server becomes a
  // native agent tool named mcp_<server>_<tool>. Args pass through loosely
  // (the server validates); EVERY call is approval-gated — external systems
  // are outside our permission model, so the human stays in the loop.
  // Known-tricky external tools get a usage hint appended so models fill the
  // required arguments correctly instead of calling with {}.
  const MCP_TOOL_HINTS: Record<string, string> = {
    search_repositories: 'To list the signed-in user\'s OWN repositories call {"query":"user:@me"}. The query argument is REQUIRED.',
  };
  for (const mt of ctx.mcp?.tools() ?? []) {
    const safe = (s: string) => s.replace(/[^a-zA-Z0-9_]/g, "_");
    const bridgeName = `mcp_${safe(mt.serverId)}_${safe(mt.name)}`;
    const hint = MCP_TOOL_HINTS[mt.name] ? ` ${MCP_TOOL_HINTS[mt.name]}` : "";
    // Bind the server's REAL JSON Schema so the model sees required fields —
    // an empty passthrough schema made models call with {} and fail server
    // validation (-32603 Invalid input).
    const realSchema =
      mt.inputSchema && typeof mt.inputSchema === "object"
        ? (mt.inputSchema as z.ZodType)
        : z.object({}).passthrough();
    tools[bridgeName] = tool({
      description: `[${mt.serverName} via MCP] ${mt.description || mt.name}.${hint}`,
      inputSchema: realSchema,
      execute: async (args) => {
        const allowed = await session.askPermission({
          tool: bridgeName,
          summary: `Call ${mt.serverName} → ${mt.name}`,
          detail: JSON.stringify(args, null, 2),
        });
        session.record({ kind: "tool.mcp", server: mt.serverId, tool: mt.name, args, allowed });
        if (!allowed) {
          ctx.mcp!.auditDenied(mt.serverId, mt.name);
          return { denied: true, message: "The user declined this external call. Do not retry it." };
        }
        try {
          const text = await ctx.mcp!.call(mt.serverId, mt.name, args as Record<string, unknown>);
          return { ok: true, result: text.length > 12_000 ? text.slice(0, 12_000) + `… [+${text.length - 12_000} chars]` : text };
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) };
        }
      },
    });
  }
  return tools;
}
