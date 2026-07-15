import { stepCountIs, streamText, type ModelMessage } from "ai";
import type { ProviderRegistry } from "./providers.ts";
import type { ConfigStore } from "./config.ts";
import type { DashboardStore } from "./dashboards.ts";
import type { Session, SessionStore } from "./session.ts";
import type { DbRegistry } from "./db.ts";
import type { InsightStore } from "./insights.ts";
import type { KnowledgeGraph } from "./kb.ts";
import { buildTools } from "./tools.ts";
import uiMap from "../data/ui-map.json" with { type: "json" };
import { maybeCompact } from "./compact.ts";
import { log } from "./log.ts";

const MAX_STEPS = 12;

const SYSTEM_PROMPT = `You are the Exasol Studio agent — an expert in the Exasol analytics database, embedded in a desktop SQL workbench.

EVIDENCE RULES — these are absolute:
- Every claim about the user's data or schema MUST be backed by a tool result from THIS conversation. No exceptions.
- If you have not verified something, do not state it. Say "let me check" and call a tool instead. Admitting "I don't know yet" and checking is correct; a confident guess is a failure.
- NEVER invent schema, table, or column names. Discover them with list_schemas / list_tables / describe_table first.
- When you answer a data question, the SQL you ran IS the evidence — show it.
- If a tool returns an error or empty result, report that honestly. Do not fabricate a plausible answer around it.
- COMPLETENESS CHECK before finishing: every schema/table/number in your answer must trace to a tool result from THIS turn. If the question spans several objects, cover ALL of them — never describe an object you did not query, and never drop one you did. If anything is missing, call the tool instead of finishing.

Dashboards: you can BUILD live dashboards with dashboard_save (validated JSON spec: panels with SQL + bar/line/area/pie/scatter charts, KPI cards, tables on a 12-column grid). When the user asks for a dashboard: find the tables (kb_search), verify columns, test each panel's SQL with run_sql, then save — the dashboard opens in the app's Dashboards view. Panel SQL MUST aggregate in the database (GROUP BY / LIMIT): Exasol crunches millions of rows server-side and a chart needs at most a few hundred — never chart raw row dumps.

Working method:
- START data questions with kb_search — it returns the relevant tables, columns, and join conditions from the schema knowledge graph in one call.
- Prefer ONE set-based catalog query over per-object loops: e.g. table counts per schema = SELECT TABLE_SCHEMA, COUNT(*) FROM SYS.EXA_ALL_TABLES GROUP BY TABLE_SCHEMA — one call, complete, nothing missed.
- Answer data questions by running SQL with run_sql, then summarize the actual result.
- For broad exploration (many schemas/tables), fan out with spawn_researcher — issue several calls in one turn; they run in parallel and report back.
- When you verify a durable fact (a join key, what a table means, a business definition), save it with remember_insight so future sessions know it.
- For performance questions use profile_query (Exasol has no EXPLAIN — profiling is the mechanism).
- Statements that modify data or structure require the user's approval; use them only when the user asked for a change, and never retry a denied statement.

Connections — how they actually work:
- Credentials must NEVER be collected in chat; Exasol Studio manages connections and grants the active one to your tools automatically.
- Connecting: if the request is SPECIFIC (names a connection, says "defaults", or gives credentials) call ui_connect right away. If it is GENERIC ("connect to the db" with several saved options, or nothing saved and no hint), ask ONE short clarifying question first (which connection / use local defaults?) — then act on the answer without re-asking.
- ui_connect behaves like a human: it clicks Connect, fills the details visibly, and PAUSES so the user can adjust or confirm — the tool returns only after that. ok → verify with list_connections and continue; not ok → relay the tool's detail (error or cancellation) plainly.
- The same clarify-first rule applies to other vague asks (e.g. "make a dashboard" with no subject): one short question, then do it.
- You can also drive the app UI: ui_open opens views (dashboards, marketplace, git, query tab…); ui_editor_insert puts SQL into a new editor tab for the user.
- Exasol Personal (local) background knowledge, useful when the user asks about defaults: host localhost, port 8563, user sys, password exasol, self-signed TLS. Share this as information; do not ask the user to paste it back.

Exasol SQL dialect:
- Use LIMIT n (never FETCH FIRST or TOP). QUALIFY filters window functions. IDENTITY columns exist.
- Unquoted identifiers fold to UPPERCASE; double-quote mixed-case or reserved identifiers.
- System metadata lives in SYS (EXA_ALL_*), statistics in EXA_STATISTICS.

Be concise and direct. Prefer runnable SQL in \`\`\`sql blocks. Small result tables may be shown as markdown tables.

App map — Exasol Studio's geography (use app_ui_locate for detail on anything deeper):
${(uiMap.entries as { id: string; label: string; where: string }[])
  .filter((e) => /^(rail|titlebar|editor|tabs|history|ai)\./.test(e.id))
  .map((e) => `- ${e.label}: ${e.where}`)
  .join("\n")}`;

/** One user turn: multi-step agent loop with tool execution. */
export async function runTurn(opts: {
  session: Session;
  registry: ProviderRegistry;
  db: DbRegistry;
  insights: InsightStore;
  kb: KnowledgeGraph;
  store: SessionStore;
  config: ConfigStore;
  dashboards: DashboardStore;
  modelRef: string;
  userText: string;
  /** Extra context from the app (current schema, editor SQL, selection). */
  context?: string;
}): Promise<void> {
  const { session, registry, db, insights, kb, store, config, dashboards, modelRef, userText, context } = opts;
  const settings = config.settings();
  if (session.running) throw new Error("Session is already generating");

  const model = registry.resolve(modelRef);
  const content = context ? `<context>\n${context}\n</context>\n\n${userText}` : userText;
  session.autoTitle(userText);
  session.messages.push({ role: "user", content });
  session.record({ kind: "user", model: modelRef, text: userText, context: context ?? null, connection: session.connectionId });

  // Cross-session knowledge, verified facts saved by earlier sessions.
  const known = settings.enableInsights ? insights.recent(session.connectionId) : [];
  let system = known.length
    ? `${SYSTEM_PROMPT}\n\nVerified workspace knowledge from earlier sessions (still confirm anything critical):\n${known.map((k) => `- ${k}`).join("\n")}`
    : SYSTEM_PROMPT;
  if (settings.customInstructions.trim()) {
    system += `\n\nWorkspace instructions from the user:\n${settings.customInstructions.trim()}`;
  }

  session.running = true;
  session.abort = new AbortController();
  session.emit({ type: "status", state: "thinking" });

  // Fold older turns into a summary if we're nearing the context window.
  if (settings.enableCompaction) {
    await maybeCompact({
      session,
      model,
      contextLimit: registry.contextFor(modelRef),
      system,
    });
  }

  const tools = buildTools({ db, session, connectionId: session.connectionId, insights, kb, model, settings, dashboards });
  const started = Date.now();
  // Providers reuse stream part ids across turns (llama.cpp emits "0" every
  // time) — scope every id to this turn so the UI never merges answers.
  const turnId = crypto.randomUUID().slice(0, 8);
  const scoped = (id: string | undefined | null) => `${turnId}:${id || "t"}`;
  const fallbackId = scoped("t");
  let sawText = false;
  let currentTextId: string | null = null;

  try {
    const result = streamText({
      model,
      system,
      messages: session.messages as ModelMessage[],
      tools,
      stopWhen: stepCountIs(Math.min(Math.max(settings.maxSteps, 2), 24)),
      temperature: Math.min(Math.max(settings.temperature, 0), 1),
      abortSignal: session.abort.signal,
    });

    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-start": {
          currentTextId = scoped(part.id);
          session.emit({ type: "message-start", messageId: currentTextId, role: "assistant" });
          break;
        }
        case "text-delta": {
          if (!sawText) {
            session.emit({ type: "status", state: "streaming" });
            sawText = true;
          }
          const id = part.id ? scoped(part.id) : currentTextId || fallbackId;
          session.emit({ type: "text-delta", messageId: id, delta: part.text });
          break;
        }
        case "reasoning-delta": {
          session.emit({ type: "reasoning-delta", messageId: part.id ? scoped(part.id) : fallbackId, delta: part.text });
          break;
        }
        case "tool-call": {
          session.record({ kind: "tool.call", name: part.toolName, args: part.input });
          session.emit({ type: "tool-start", callId: part.toolCallId, name: part.toolName, args: part.input });
          break;
        }
        case "tool-result": {
          session.emit({
            type: "tool-end",
            callId: part.toolCallId,
            name: part.toolName,
            ok: true,
            summary: summarize(part.output),
          });
          break;
        }
        case "tool-error": {
          const message = part.error instanceof Error ? part.error.message : String(part.error);
          session.record({ kind: "tool.error", name: part.toolName, error: message });
          session.emit({ type: "tool-end", callId: part.toolCallId, name: part.toolName, ok: false, summary: message });
          break;
        }
        case "error": {
          throw part.error instanceof Error ? part.error : new Error(String(part.error));
        }
        default:
          break;
      }
    }

    // Persist the full multi-step exchange (assistant + tool messages).
    const response = await result.response;
    session.messages.push(...(response.messages as ModelMessage[]));

    const usage = await result.totalUsage.catch(() => undefined);
    const text = await result.text.catch(() => "");
    session.record({
      kind: "assistant",
      model: modelRef,
      text,
      steps: (await result.steps.catch(() => [])).length,
      usage: usage ?? null,
      durationMs: Date.now() - started,
    });
    session.emit({
      type: "message-done",
      messageId: currentTextId ?? fallbackId,
      usage: usage ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } : undefined,
    });
  } catch (e) {
    const aborted = session.abort?.signal.aborted;
    const message = aborted ? "Stopped." : e instanceof Error ? e.message : String(e);
    session.record({ kind: aborted ? "aborted" : "error", model: modelRef, error: message });
    if (!aborted) log.error("turn failed", { model: modelRef, error: message });
    session.emit(
      aborted
        ? { type: "message-done", messageId: currentTextId ?? fallbackId }
        : { type: "error", message },
    );
  } finally {
    session.running = false;
    session.abort = null;
    store.touch(session);
    session.emit({ type: "status", state: "idle" });
    // Background: enrich the schema graph with AI semantics (batched, capped,
    // deduplicated inside annotateMissing) — reduces future token usage.
    if (session.connectionId) {
      void kb.annotateMissing(session.connectionId, model).catch(() => undefined);
    }
  }
}

/** Tiny, model-free summary of a tool result for the UI chip. */
function summarize(output: unknown): string {
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    if (o.denied) return "denied by user";
    if (typeof o.affectedRows === "number") return `${o.affectedRows} rows affected`;
    if (typeof o.rowCount === "number") return `${o.rowCount} rows`;
    if (o.columns && Array.isArray(o.columns)) return `${(o.columns as unknown[]).length} columns`;
    if (o.error) return String(o.error);
  }
  return "done";
}
