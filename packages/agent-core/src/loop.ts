import { stepCountIs, streamText, type ModelMessage } from "ai";
import type { ProviderRegistry } from "./providers.ts";
import type { Session, SessionStore } from "./session.ts";
import type { DbRegistry } from "./db.ts";
import type { InsightStore } from "./insights.ts";
import type { KnowledgeGraph } from "./kb.ts";
import { buildTools } from "./tools.ts";
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

Working method:
- START data questions with kb_search — it returns the relevant tables, columns, and join conditions from the schema knowledge graph in one call.
- Answer data questions by running SQL with run_sql, then summarize the actual result.
- For broad exploration (many schemas/tables), fan out with spawn_researcher — issue several calls in one turn; they run in parallel and report back.
- When you verify a durable fact (a join key, what a table means, a business definition), save it with remember_insight so future sessions know it.
- For performance questions use profile_query (Exasol has no EXPLAIN — profiling is the mechanism).
- Statements that modify data or structure require the user's approval; use them only when the user asked for a change, and never retry a denied statement.

Exasol SQL dialect:
- Use LIMIT n (never FETCH FIRST or TOP). QUALIFY filters window functions. IDENTITY columns exist.
- Unquoted identifiers fold to UPPERCASE; double-quote mixed-case or reserved identifiers.
- System metadata lives in SYS (EXA_ALL_*), statistics in EXA_STATISTICS.

Be concise and direct. Prefer runnable SQL in \`\`\`sql blocks. Small result tables may be shown as markdown tables.`;

/** One user turn: multi-step agent loop with tool execution. */
export async function runTurn(opts: {
  session: Session;
  registry: ProviderRegistry;
  db: DbRegistry;
  insights: InsightStore;
  kb: KnowledgeGraph;
  store: SessionStore;
  modelRef: string;
  userText: string;
  /** Extra context from the app (current schema, editor SQL, selection). */
  context?: string;
}): Promise<void> {
  const { session, registry, db, insights, kb, store, modelRef, userText, context } = opts;
  if (session.running) throw new Error("Session is already generating");

  const model = registry.resolve(modelRef);
  const content = context ? `<context>\n${context}\n</context>\n\n${userText}` : userText;
  session.autoTitle(userText);
  session.messages.push({ role: "user", content });
  session.record({ kind: "user", model: modelRef, text: userText, context: context ?? null, connection: session.connectionId });

  // Cross-session knowledge, verified facts saved by earlier sessions.
  const known = insights.recent(session.connectionId);
  const system = known.length
    ? `${SYSTEM_PROMPT}\n\nVerified workspace knowledge from earlier sessions (still confirm anything critical):\n${known.map((k) => `- ${k}`).join("\n")}`
    : SYSTEM_PROMPT;

  session.running = true;
  session.abort = new AbortController();
  session.emit({ type: "status", state: "thinking" });

  // Fold older turns into a summary if we're nearing the context window.
  await maybeCompact({
    session,
    model,
    contextLimit: registry.contextFor(modelRef),
    system,
  });

  const tools = buildTools({ db, session, connectionId: session.connectionId, insights, kb, model });
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
      stopWhen: stepCountIs(MAX_STEPS),
      temperature: 0.2,
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
