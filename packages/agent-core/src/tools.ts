import { generateText, stepCountIs, tool, type LanguageModel, type ToolSet } from "ai";
import { z } from "zod";
import type { DbRegistry, QueryOutput } from "./db.ts";
import type { Session } from "./session.ts";
import type { AgentSettings } from "./config.ts";
import type { InsightStore } from "./insights.ts";
import type { KnowledgeGraph } from "./kb.ts";
import { DashboardSchema, type DashboardStore } from "./dashboards.ts";
import uiMap from "../data/ui-map.json" with { type: "json" };

// The agent's Exasol tools. Metadata queries are ported from the official
// exasol/mcp-server (MIT) SYS-catalog SQL. Reads run freely (row-capped);
// anything that mutates goes through the human-in-the-loop permission gate.

const READ_KEYWORDS = new Set(["SELECT", "WITH", "SHOW", "DESC", "DESCRIBE", "VALUES", "EXPLAIN"]);

/** Classify a statement: reads auto-run, everything else needs approval. */
export function classifySql(sql: string): "read" | "write" {
  const first = sql
    .replace(/--[^\n]*\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .trim()
    .split(/[\s(]+/)[0]
    ?.toUpperCase();
  return READ_KEYWORDS.has(first ?? "") ? "read" : "write";
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Escape a string literal for SQL. */
function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function shape(out: QueryOutput) {
  return {
    columns: out.columns,
    rows: out.rows,
    rowCount: out.rowCount,
    ...(out.truncated ? { note: `Only the first ${out.rows.length} rows are shown.` } : {}),
  };
}

export function buildTools(ctx: {
  db: DbRegistry;
  session: Session;
  connectionId: string | null;
  insights?: InsightStore;
  kb?: KnowledgeGraph;
  settings?: AgentSettings;
  dashboards?: DashboardStore;
  /** Model for sub-agents; omitting disables spawn_researcher. */
  model?: LanguageModel;
  /** Read-only mode (sub-agents): writes fail instead of asking. */
  readOnly?: boolean;
}): ToolSet {
  const { db, session } = ctx;

  const requireConn = (): string => {
    if (!ctx.connectionId) {
      const saved = db.list();
      throw new Error(
        saved.length
          ? `No connection is active in this chat. Saved connections exist (${saved.map((c) => c.name).join(", ")}) — tell the user to connect via the Connect button in the title bar, then retry. Do not ask for credentials.`
          : "No database connection is active. Tell the user to connect via the Connect button in the title bar (for a local Exasol Personal the defaults are localhost:8563, user sys, password exasol). Do not ask for credentials in chat — Exasol Studio manages them.",
      );
    }
    return ctx.connectionId;
  };

  return {
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
        return { ok: true, affectedRows: affected };
      },
    }),

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
              "TEST each panel's SQL with run_sql before saving. Omit id to create.",
            inputSchema: z.object({
              dashboard: z.object({
                id: z.string().optional(),
                title: z.string(),
                description: z.string().optional(),
                panels: z.array(z.record(z.string(), z.unknown())).min(1).describe("Panel objects per the dashboard spec"),
              }),
            }),
            execute: async ({ dashboard }) => {
              try {
                const saved = ctx.dashboards!.save({ version: 1, description: "", ...dashboard });
                session.record({ kind: "dashboard.saved", id: saved.id, title: saved.title, panels: saved.panels.length });
                return { ok: true, id: saved.id, note: "Saved. The user can open it in the Dashboards view (chart icon in the activity rail)." };
              } catch (e) {
                return { ok: false, error: e instanceof Error ? e.message : String(e), hint: "Fix the spec to match the schema and retry." };
              }
            },
          }),
        }
      : {}),

    ...(!ctx.readOnly
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

    remember_insight: tool({
      description:
        "Save a short, verified fact about this database for future sessions (join keys, table meanings, business definitions). " +
        "Only save facts confirmed by tool results — never assumptions.",
      inputSchema: z.object({
        fact: z.string().max(300).describe("One concise, verified fact"),
      }),
      execute: async ({ fact }) => {
        if (ctx.settings && !ctx.settings.enableInsights) {
          return { saved: false, note: "Cross-session insights are disabled in settings." };
        }
        ctx.insights?.add(ctx.connectionId, fact);
        session.record({ kind: "insight.saved", fact });
        return { saved: true };
      },
    }),

    ...(ctx.model && !ctx.readOnly && ctx.settings?.enableResearcher !== false
      ? {
          spawn_researcher: tool({
            description:
              "Spawn a parallel read-only researcher to explore part of the database (schemas, tables, sampling, read queries) and report findings. " +
              "Use MULTIPLE calls in one turn to fan out across independent questions — they run concurrently and keep your own context small.",
            inputSchema: z.object({
              task: z.string().describe("A focused research question, e.g. 'Map the tables and join keys related to orders'"),
            }),
            execute: async ({ task }) => {
              const subTools = buildTools({
                db,
                session,
                connectionId: ctx.connectionId,
                insights: ctx.insights,
                kb: ctx.kb,
                settings: ctx.settings,
                readOnly: true,
              });
              const res = await generateText({
                model: ctx.model!,
                system:
                  "You are a read-only database researcher inside Exasol Studio. Investigate the task with tools, then reply with a dense, factual report. " +
                  "Every claim must come from a tool result — if something is unknown, state that plainly. Exasol dialect: LIMIT n, UPPERCASE identifiers, SYS.EXA_ALL_* metadata.",
                prompt: task,
                tools: subTools,
                stopWhen: stepCountIs(6),
                temperature: 0.1,
                abortSignal: session.abort?.signal,
              });
              session.record({ kind: "subagent", task, report: res.text.slice(0, 2000) });
              return { report: res.text };
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
  };
}
