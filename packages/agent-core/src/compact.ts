import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { contentText, generateText } from "./llm.ts";
import type { Session } from "./session.ts";
import { log } from "./log.ts";

// Auto-compaction: when a session's conversation approaches the model's
// context window, older turns are replaced by an LLM-written summary and the
// conversation continues seamlessly — the session never hits the wall.

/** Rough token estimate: ~4 chars/token holds well enough for budgeting. */
export function estimateTokens(messages: BaseMessage[], system = ""): number {
  let chars = system.length;
  for (const m of messages) {
    if (typeof m.content === "string") {
      chars += m.content.length;
    } else if (Array.isArray(m.content)) {
      for (const part of m.content) {
        chars += JSON.stringify(part).length;
      }
    }
    chars += 20; // role/framing overhead
  }
  return Math.ceil(chars / 4);
}

/** Compact when the next turn would push past this share of the window. */
const THRESHOLD = 0.7;
/** Keep this many of the most recent messages verbatim. */
const KEEP_RECENT = 6;

const SUMMARY_PROMPT = `Summarize this database-assistant conversation for context continuity. Structure it as:

1. Goal — what the user is working on overall.
2. Verified facts — schemas, tables, columns, join keys, row counts CONFIRMED by tool results (be precise; these must survive).
3. Work done — queries run, changes made (with approval outcomes), dashboards or artifacts produced.
4. Open threads — what was in progress or promised next.

Be dense and factual. Do not invent anything not in the transcript.`;

export async function maybeCompact(opts: {
  session: Session;
  model: BaseChatModel;
  contextLimit: number;
  system: string;
}): Promise<boolean> {
  const { session, model, contextLimit, system } = opts;
  const used = estimateTokens(session.messages, system);
  const limit = Number(process.env.AGENT_CONTEXT_LIMIT ?? contextLimit);
  if (used < limit * THRESHOLD) return false;
  if (session.messages.length <= KEEP_RECENT + 2) return false; // nothing to fold

  const cut = session.messages.length - KEEP_RECENT;
  const older = session.messages.slice(0, cut);
  const recent = session.messages.slice(cut);

  try {
    const transcript = older
      .map((m) => `${m._getType()}: ${contentText(m.content) || "[tool activity]"}`)
      .join("\n")
      // The summary call itself must fit — hard-cap the transcript.
      .slice(-Math.max(8_000, limit * 2));

    const res = await generateText({
      model,
      system: SUMMARY_PROMPT,
      prompt: transcript,
      abortSignal: session.abort?.signal,
    });

    const summary = res.text.trim();
    if (!summary) return false;

    session.messages = [
      new HumanMessage(`<conversation-summary>\nEarlier parts of this conversation were compacted. Summary:\n\n${summary}\n</conversation-summary>`),
      new AIMessage("Understood — continuing from the summary."),
      ...recent,
    ];
    session.record({ kind: "compacted", foldedMessages: older.length, summaryChars: summary.length, estTokensBefore: used });
    session.emit({ type: "compacted", folded: older.length });
    log.info("session compacted", { session: session.id, folded: older.length, before: used });
    return true;
  } catch (e) {
    // Compaction is best-effort; a failed summary must never block the turn.
    log.warn("compaction failed", { error: String(e) });
    return false;
  }
}
