import { streamText, type ModelMessage } from "ai";
import type { ProviderRegistry } from "./providers.ts";
import type { Session } from "./session.ts";
import { log } from "./log.ts";

const SYSTEM_PROMPT = `You are the Exasol Studio assistant — an expert in the Exasol analytics database and SQL.

Rules:
- Exasol SQL dialect: use LIMIT n (never FETCH FIRST or TOP), QUALIFY for window filters, IDENTITY columns, DISTRIBUTE BY / PARTITION BY for table design.
- Unquoted identifiers fold to UPPERCASE; double-quote mixed-case or reserved identifiers.
- Exasol has no EXPLAIN — query analysis is done via profiling (EXA_USER_PROFILE_LAST_DAY).
- Be concise and direct. Prefer runnable SQL in \`\`\`sql blocks. Never invent table or column names — if schema context was not provided, say what you need.`;

/** Phase 1 loop: single streaming turn (tools arrive in Phase 2). */
export async function runTurn(opts: {
  session: Session;
  registry: ProviderRegistry;
  modelRef: string;
  userText: string;
  /** Extra context from the app (current schema, editor SQL, selection). */
  context?: string;
}): Promise<void> {
  const { session, registry, modelRef, userText, context } = opts;
  if (session.running) throw new Error("Session is already generating");

  const model = registry.resolve(modelRef);
  const content = context ? `<context>\n${context}\n</context>\n\n${userText}` : userText;
  session.messages.push({ role: "user", content });
  session.record({ kind: "user", model: modelRef, text: userText, context: context ?? null });

  const messageId = crypto.randomUUID();
  session.running = true;
  session.abort = new AbortController();
  session.emit({ type: "status", state: "thinking" });
  session.emit({ type: "message-start", messageId, role: "assistant" });

  const started = Date.now();
  let text = "";
  try {
    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages: session.messages as ModelMessage[],
      abortSignal: session.abort.signal,
    });

    let firstDelta = true;
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        if (firstDelta) {
          session.emit({ type: "status", state: "streaming" });
          firstDelta = false;
        }
        text += part.text;
        session.emit({ type: "text-delta", messageId, delta: part.text });
      } else if (part.type === "reasoning-delta") {
        session.emit({ type: "reasoning-delta", messageId, delta: part.text });
      } else if (part.type === "error") {
        throw part.error instanceof Error ? part.error : new Error(String(part.error));
      }
    }

    const usage = await result.usage.catch(() => undefined);
    session.messages.push({ role: "assistant", content: text });
    session.record({
      kind: "assistant",
      model: modelRef,
      text,
      usage: usage ?? null,
      durationMs: Date.now() - started,
    });
    session.emit({
      type: "message-done",
      messageId,
      usage: usage ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } : undefined,
    });
  } catch (e) {
    const aborted = session.abort?.signal.aborted;
    const message = aborted ? "Stopped." : e instanceof Error ? e.message : String(e);
    // Keep whatever partial text we got so the conversation stays coherent.
    if (text) session.messages.push({ role: "assistant", content: text });
    session.record({ kind: aborted ? "aborted" : "error", model: modelRef, error: message, partial: text.length });
    if (!aborted) log.error("turn failed", { model: modelRef, error: message });
    session.emit(aborted ? { type: "message-done", messageId } : { type: "error", message });
  } finally {
    session.running = false;
    session.abort = null;
    session.emit({ type: "status", state: "idle" });
  }
}
