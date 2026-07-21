import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { runLoop, type ToolSet } from "./llm.ts";
import type { ProviderRegistry } from "./providers.ts";
import type { ConfigStore } from "./config.ts";
import type { DashboardStore } from "./dashboards.ts";
import type { ArtifactStore } from "./artifacts.ts";
import type { Session, SessionStore } from "./session.ts";
import type { DbRegistry } from "./db.ts";
import type { MemoryStore } from "./memory.ts";
import type { KnowledgeGraph } from "./kb.ts";
import type { DocumentStore } from "./documents.ts";
import { buildTools } from "./tools.ts";

/** A file or image attached to a user message. */
export type Attachment = {
  name: string;
  mime: string;
  kind: "text" | "image" | "binary";
  /** text: the file's text content; image: a data: URL; binary: base64 bytes. */
  data: string;
};
import uiMap from "../data/ui-map.json" with { type: "json" };
import type { SkillStore } from "./skills.ts";
import { maybeCompact } from "./compact.ts";
import { extractMemories } from "./memory-extract.ts";
import { repairCall, extractTextToolCalls, resolveToolName, repairArgs, zodSchemaish } from "./tool-repair.ts";
import { TurnBoard } from "./board.ts";
import { Command } from "@langchain/langgraph";
import { buildTurnGraph, type TurnGraphState } from "./graph.ts";
import { log } from "./log.ts";
import { readAgentCapabilities } from "./capabilities.ts";

const MAX_STEPS = 12;

const SYSTEM_PROMPT = `You are Exa, the Exasol Studio agent — an expert in the Exasol analytics database, embedded in a desktop SQL workbench.

EVIDENCE RULES — these are absolute:
- Every claim about the user's data or schema MUST be backed by a tool result from THIS conversation. No exceptions.
- If you have not verified something, do not state it. Say "let me check" and call a tool instead. Admitting "I don't know yet" and checking is correct; a confident guess is a failure.
- NEVER invent schema, table, or column names. Discover them with list_schemas / list_tables / describe_table first.
- When you answer a data question, the SQL you ran IS the evidence — show it.
- If a tool returns an error or empty result, report that honestly. Do not fabricate a plausible answer around it.
- COMPLETENESS CHECK before finishing: every schema/table/number in your answer must trace to a tool result from THIS turn. If the question spans several objects, cover ALL of them — never describe an object you did not query, and never drop one you did. If anything is missing, call the tool instead of finishing.

ACT, DON'T NARRATE — this is how you work:
- You do tasks by CALLING TOOLS, not by describing them. If a tool can do it, CALL THE TOOL — do not answer with a plan, a numbered list of steps, or a block of SQL "to run".
- If you catch yourself writing "Step 1… Step 2…", "we'll use…", "let's start by…", or pasting SQL you intend the user to run, STOP and call the tool that does it instead. The user wants the result, not instructions.
- When the user asks to load/add/import a file, DON'T print SQL — call import_csv. When they ask a data question, DON'T print a query — call run_sql. When they ask what's in the database, call list_schemas/list_tables/describe_table.
- NEVER invent a command, function, SQL syntax, or system table to make a task look done (there is no EXA_PUMP statement; there is no SYS.EXA_ATTACHED_FILES). If no available tool can do what's asked, say that in one plain sentence — don't fabricate a mechanism.
- A turn that only describes what could be done, without calling the tools that do it, is a failed turn.

Choosing dashboard vs artifact: if the user types /dashboard (or clearly asks for a dashboard / live charts), build a DASHBOARD with dashboard_save. If they type /artifact (or ask for a report/HTML/insight page), build an ARTIFACT with render_artifact. Honor the explicit choice — never substitute one for the other. Always give dashboard panels a clear title.

Artifacts: for anything richer than a couple of sentences, call load_skill('artifact-builder') then render_artifact({title, html}) — a self-contained HTML page opens as a tab in the app — use it for rich insights, reports, or small interactive views that a chat message can't express (styled summaries, diagrams, an HTML table of findings). The html must be ONE complete document with inline CSS/JS (no external URLs). Prefer this over long text when the user wants a visual insight; use dashboards for live SQL-backed charts.

Dashboards: you can BUILD live dashboards with dashboard_save (validated JSON spec: panels with SQL + bar/line/area/pie/scatter charts, KPI cards, tables, 'explore' panels — an interactive pivot/chart studio the user can reshape — and MARKDOWN text panels ({viz:{type:"markdown",content}}, no query) for narrative, all on a 12-column grid). For report-style dashboards, open with a full-width markdown summary panel (what the data shows, in 2-4 sentences) and add short markdown insight notes next to key charts — dashboards can be exported as Markdown/HTML/PDF reports, and the narrative is what makes them readable. When the user asks for a dashboard: find the tables (kb_search), verify columns, test each panel's SQL with run_sql, then save — the dashboard opens in the app's Dashboards view. For dashboards with 3+ panels, FAN OUT: issue MULTIPLE spawn_researcher calls in ONE turn — one per panel/metric area, each tasked "find the right table and columns for X, then write AND test the exact SELECT" — they run in PARALLEL and report back tested SQL; assemble the spec from their reports and call dashboard_save once. Panel SQL MUST use fully schema-qualified names (WEATHER.WEATHER_DAILY, never bare WEATHER_DAILY) — panels run without a default schema. It MUST aggregate in the database (GROUP BY / LIMIT): Exasol crunches millions of rows server-side and a chart needs at most a few hundred — never chart raw row dumps. NEVER tell the user a dashboard exists unless dashboard_save returned ok:true with an id — on ok:false, read the hint, fix the spec, retry once, or report the failure honestly. For charts beyond the basic five, put a full ECharts option in viz.option with your own series (any ECharts series type) — the panel injects the query result as dataset.source (first row = column names).

Working method:
- START data questions with kb_search — it returns the relevant tables, columns, and join conditions from the schema knowledge graph in one call.
- Prefer ONE set-based catalog query over per-object loops: table counts per schema = SELECT TABLE_SCHEMA, COUNT(*) FROM SYS.EXA_ALL_TABLES GROUP BY TABLE_SCHEMA; ALL tables in ALL schemas = SELECT TABLE_SCHEMA, TABLE_NAME FROM SYS.EXA_ALL_TABLES ORDER BY 1, 2 — one run_sql call, complete, nothing missed. NEVER loop list_tables over schemas.
- NEVER end your turn by announcing a next step ("I'll now check…", "moving on to…"). Either DO it (call the tool) or the task is finished. A turn that stops mid-plan is a failed turn.
- Answer data questions by running SQL with run_sql, then summarize the actual result.
- Decompose multi-part requests: when the user asks for several INDEPENDENT things (e.g. "summarize energy AND weather AND draft a dashboard", or "profile these three tables"), issue MULTIPLE spawn_researcher calls in ONE turn — they run in parallel and report back, then you synthesize. Keep dependent steps (discover schema → then its tables → then sample) sequential in the main loop. Rule of thumb: 3+ independent sub-questions → fan out.
- When you verify a durable fact (a join key, what a table means, a business definition), save it with remember_insight so future sessions know it.
- For performance questions use profile_query (Exasol has no EXPLAIN — profiling is the mechanism).
- Statements that modify data or structure require the user's approval; use them only when the user asked for a change, and never retry a denied statement.
- Loading attached files: when the user attaches a data file (CSV, TSV, other delimited text, or Parquet — even messy/dirty data) and asks to add, load, import, or "pump" it into a schema/table, call import_csv (docId + schema, one call per file). It detects the format, infers columns and types (tolerating messy rows), creates the schema/table, and bulk-loads the rows for you. NEVER hand-write IMPORT statements, invent an EXA_PUMP command, or query made-up tables like SYS.EXA_ATTACHED_FILES — those do not exist. Do not output a plan of SQL to run; call the tool. After it succeeds you may run_sql (e.g. SELECT COUNT(*)) to answer follow-up questions about the loaded data.

Connections — how they actually work:
- Credentials must NEVER be collected in chat; Exasol Studio manages connections and grants the active one to your tools automatically.
- Clarify-first for vague asks (e.g. "make a dashboard" with no subject): one short question, then do it.
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
  documents: DocumentStore;
  modelRef: string;
  userText: string;
  /** Extra context from the app (current schema, editor SQL, selection). */
  context?: string;
  /** Files/images the user attached to this message. */
  attachments?: Attachment[];
  /** Where this turn runs: the desktop app (default) or the terminal CLI. */
  surface?: "app" | "cli";
}): Promise<void> {
  const { session, registry, db, memory, kb, store, config, dashboards, artifacts, skills: skillStore, documents, modelRef, userText, context, attachments, surface = "app" } = opts;
  const settings = config.settings();
  if (session.running) throw new Error("Session is already generating");

  // Temperature moves to model construction in LangChain (constructor param,
  // not a per-call option).
  const model = registry.resolve(modelRef, { temperature: Math.min(Math.max(settings.temperature, 0), 1) });
  const modelSupportsImages = registry.supportsImages(modelRef);

  // Handle attachments: text/docs go into the session document store for
  // just-in-time retrieval (never dumped whole into context); images are
  // attached inline only when the model accepts image input.
  const imageParts: { type: "image"; image: string }[] = [];
  const docNotes: string[] = [];
  const skippedImages: string[] = [];
  for (const att of attachments ?? []) {
    if (att.kind === "image") {
      if (modelSupportsImages) imageParts.push({ type: "image", image: att.data });
      else skippedImages.push(att.name);
    } else if (att.kind === "binary") {
      // Binary data files (Parquet) can't be read as text — stored for loading.
      const meta = documents.addBinary(session.id, att.name, att.mime, att.data);
      docNotes.push(`- ${meta.name} (id: ${meta.id}, binary data file — load it with import_csv)`);
    } else {
      const meta = documents.add(session.id, att.name, att.mime, att.data);
      docNotes.push(`- ${meta.name} (id: ${meta.id}, ${meta.chunks} section${meta.chunks === 1 ? "" : "s"})`);
    }
  }

  let text = userText;
  if (docNotes.length) {
    text += `\n\n[Attached documents — do NOT assume their contents; use search_documents / read_document to read the relevant parts:\n${docNotes.join("\n")}]`;
  }
  if (skippedImages.length) {
    text += `\n\n[Note: ${skippedImages.length} image(s) were attached but the current model can't read images, so they were skipped: ${skippedImages.join(", ")}. Ask the user to switch to a vision model if the images matter.]`;
  }
  const withContext = context ? `<context>\n${context}\n</context>\n\n${text}` : text;
  const content = imageParts.length
    ? [{ type: "text" as const, text: withContext }, ...imageParts]
    : withContext;

  session.autoTitle(userText);
  session.messages.push(new HumanMessage({ content } as ConstructorParameters<typeof HumanMessage>[0]));
  session.record({ kind: "user", model: modelRef, text: userText, context: context ?? null, connection: session.connectionId, attachments: (attachments ?? []).map((a) => ({ name: a.name, kind: a.kind })) });
  session.emit({ type: "user-message", text: userText });

  // Doomed-turn gate: a data-loading request with NO connection. Small models
  // spiral here — narrating fake CALL import_csv(...) plans through every
  // corrective nudge. Answer deterministically in one line and stop; no model
  // call, no plan spam.
  if (!session.connectionId) {
    const tabular = documents.list(session.id).filter((d) => /\.(csv|tsv|txt|parquet)$/i.test(d.name));
    const wantsLoad = /\b(load|import|upload|pump|ingest|insert|table)\b/i.test(userText);
    if (tabular.length > 0 && wantsLoad) {
      const canned =
        `**Connect to a database first.** I have your ${tabular.length} attached file${tabular.length === 1 ? "" : "s"} ready, but there's no active connection to load into.\n\n` +
        (surface === "cli"
          ? "Run `/connect`, then ask again — "
          : "Press **Connect** in the title bar (or tap a saved connection in the Databases rail), then ask again — ") +
        `I'll load ${tabular.length === 1 ? "it" : "all of them"} in one batch with a single approval.`;
      const mid = `gate-${Date.now()}`;
      session.emit({ type: "message-start", messageId: mid, role: "assistant" });
      session.emit({ type: "text-delta", messageId: mid, delta: canned });
      session.messages.push(new AIMessage(canned));
      session.record({ kind: "assistant", model: modelRef, text: canned, steps: 0, usage: null, durationMs: 0, gated: "no-connection-load" });
      session.running = false;
      session.abort = null;
      store.touch(session);
      session.emit({ type: "status", state: "idle" });
      return;
    }
  }

  // Cross-session knowledge, verified facts saved by earlier sessions.
  const remembered = settings.enableInsights ? await memory.contextFor(session.connectionId, userText) : "";
  let system = remembered
    ? `${SYSTEM_PROMPT}\n\nMemory — background about the user and this database. NEVER answer data questions (schemas, tables, columns, counts, values) from this memory — always call the live tools to check; memory only tells you where to look:\n${remembered}`
    : SYSTEM_PROMPT;

  // Surface truth: only describe abilities that EXIST this turn. Telling a
  // model about ui_connect when UI tools are off is how it ends up writing
  // phantom tool calls instead of helping the user.
  if (surface === "cli") {
    system +=
      "\n\nEnvironment — exa-agent terminal (CLI):\n" +
      "- There is NO app UI here. ui_* tools do not exist — never call, print, or mention them.\n" +
      "- YOU cannot connect to a database for the user. They connect with the /connect command (a guided form). " +
      "If no connection is active and the task needs one, say exactly: run /connect — then stop and wait.\n" +
      "- Never ask for credentials in chat.";
  } else if (settings.enableUiTools) {
    system +=
      "\n\nEnvironment — Exasol Studio app (UI automation ENABLED):\n" +
      "- Connecting: if the request is SPECIFIC (names a connection, says \"defaults\", or gives credentials) call ui_connect right away. If it is GENERIC (\"connect to the db\" with several saved options, or nothing saved and no hint), ask ONE short clarifying question first — then act on the answer without re-asking.\n" +
      "- ui_connect behaves like a human: it clicks Connect, fills the details visibly, and PAUSES so the user can adjust or confirm — the tool returns only after that. ok → verify with list_connections and continue; not ok → relay the tool's detail plainly.\n" +
      "- UI tools (ui_open / ui_editor_insert) are ONLY for things the user explicitly asked to see or have placed in the app. They are NEVER part of building dashboards or testing SQL (use run_sql) — and never call the same UI tool twice in a row with the same input. Open a saved dashboard at most ONCE, after it saved successfully.";
  } else {
    system +=
      "\n\nEnvironment — Exasol Studio app (UI automation DISABLED):\n" +
      "- ui_* tools are turned OFF in this workspace — never call, print, or mention them.\n" +
      "- YOU cannot connect to a database for the user. When no connection is granted and the task needs one, tell the user to connect via the Connect button in the title bar (or tap their connection in the Databases rail), then stop and wait.\n" +
      "- Never ask for credentials in chat.";
  }
  const skillList = skillStore.list();
  const defaultSkills = [...new Set(settings.defaultSkills)]
    .map((name) => skillList.find((skill) => skill.name === name))
    .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill));
  if (defaultSkills.length) {
    system += `\n\nDefault skills — these instructions are already active for this turn:\n${defaultSkills
      .map((skill) => `\n<skill name="${skill.name}">\n${skill.body}\n</skill>`)
      .join("\n")}`;
  }
  // Semantic auto-activation: surface the skill whose meaning matches THIS
  // turn (jcode-style embedding hit) and inject its full body, so the right
  // playbook is live without the model remembering to call load_skill.
  const autoSkills = (await skillStore.recall(userText, 1)).filter((sk) => !defaultSkills.includes(sk));
  if (autoSkills.length) {
    system += `\n\nRelevant skill for this request (auto-activated):\n${autoSkills
      .map((sk) => `## ${sk.name}\n${sk.body}`)
      .join("\n\n")}`;
  }
  if (skillList.length) {
    const covered = new Set([...defaultSkills, ...autoSkills]);
    system += `\n\nSkills — default + auto-activated ones above are already active; use load_skill(name) before a matching non-active task:\n${skillList
      .map((sk) => `- ${sk.name}${covered.has(sk) ? " (active)" : ""}: ${sk.description}`)
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

  // Shared blackboard for this turn's multi-agent work: researchers write
  // typed findings, later spawns see them, and resume-nudges cite them.
  const board = new TurnBoard();
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
    documents,
    semanticViewsReady,
    semanticViewsConnectionId,
    surface,
    board,
    store,
  });
  // Progressive tool disclosure: small local models get confused when handed
  // ~26 tools at once (wrong picks, hallucinated names, calls-as-text). Expose
  // only a relevant subset for this message — a huge reliability win.
  // ONE graph for every model: the native KB is the single schema source of
  // truth (per-turn RAG injection + kb_* tools), identical on local and cloud.
  // exasol-compass is positioned as the external-CLI-agent tool and a future
  // optional KB *backend* (compass extracts → KB stores), not a parallel path.
  let relevantTools = selectTools(tools, {
    text: userText,
    connected: Boolean(session.connectionId),
    hasDocuments: documents.list(session.id).length > 0,
  });
  // A model KNOWN to lack tool calling gets none — passing tools anyway makes
  // the provider reject the request or the model mangle calls into text.
  // Degrade honestly: answer from the injected schema context and say so.
  const modelSupportsTools = registry.supportsTools(modelRef);
  if (!modelSupportsTools) {
    relevantTools = {};
    system +=
      "\n\nTOOLS UNAVAILABLE — the selected model cannot call tools, so you CANNOT run SQL, inspect schemas live, or load files this turn. " +
      "Answer only from the schema context injected above and from the conversation; clearly say when something would require running a query, " +
      "and suggest switching to a tool-capable model (the model picker marks them) for hands-on work. Never pretend a query was executed.";
  }
  log.info("tools selected", { of: Object.keys(tools).length, using: Object.keys(relevantTools).length, modelSupportsTools });
  // Force forward progress: if the model repeats an identical tool call,
  // hand back a firm nudge instead of re-running (the first result is already
  // in the conversation). This resolves loops the model would otherwise get
  // stuck in far more gracefully than a hard abort.
  const guardedTools = wrapForProgress(relevantTools);
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
  // Plain plan-nudges only make sense when there's something to act ON; the
  // text-call rescue self-gates (it only fires when the text names a REAL
  // exposed tool), so it must work even before any connection exists —
  // list_connections is exactly what a model calls when disconnected.
  const actionable = modelSupportsTools && (Boolean(session.connectionId) || documents.list(session.id).length > 0);
  // Recovery budget: text-emitted tool calls are EXECUTED and the model
  // continues from their results (several rounds allowed — that's progress);
  // a plan with no extractable calls gets one corrective nudge.
  const MAX_ATTEMPTS = 4;
  // Hard budget across ALL rescue/continuation attempts — a misbehaving model
  // never burns more than this many steps of tokens in one user turn.
  const MAX_TOTAL_STEPS = 30;
  let stepsTotal = 0;
  let nudges = 0; // corrective re-runs after unacted plans (max 2)
  // Multi-file follow-through: which attached docs actually got imported this
  // turn, so a model that loads one file and stops gets sent back for the rest.
  const importedDocs = new Set<string>();
  let importedAll = false;
  let lastImportSchema: string | null = null;
  let continuations = 0; // turns resumed after the model stopped mid-plan

  try {
    // Behavior lives in these closures; ORCHESTRATION lives in the LangGraph
    // StateGraph (graph.ts) — the rescue ladder is nodes + conditional edges.
    let attemptNum = 0;

    const nodeAttempt = async (): Promise<Partial<TurnGraphState>> => {
      attemptNum++;
      sawText = false;
      currentTextId = null;

      const result = await runLoop({
        model,
        system,
        messages: session.messages,
        tools: guardedTools,
        maxSteps: Math.min(Math.max(settings.maxSteps, 2), 24),
        abortSignal: session.abort?.signal,
        stream: true,
        // Durable turns: snapshot the partial exchange after EVERY step, so
        // a crash mid-turn never erases work whose side effects already
        // happened (DDL ran, files loaded). Cleared on any normal exit.
        onStepFinish: ({ newMessages }) => {
          try {
            if (newMessages.length) session.checkpoint(userText, newMessages);
          } catch {
            /* never break the turn */
          }
        },
        onEvent: (part) => {
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
              session.emit({ type: "text-delta", messageId: part.id ? scoped(part.id) : currentTextId || fallbackId, delta: part.text });
              break;
            }
            case "tool-input-start": {
              // The model has STARTED producing a tool call (e.g. a big
              // artifact HTML) — show activity now so it never looks stuck.
              session.emit({ type: "tool-start", callId: part.id, name: part.toolName, args: {} });
              break;
            }
            case "tool-call": {
              if (part.toolName === "import_csv") {
                const a = part.input as { docId?: string; schema?: string };
                if (a?.docId) importedDocs.add(a.docId);
                if (a?.schema) lastImportSchema = a.schema;
              } else if (part.toolName === "import_attachments") {
                importedAll = true;
              }
              session.record({ kind: "tool.call", name: part.toolName, args: part.input });
              session.emit({ type: "tool-start", callId: part.toolCallId, name: part.toolName, args: part.input });
              // Doom-loop breaker: the same tool with identical input N times
              // means the model is stuck — stop instead of burning the app.
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
              session.emit({ type: "tool-end", callId: part.toolCallId, name: part.toolName, ok: true, summary: summarize(part.output) });
              break;
            }
            case "tool-error": {
              session.record({ kind: "tool.error", name: part.toolName, error: part.error });
              session.emit({ type: "tool-end", callId: part.toolCallId, name: part.toolName, ok: false, summary: part.error });
              break;
            }
          }
        },
      });

      // Persist the full multi-step exchange (assistant + tool messages).
      session.messages.push(...result.newMessages);
      stepsTotal += result.stepCount;
      session.record({
        kind: "assistant",
        model: modelRef,
        text: result.text,
        steps: result.stepCount,
        usage: result.usage ?? null,
        durationMs: Date.now() - started,
      });
      return { text: result.text, toolCalls: result.toolCallCount, usage: result.usage };
    };

    /** Retries remain within the attempt + hard step budgets? */
    const canRetry = () =>
      attemptNum < MAX_ATTEMPTS && stepsTotal < MAX_TOTAL_STEPS && modelSupportsTools && !session.abort?.signal.aborted;

    // No native tool call happened but the model tried to act. Two rescues:
    // (1) it WROTE tool calls as text (chat-template misfire, common on
    //     small models) → extract, repair, EXECUTE them for real, feed the
    //     results back, and let it continue;
    // (2) it narrated a plan with nothing executable → one corrective nudge.
    const nodeRecover = async (s: TurnGraphState): Promise<Command> => {
      const text = s.text;
      {
        const textCalls = extractTextToolCalls(text);
        const executed: string[] = [];
        const phantoms: string[] = [];
        for (const tc of textCalls) {
          const resolved = resolveToolName(tc.name, Object.keys(guardedTools));
          if (!resolved) {
            phantoms.push(tc.name);
            continue;
          }
          const def = guardedTools[resolved] as {
            inputSchema?: unknown;
            execute?: (a: unknown, o: unknown) => Promise<unknown>;
          };
          if (typeof def.execute !== "function") continue;
          const schema = zodSchemaish(def.inputSchema);
          const args = schema ? repairArgs(tc.args, schema) : tc.args;
          if (args === null) {
            executed.push(`${resolved}: NOT run — required arguments were missing in your text call.`);
            continue;
          }
          const callId = `txt-${crypto.randomUUID().slice(0, 8)}`;
          session.emit({ type: "tool-start", callId, name: resolved, args });
          session.record({ kind: "tool.call", name: resolved, args, via: "text-rescue" });
          try {
            const output = await def.execute(args, { toolCallId: callId, messages: [] });
            session.emit({ type: "tool-end", callId, name: resolved, ok: true, summary: summarize(output) });
            executed.push(`${resolved}(${JSON.stringify(args)}) → ${JSON.stringify(output).slice(0, 1500)}`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            session.record({ kind: "tool.error", name: resolved, error: msg });
            session.emit({ type: "tool-end", callId, name: resolved, ok: false, summary: msg });
            executed.push(`${resolved} FAILED: ${msg}`);
          }
        }

        // The model reached for a tool that does not exist this turn (usually
        // ui_* while UI automation is off, or in the CLI). Correct it once —
        // silence here leaves the user with a dead "please confirm" ending.
        if (!executed.length && phantoms.length && nudges < 2) {
          nudges++;
          session.record({ kind: "nudge", reason: "phantom-tool", tools: phantoms });
          session.messages.push(new HumanMessage(
              `You wrote a call to ${phantoms.map((p) => `\`${p}\``).join(", ")} — but no such tool exists in this session` +
              (surface === "cli" ? " (this is the terminal CLI; there is no app UI)" : " (UI automation is disabled here)") +
              `. The tools you can actually call are: ${Object.keys(guardedTools).join(", ")}. ` +
              (surface === "cli"
                ? "If the task needs a database connection, tell the user to run /connect and stop. "
                : "If the task needs a database connection, tell the user to connect via the Connect button and stop. ") +
              "Otherwise complete the task with the available tools, invoked natively — never printed as text.",
          ));
          return new Command({ goto: "attempt" });
        }

        if (executed.length) {
          session.record({ kind: "nudge", reason: "text-tool-calls-executed", count: executed.length });
          session.messages.push(new HumanMessage(
              "You wrote tool calls as plain TEXT instead of invoking them — they were extracted and executed for you. Results:\n" +
              executed.map((r) => `- ${r}`).join("\n") +
              `\n\nThe user's request was: "${userText.slice(0, 300)}". Answer it NOW with the CONCRETE data above — state the actual names, rows, and values (a short list or table), not that you received them. ` +
              "Do NOT ask what to do next. If more steps are needed, invoke further tools natively through the tool-calling mechanism — never print them into your message text.",
          ));
          return new Command({ goto: "attempt" });
        }

        // (1b) It wrote a runnable read-only statement into its reply and
        // stalled ("Here's the SQL … let me check the result"). Execute it
        // for real via the guarded run_sql, feed the rows back, and let it
        // answer with data instead of dying mid-plan.
        if (!executed.length && !phantoms.length && actionable && (looksLikeUnacted(text) || looksUnfinished(text))) {
          const runSql = guardedTools["run_sql"] as
            | { execute?: (a: unknown, o: unknown) => Promise<unknown> }
            | undefined;
          const sql = extractReadSql(text);
          if (sql && typeof runSql?.execute === "function") {
            const callId = `sql-${crypto.randomUUID().slice(0, 8)}`;
            session.emit({ type: "tool-start", callId, name: "run_sql", args: { sql } });
            session.record({ kind: "tool.call", name: "run_sql", args: { sql }, via: "sql-rescue" });
            try {
              const output = await runSql.execute(
                { sql, purpose: "running the SQL the assistant wrote as text" },
                { toolCallId: callId, messages: [] },
              );
              session.emit({ type: "tool-end", callId, name: "run_sql", ok: true, summary: summarize(output) });
              session.messages.push(new HumanMessage(
                  `You wrote SQL in your reply but never invoked run_sql — it was executed for you. Result:\n${JSON.stringify(output).slice(0, 2000)}\n\n` +
                  `The user's request was: "${userText.slice(0, 300)}". Answer it NOW with the CONCRETE data above — actual names, rows, values. ` +
                  "If more steps are needed, invoke tools natively through the tool-calling mechanism — never print them into your message text.",
              ));
              return new Command({ goto: "attempt" });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              session.record({ kind: "tool.error", name: "run_sql", error: msg });
              session.emit({ type: "tool-end", callId, name: "run_sql", ok: false, summary: msg });
              session.messages.push(new HumanMessage(
                  `You wrote SQL in your reply but never invoked run_sql. It was executed for you and FAILED: ${msg}. ` +
                  "Fix the statement and invoke run_sql natively, or report the real error to the user.",
              ));
              return new Command({ goto: "attempt" });
            }
          }
        }

        if (actionable && nudges < 2 && looksLikeUnacted(text)) {
          nudges++;
          session.record({ kind: "nudge", reason: "plan-without-tools" });
          session.messages.push(new HumanMessage(
              "You described steps, wrote SQL, or printed a tool call as plain text — but did NOT actually invoke any tool, so nothing happened. " +
              "Invoke the tools now through the tool-calling mechanism (never write them into your message text): " +
              "import_csv to load an attached file, run_sql to run a statement, list_schemas/list_tables/describe_table to inspect. " +
              "Do not reply with another plan, and never invent commands (there is no EXA_PUMP) or system tables (there is no SYS.EXA_ATTACHED_FILES). Act, then report the real results.",
          ));
          return new Command({ goto: "attempt" });
        }
      }

      // Multi-file follow-through: the user attached SEVERAL data files, the
      // model imported some but not all, then stopped (often drifting into a
      // greeting). Send it back with the exact remaining files — batch tool,
      // one call. Enforced here because descriptions alone don't hold small
      // models to completion.
      if (!importedAll && importedDocs.size > 0 && nudges < 2) {
        const tabular = documents.list(session.id).filter((d) => /\.(csv|tsv|txt|parquet)$/i.test(d.name));
        const remaining = tabular.filter((d) => !importedDocs.has(d.id)).map((d) => d.name);
        if (tabular.length > 1 && remaining.length > 0) {
          nudges++;
          session.record({ kind: "nudge", reason: "imports-incomplete", remaining });
          session.messages.push(new HumanMessage(
              `You loaded only ${tabular.length - remaining.length} of the ${tabular.length} attached data files and stopped. ` +
              `Finish the job NOW: call import_attachments with schema "${lastImportSchema ?? "the same schema"}" and files ${JSON.stringify(remaining)} to load the rest in one batch. ` +
              "Do not greet the user, do not ask what to do — load them, then report every table with its row count.",
          ));
          return new Command({ goto: "attempt" });
        }
      }

      return new Command({ goto: "finalize" });
    };

    // The model DID work but ended the turn mid-plan ("I'll now move on to
    // the next schema…" — then silence). Small models do this constantly.
    // Force the turn to actually finish: up to 2 resumptions.
    const nodeContinuation = async (): Promise<Command> => {
      continuations++;
      session.record({ kind: "nudge", reason: "stopped-mid-plan" });
      const gathered = board.digest();
      session.messages.push(new HumanMessage(
          "You announced a next step and then STOPPED without doing it — the request is NOT finished. Continue NOW with tool calls until it is fully answered. " +
          "For anything spanning many schemas/tables, use ONE set-based catalog query instead of looping (e.g. SELECT TABLE_SCHEMA, TABLE_NAME FROM SYS.EXA_ALL_TABLES ORDER BY 1, 2 covers every schema in one call). " +
          (gathered ? `Work ALREADY completed this turn (do not redo it):\n${gathered}\n` : "") +
          `Then give the COMPLETE answer to: "${userText.slice(0, 300)}".`,
      ));
      return new Command({ goto: "attempt" });
    };

    const nodeFinalize = async (s: TurnGraphState): Promise<Partial<TurnGraphState>> => {
      session.emit({
        type: "message-done",
        messageId: currentTextId ?? fallbackId,
        usage: s.usage,
      });
      // Verified researcher findings outlive the turn: tested SQL with a
      // stated purpose is exactly the kind of fact future sessions should know.
      if (settings.enableInsights && session.connectionId) {
        for (const f of board.allFindings().filter((x) => x.kind === "sql" && x.tested && x.purpose && x.sql).slice(0, 3)) {
          memory.remember("project", session.connectionId, `Verified SQL — ${f.purpose}: ${f.sql!.replace(/\s+/g, " ").slice(0, 220)}`);
        }
      }
      return {};
    };

    const route = (s: TurnGraphState): "recover" | "continuation" | "finalize" => {
      if (canRetry() && s.toolCalls === 0) return "recover";
      if (canRetry() && continuations < 2 && s.toolCalls > 0 && looksUnfinished(s.text)) return "continuation";
      return "finalize";
    };

    // LangGraph.js runs the turn: attempt → (recover | continuation | finalize).
    const graph = buildTurnGraph({
      attempt: nodeAttempt,
      recover: nodeRecover,
      continuation: nodeContinuation,
      finalize: nodeFinalize,
      route,
    });
    await graph.invoke({}, { recursionLimit: 64, signal: session.abort?.signal });
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
    session.clearCheckpoint(); // turn ended (ok, error, or abort) — history is persisted normally
    store.touch(session);
    // jcode-style ambient extraction: mine the conversation for durable facts
    // every few turns, in the BACKGROUND (never delays the answer). Small,
    // cheap, grounded — see memory-extract.ts.
    session.turnCount = (session.turnCount ?? 0) + 1;
    if (settings.enableInsights && session.turnCount % 4 === 0) {
      const snapshot = [...session.messages];
      const existing = memory.context(session.connectionId);
      void extractMemories({ model, messages: snapshot, memory, connectionId: session.connectionId, existing }).catch(() => 0);
    }
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

  // Macro-structure: hub tables (schema anchors) and subsystems (join-connected
  // areas) — gives the model the shape of the schema and cuts tokens by letting
  // it reason about whole areas instead of re-discovering them.
  const hubs = kb.hubs(conn, 6);
  const hubLine = hubs.length ? `\n\nCentral tables (most connected — schema anchors): ${hubs.map((h) => `${h.table} (${h.degree})`).join(", ")}` : "";
  const subs = kb.subsystems(conn).slice(0, 6);
  const subLine = subs.length
    ? `\n\nSubsystems (join-connected areas — kb_subsystem pulls one whole):\n${subs
        .map((s) => {
          const names = [...new Set(s.tables.map((t) => t.split(".").pop()))];
          return `  ${s.name.split(".").pop()}: ${names.slice(0, 10).join(", ")}${names.length > 10 ? ", …" : ""}`;
        })
        .join("\n")}`
    : "";

  let block = `\n\n<retrieved_context>\nRetrieved from the schema knowledge graph for THIS message. Use it to write correct SQL directly; you still verify with tools before acting on anything critical, and you never invent names not shown here.\n\nDatabase landscape:\n${landscape}${hubLine}${subLine}`;
  if (relevant) block += `\n\nMost relevant to this request:\n${relevant}`;
  block += `\n</retrieved_context>`;
  return block;
}

/**
 * Progressive tool disclosure. Small models tool-call far more reliably with a
 * short, relevant list than with the full ~26-tool set, so we keep a small
 * always-on core and add optional groups only when the message signals intent.
 * Unknown tools stay hidden — the model can still answer and ask.
 */
function selectTools(all: ToolSet, opts: { text: string; connected: boolean; hasDocuments: boolean }): ToolSet {
  const t = opts.text.toLowerCase();
  const keep = new Set<string>();
  const add = (...names: string[]) => names.forEach((n) => all[n] && keep.add(n));

  // Core — covers the great majority of data questions.
  add("kb_search", "run_sql", "list_schemas", "list_tables", "describe_table", "get_table_sample", "remember");
  // Not connected yet → give it the means to connect.
  if (!opts.connected) add("list_connections", "ui_connect");

  const want = (re: RegExp, ...names: string[]) => {
    if (re.test(t)) add(...names);
  };
  want(/perform|slow|profile|optimi|speed|faster|tune|bottleneck|explain plan/, "profile_query");
  want(/join|relation|related|connect|link|between|subsystem|\barea\b|star schema|foreign key|how do .* relate/, "kb_join_path", "kb_subsystem");
  want(/refresh|re-?crawl|reload|changed schema|new table|just created|after creating/, "kb_refresh");
  // Dashboards get the researcher too: panel discovery/SQL-testing fans out.
  want(/dashboard|chart|graph|visuali|plot|\bkpi\b|\bbi\b|metric card|report/, "dashboard_save", "dashboard_list", "dashboard_get", "spawn_researcher");
  want(/artifact|report|infographic|render|html page|write.?up/, "render_artifact");
  want(/connect|open (the|a|my|up)|click|go to|navigat|panel|marketplace|settings|switch to|show me the/, "ui_connect", "ui_open", "ui_editor_insert", "app_ui_locate");
  want(
    /everything|all (the )?tables|explore|overview|\bmap\b|understand the (db|database|schema)|whole (db|database|schema)|what.?s in|compare|versus|\bvs\b|across|breakdown|\btrends?\b|each of|both |multiple|analy|profile (these|the)|summar/,
    "spawn_researcher",
  );
  if (opts.hasDocuments) add("search_documents", "read_document", "import_csv");
  // Loading/ingest intent surfaces the importer even before the file lands.
  want(/\bimport\b|\bload\b|\bpump\b|ingest|upload|add (this|these|the).*(data|csv|file|table)|\bcsv\b|into a? ?(schema|table)/, "import_csv");
  // Semantic-view tools only exist in `all` when the layer is ready; when they
  // do, they're the source of truth for analytics, so always surface them.
  add("semantic_compile_request", "semantic_compile_sql");

  const out: ToolSet = {};
  for (const n of keep) out[n] = all[n];
  return out;
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

/**
 * Did the assistant produce a PLAN (or a fabricated command) rather than act?
 * Used to trigger a single corrective re-run when no tool was called. Kept
 * conservative: only fires on strong signals (invented mechanisms, or real SQL
 * paired with step-by-step "here's what we'll do" language) so genuine
 * tool-free answers (explanations, conceptual replies) are left alone.
 */
export function looksLikeUnacted(text: string): boolean {
  if (!text || text.length < 20) return false;
  // Hallucinated mechanisms — always a failure.
  if (/EXA_PUMP|EXA_ATTACHED_FILES|SYS\.EXA_ATTACHED/i.test(text)) return true;
  // Tool call emitted as TEXT instead of invoked (chat-template misfires on
  // small models): <tool_call> wrappers, or a JSON object naming our tools.
  if (/<tool_call>|<function_call>|<\|tool_call\|>|\[TOOL_(CALL|REQUEST)\]|"tool_calls?"\s*:/i.test(text)) return true;
  if (/\{\s*"(name|tool|function)"\s*:\s*"(run_sql|list_schemas|list_tables|describe_table|kb_search|kb_join_path|kb_subsystem|import_csv|get_table_sample|list_connections|search_documents|read_document|spawn_researcher|dashboard_\w+|render_artifact|profile_query|remember|load_skill|ui_\w+)"/.test(text))
    return true;
  const hasSql = /```sql|CREATE\s+(SCHEMA|TABLE)\b|INSERT\s+INTO\b|IMPORT\s+INTO\b|\bSELECT\b[\s\S]*\bFROM\b/i.test(text);
  const hasPlanLanguage =
    /\bstep\s*\d|we'?ll (use|run|load|create|check|verify)|let'?s (start|begin|check|create|load)|here'?s (the|my) (plan|sql)|first,? (let|we)|i(?:'|’)?(?:ll| will) (run|load|create|use|check|query|list|execute)|let me (check|run|verify|see|query|list|execute)/i.test(
      text,
    );
  return hasSql && hasPlanLanguage;
}

/**
 * Pull the first runnable READ-ONLY statement out of assistant text — the
 * "here's the SQL … let me check" stall. Prefers a fenced ```sql block; falls
 * back to a bare SELECT/WITH. Never returns DDL/DML (those need explicit user
 * intent, not a rescue).
 */
export function extractReadSql(text: string): string | null {
  const fence = /```(?:sql)?\s*([\s\S]*?)```/i.exec(text);
  const source = fence ? fence[1] : text;
  // Statement must START a line — "you can select a table from the tree" is
  // prose, not SQL. Ends at the first semicolon, blank line, or end-of-text.
  const m = /^[ \t]*(?:SELECT|WITH)\b[\s\S]*?(?=;|\n[ \t]*\n|$)/im.exec(source);
  if (!m) return null;
  const sql = m[0].trim();
  // A real query, not prose that happens to contain "select": SELECT needs a
  // FROM (Exasol scalar SELECTs without FROM are rare enough to skip).
  if (/^SELECT/i.test(sql) && !/\bFROM\b/i.test(sql)) return null;
  if (/\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|IMPORT|EXPORT)\b/i.test(sql)) return null;
  return sql.length >= 12 && sql.length <= 4000 ? sql : null;
}

/**
 * Did the turn end MID-PLAN — trailing text that promises a next action the
 * model never took? Checked only on the tail so mid-answer narration doesn't
 * trip it, and never when the model is asking the USER something.
 */
export function looksUnfinished(text: string): boolean {
  if (!text) return false;
  const tail = text.trim().slice(-220).toLowerCase();
  if (tail.endsWith("?")) return false; // it's asking the user — legitimate stop
  return /\b(i'?ll (now )?(move on|proceed|continue|check|list|query|run|do|start|call)|moving on to|next,? (i|let's|we)|let'?s (now )?(move|continue|proceed|check|list|query)|i will (now |then )?(proceed|continue|check|list|query|run)|now (i|let'?s) (will |can )?(check|list|query|proceed|move))\b[^?]*$/.test(
    tail,
  );
}

/** Tiny, model-free summary of a tool result for the UI chip. */
function summarize(output: unknown): string {
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    if (o.denied) return "denied by user";
    if (typeof o.report === "string") return `reported ${o.report.length > 120 ? "findings" : o.report.split("\n")[0].slice(0, 60)}`;
    if (typeof o.rowsInserted === "number") return `loaded ${o.rowsInserted} rows`;
    if (typeof o.affectedRows === "number") return `${o.affectedRows} rows affected`;
    if (typeof o.rowCount === "number") return `${o.rowCount} rows`;
    if (o.columns && Array.isArray(o.columns)) return `${(o.columns as unknown[]).length} columns`;
    if (o.error) return String(o.error);
  }
  return "done";
}
