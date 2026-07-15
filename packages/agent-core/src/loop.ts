import { stepCountIs, streamText, type ModelMessage } from "ai";
import type { ProviderRegistry } from "./providers.ts";
import type { Session } from "./session.ts";
import type { DbRegistry } from "./db.ts";
import { buildTools } from "./tools.ts";
import { log } from "./log.ts";

const MAX_STEPS = 12;

const SYSTEM_PROMPT = `You are the Exasol Studio agent — an expert in the Exasol analytics database, embedded in a desktop SQL workbench.

You have tools to inspect and query the user's connected database. Use them instead of guessing:
- NEVER invent schema, table, or column names. Discover them with list_schemas / list_tables / describe_table first.
- Answer data questions by running SQL with run_sql, then summarize the result.
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
  modelRef: string;
  userText: string;
  /** Extra context from the app (current schema, editor SQL, selection). */
  context?: string;
}): Promise<void> {
  const { session, registry, db, modelRef, userText, context } = opts;
  if (session.running) throw new Error("Session is already generating");

  const model = registry.resolve(modelRef);
  const content = context ? `<context>\n${context}\n</context>\n\n${userText}` : userText;
  session.messages.push({ role: "user", content });
  session.record({ kind: "user", model: modelRef, text: userText, context: context ?? null, connection: session.connectionId });

  session.running = true;
  session.abort = new AbortController();
  session.emit({ type: "status", state: "thinking" });

  const tools = buildTools({ db, session, connectionId: session.connectionId });
  const started = Date.now();
  const fallbackId = crypto.randomUUID();
  let sawText = false;
  let currentTextId: string | null = null;

  try {
    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages: session.messages as ModelMessage[],
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      abortSignal: session.abort.signal,
    });

    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-start": {
          currentTextId = part.id || fallbackId;
          session.emit({ type: "message-start", messageId: currentTextId, role: "assistant" });
          break;
        }
        case "text-delta": {
          if (!sawText) {
            session.emit({ type: "status", state: "streaming" });
            sawText = true;
          }
          const id = part.id || currentTextId || fallbackId;
          session.emit({ type: "text-delta", messageId: id, delta: part.text });
          break;
        }
        case "reasoning-delta": {
          session.emit({ type: "reasoning-delta", messageId: part.id || fallbackId, delta: part.text });
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
    session.emit({ type: "status", state: "idle" });
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
