import { stepCountIs, streamText, type ModelMessage, type ToolSet } from "ai";
import type { ProviderRegistry } from "./providers.ts";
import type { ConfigStore } from "./config.ts";
import type { DashboardStore } from "./dashboards.ts";
import type { ArtifactStore } from "./artifacts.ts";
import type { Session, SessionStore } from "./session.ts";
import type { DbRegistry } from "./db.ts";
import type { MemoryStore } from "./memory.ts";
import type { KnowledgeGraph } from "./kb.ts";
import { buildTools } from "./tools.ts";
import uiMap from "../data/ui-map.json" with { type: "json" };
import type { SkillStore } from "./skills.ts";
import { maybeCompact } from "./compact.ts";
import { log } from "./log.ts";
import { readAgentCapabilities } from "./capabilities.ts";

const MAX_STEPS = 12;

const SYSTEM_PROMPT = `You are the Exasol Studio agent — an expert in the Exasol analytics database, embedded in a desktop SQL workbench.

EVIDENCE RULES — these are absolute:
- Every claim about the user's data or schema MUST be backed by a tool result from THIS conversation. No exceptions.
- If you have not verified something, do not state it. Say "let me check" and call a tool instead. Admitting "I don't know yet" and checking is correct; a confident guess is a failure.
- NEVER invent schema, table, or column names. Discover them with list_schemas / list_tables / describe_table first.
- When you answer a data question, the SQL you ran IS the evidence — show it.
- If a tool returns an error or empty result, report that honestly. Do not fabricate a plausible answer around it.
- COMPLETENESS CHECK before finishing: every schema/table/number in your answer must trace to a tool result from THIS turn. If the question spans several objects, cover ALL of them — never describe an object you did not query, and never drop one you did. If anything is missing, call the tool instead of finishing.

Choosing dashboard vs artifact: if the user types /dashboard (or clearly asks for a dashboard / live charts), build a DASHBOARD with dashboard_save. If they type /artifact (or ask for a report/HTML/insight page), build an ARTIFACT with render_artifact. Honor the explicit choice — never substitute one for the other. Always give dashboard panels a clear title.

Artifacts: for anything richer than a couple of sentences, call load_skill('artifact-builder') then render_artifact({title, html}) — a self-contained HTML page opens as a tab in the app — use it for rich insights, reports, or small interactive views that a chat message can't express (styled summaries, diagrams, an HTML table of findings). The html must be ONE complete document with inline CSS/JS (no external URLs). Prefer this over long text when the user wants a visual insight; use dashboards for live SQL-backed charts.

Dashboards: you can BUILD live dashboards with dashboard_save (validated JSON spec: panels with SQL + bar/line/area/pie/scatter charts, KPI cards, tables, and 'explore' panels — an interactive pivot/chart studio the user can reshape — on a 12-column grid). When the user asks for a dashboard: find the tables (kb_search), verify columns, test each panel's SQL with run_sql, then save — the dashboard opens in the app's Dashboards view. Panel SQL MUST use fully schema-qualified names (WEATHER.WEATHER_DAILY, never bare WEATHER_DAILY) — panels run without a default schema. It MUST aggregate in the database (GROUP BY / LIMIT): Exasol crunches millions of rows server-side and a chart needs at most a few hundred — never chart raw row dumps. NEVER tell the user a dashboard exists unless dashboard_save returned ok:true with an id — on ok:false, read the hint, fix the spec, retry once, or report the failure honestly. For charts beyond the basic five, put a full ECharts option in viz.option with your own series (any ECharts series type) — the panel injects the query result as dataset.source (first row = column names).

Working method:
- START data questions with kb_search — it returns the relevant tables, columns, and join conditions from the schema knowledge graph in one call.
- Prefer ONE set-based catalog query over per-object loops: e.g. table counts per schema = SELECT TABLE_SCHEMA, COUNT(*) FROM SYS.EXA_ALL_TABLES GROUP BY TABLE_SCHEMA — one call, complete, nothing missed.
- Answer data questions by running SQL with run_sql, then summarize the actual result.
- Decompose multi-part requests: when the user asks for several INDEPENDENT things (e.g. "summarize energy AND weather AND draft a dashboard", or "profile these three tables"), issue MULTIPLE spawn_researcher calls in ONE turn — they run in parallel and report back, then you synthesize. Keep dependent steps (discover schema → then its tables → then sample) sequential in the main loop. Rule of thumb: 3+ independent sub-questions → fan out.
- When you verify a durable fact (a join key, what a table means, a business definition), save it with remember_insight so future sessions know it.
- For performance questions use profile_query (Exasol has no EXPLAIN — profiling is the mechanism).
- Statements that modify data or structure require the user's approval; use them only when the user asked for a change, and never retry a denied statement.

Connections — how they actually work:
- Credentials must NEVER be collected in chat; Exasol Studio manages connections and grants the active one to your tools automatically.
- Connecting: if the request is SPECIFIC (names a connection, says "defaults", or gives credentials) call ui_connect right away. If it is GENERIC ("connect to the db" with several saved options, or nothing saved and no hint), ask ONE short clarifying question first (which connection / use local defaults?) — then act on the answer without re-asking.
- ui_connect behaves like a human: it clicks Connect, fills the details visibly, and PAUSES so the user can adjust or confirm — the tool returns only after that. ok → verify with list_connections and continue; not ok → relay the tool's detail (error or cancellation) plainly.
- The same clarify-first rule applies to other vague asks (e.g. "make a dashboard" with no subject): one short question, then do it.
- UI tools (ui_open / ui_editor_insert) are ONLY for things the user explicitly asked to see or have placed in the app ("open the marketplace", "put this query in a tab"). They are NEVER part of building dashboards, testing SQL (use run_sql), or any other internal work — and never call the same UI tool twice in a row with the same input. Open a saved dashboard at most ONCE, after it saved successfully.
- If any tool fails twice with the same error, STOP and tell the user what failed instead of trying again.
- Local Exasol background knowledge: Studio uses native Exasol Personal on macOS and digest-pinned Exasol Nano through Docker/Podman on Windows/Linux. The managed local profile uses localhost, a generated vault-backed SYS password, and self-signed TLS; the bundled MCP server uses its own read-only STUDIO_MCP_* profile. Connect through the saved profiles and never ask the user to paste generated passwords into chat.

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
  memory: MemoryStore;
  kb: KnowledgeGraph;
  store: SessionStore;
  config: ConfigStore;
  dashboards: DashboardStore;
  artifacts: ArtifactStore;
  skills: SkillStore;
  modelRef: string;
  userText: string;
  /** Extra context from the app (current schema, editor SQL, selection). */
  context?: string;
}): Promise<void> {
  const { session, registry, db, memory, kb, store, config, dashboards, artifacts, skills: skillStore, modelRef, userText, context } = opts;
  const settings = config.settings();
  if (session.running) throw new Error("Session is already generating");

  const model = registry.resolve(modelRef);
  const content = context ? `<context>\n${context}\n</context>\n\n${userText}` : userText;
  session.autoTitle(userText);
  session.messages.push({ role: "user", content });
  session.record({ kind: "user", model: modelRef, text: userText, context: context ?? null, connection: session.connectionId });
  session.emit({ type: "user-message", text: userText });

  // Cross-session knowledge, verified facts saved by earlier sessions.
  const remembered = settings.enableInsights ? memory.context(session.connectionId) : "";
  let system = remembered
    ? `${SYSTEM_PROMPT}\n\nMemory — durable facts about the user and this database (still confirm anything critical before acting):\n${remembered}`
    : SYSTEM_PROMPT;
  const skillList = skillStore.list();
  const defaultSkills = [...new Set(settings.defaultSkills)]
    .map((name) => skillList.find((skill) => skill.name === name))
    .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill));
  if (defaultSkills.length) {
    system += `\n\nDefault skills — these instructions are already active for this turn:\n${defaultSkills
      .map((skill) => `\n<skill name="${skill.name}">\n${skill.body}\n</skill>`)
      .join("\n")}`;
  }
  if (skillList.length) {
    system += `\n\nSkills — default skills above are already active; use load_skill(name) before a matching non-default task:\n${skillList
      .map((sk) => `- ${sk.name}${defaultSkills.includes(sk) ? " (active default)" : ""}: ${sk.description}`)
      .join("\n")}`;
  }
  const capabilities = readAgentCapabilities(config.dataDir);
  const semanticViewsConnectionId = capabilities.semanticViews?.connectionId;
  const semanticViewsReady =
    capabilities.localReady === true &&
    capabilities.semanticViews?.state === "ready" &&
    Boolean(session.connectionId) &&
    semanticViewsConnectionId === session.connectionId;
  if (semanticViewsReady) {
    system += `\n\nSEMANTIC VIEWS READY — use the semantic layer as the source of truth for business and analytics questions. Load exasol-semantic-analyst before the first semantic task, discover SEMANTIC_AGENT models/fields, check valid combinations, then compile with semantic_compile_request (or semantic_compile_sql for user-supplied semantic SQL). Execute only GENERATED_SQL returned with STATUS=OK. Never reconstruct metric formulas, infer physical joins, or fall back to physical-table SQL after a semantic compiler error.`;
  }
  if (settings.customInstructions.trim()) {
    system += `\n\nWorkspace instructions from the user (these take precedence over built-in skill defaults when they conflict):\n${settings.customInstructions.trim()}`;
  }

  // RAG grounding: retrieve the relevant slice of the schema knowledge graph
  // for THIS message and inject it, rather than depending on the model to
  // call kb_search or on its own memory (which varies model to model). The
  // model still verifies with tools before acting on anything critical.
  if (session.connectionId) {
    try {
      const grounding = buildRetrievedContext(kb, session.connectionId, userText);
      if (grounding) system += grounding;
    } catch (e) {
      log.warn("rag grounding failed", { error: String(e) });
    }
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

  const tools = buildTools({
    db,
    session,
    connectionId: session.connectionId,
    memory,
    kb,
    model,
    settings,
    dashboards,
    artifacts,
    skills: skillList,
    semanticViewsReady,
    semanticViewsConnectionId,
  });
  // Force forward progress: if the model repeats an identical tool call,
  // hand back a firm nudge instead of re-running (the first result is already
  // in the conversation). This resolves loops the model would otherwise get
  // stuck in far more gracefully than a hard abort.
  const guardedTools = wrapForProgress(tools);
  const started = Date.now();
  const callCounts = new Map<string, number>();
  const DOOM_LIMIT = 5;
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
      tools: guardedTools,
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
        case "tool-input-start": {
          // The model has STARTED producing a tool call (e.g. a big artifact
          // HTML) — show activity now so it never looks stuck.
          const p = part as { id?: string; toolName?: string };
          if (p.id && p.toolName) {
            session.emit({ type: "tool-start", callId: p.id, name: p.toolName, args: {} });
          }
          break;
        }
        case "tool-call": {
          session.record({ kind: "tool.call", name: part.toolName, args: part.input });
          session.emit({ type: "tool-start", callId: part.toolCallId, name: part.toolName, args: part.input });
          // Doom-loop breaker: the same tool with identical input N times means
          // the model is stuck — stop the turn instead of burning the app.
          const sig = `${part.toolName}:${JSON.stringify(part.input)}`;
          const n = (callCounts.get(sig) ?? 0) + 1;
          callCounts.set(sig, n);
          if (n >= DOOM_LIMIT) {
            session.record({ kind: "doom-loop", tool: part.toolName, repeats: n });
            session.emit({
              type: "error",
              message: `Stopped: I was repeating the same action (${part.toolName}) without progress. Tell me how you'd like to proceed.`,
            });
            session.abort?.abort();
          }
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

/**
 * Retrieval-augmented grounding for one message: a compact landscape of the
 * database plus the tables most relevant to the user's text (columns + join
 * conditions from the knowledge graph). Injected into the system prompt so
 * the answer is grounded in real schema facts regardless of the model.
 */
function buildRetrievedContext(kb: KnowledgeGraph, conn: string, userText: string): string | null {
  const overview = kb.overview(conn, 8);
  if (!overview.length) return null; // KB not crawled yet — tools will do the work

  const landscape = overview
    .map((s) => {
      const tables = s.tables
        .map((t) => `${t.name}${t.rows != null ? ` (${t.rows} rows)` : ""}${t.meaning ? ` — ${t.meaning}` : ""}`)
        .join(", ");
      return `  ${s.schema}: ${tables}`;
    })
    .join("\n");

  const cards = kb.search(conn, userText, 6);
  const relevant = cards
    .map((c) => {
      const cols = c.columns.map((col) => `${col.name} ${col.type}`).join(", ");
      const joins = c.joins.length ? `\n    joins: ${c.joins.join("; ")}` : "";
      const meaning = c.meaning ? `\n    meaning: ${c.meaning}` : "";
      const more = c.columnCount && c.columnCount > c.columns.length ? ` (+${c.columnCount - c.columns.length} more columns)` : "";
      return `  ${c.schema}.${c.table} [${c.kind}]${meaning}\n    columns: ${cols}${more}${joins}`;
    })
    .join("\n");

  let block = `\n\n<retrieved_context>\nRetrieved from the schema knowledge graph for THIS message. Use it to write correct SQL directly; you still verify with tools before acting on anything critical, and you never invent names not shown here.\n\nDatabase landscape:\n${landscape}`;
  if (relevant) block += `\n\nMost relevant to this request:\n${relevant}`;
  block += `\n</retrieved_context>`;
  return block;
}

/**
 * Wrap tools so an identical (name + args) call doesn't silently re-run and
 * loop. The first result is already in the conversation, so on repeat we
 * return a firm, escalating instruction to move on. This keeps weaker local
 * models from spinning on the same call (e.g. re-listing schemas after a
 * successful CREATE) while never fabricating a different answer.
 */
function wrapForProgress(tools: ToolSet): ToolSet {
  const counts = new Map<string, number>();
  const out: ToolSet = {};
  for (const [name, def] of Object.entries(tools)) {
    const original = (def as { execute?: (a: unknown, o: unknown) => Promise<unknown> }).execute;
    if (typeof original !== "function") {
      out[name] = def;
      continue;
    }
    out[name] = {
      ...def,
      execute: async (args: unknown, opts: unknown) => {
        const sig = `${name}:${JSON.stringify(args ?? {})}`;
        const n = (counts.get(sig) ?? 0) + 1;
        counts.set(sig, n);
        if (n >= 2) {
          return {
            repeated: true,
            note:
              `You have already called \`${name}\` with these exact arguments ${n} time(s) this turn; ` +
              `its result is already above in the conversation and has not changed. ` +
              `Do NOT call it again. Use that result to answer now, or take a DIFFERENT action ` +
              `(a different tool or different arguments). If the information you need is genuinely ` +
              `not available, say so plainly instead of retrying.`,
          };
        }
        return original(args, opts);
      },
    } as ToolSet[string];
  }
  return out;
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
