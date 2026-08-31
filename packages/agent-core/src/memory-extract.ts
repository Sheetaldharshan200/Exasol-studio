import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import type { MemoryStore } from "./memory.ts";
import { log } from "./log.ts";

// Automatic memory extraction (jcode's memory side-agent), tuned for SMALL
// local models: ONE cheap call, a dead-simple line format (small models handle
// bullet lines far better than nested JSON), temperature 0, and a strict
// grounding filter so weak models can't pollute memory with guesses. Runs in
// the background after a turn — never blocks the user's answer.

const EXTRACT_SYSTEM = `You extract durable memory from a database assistant conversation.
Output ONLY facts worth remembering long-term about the USER or their DATABASE:
- stable preferences ("prefers revenue = extendedprice*(1-discount)")
- verified schema facts ("ORDERS joins CUSTOMER on O_CUSTKEY")
- naming/conventions the user stated.
Rules: one fact per line starting with "- ". Max 5 lines. Each under 20 words.
Only facts EXPLICITLY stated by the user or confirmed by a tool result in the
transcript — never guesses, questions, or restatements of what's already known.
If there is nothing new worth keeping, output exactly: NONE`;

/** Turn a few recent messages into a compact transcript for extraction. */
function transcript(messages: BaseMessage[], maxChars = 4000): string {
  const lines: string[] = [];
  for (const m of messages.slice(-12)) {
    const role = m.getType() === "human" ? "user" : m.getType() === "ai" ? "assistant" : m.getType();
    const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    if (text.trim()) lines.push(`${role}: ${text.replace(/\s+/g, " ").slice(0, 500)}`);
  }
  return lines.join("\n").slice(-maxChars);
}

function looksLikeFact(line: string): boolean {
  const t = line.trim();
  if (t.length < 6 || t.length > 160) return false;
  if (t.endsWith("?")) return false; // questions aren't memories
  if (/^(none|n\/a|nothing|i |let me|sure|okay|here)/i.test(t)) return false;
  return true;
}

export async function extractMemories(opts: {
  model: { invoke: (m: BaseMessage[]) => Promise<{ content: unknown }> };
  messages: BaseMessage[];
  memory: MemoryStore;
  connectionId: string | null;
  existing: string;
}): Promise<number> {
  const { model, messages, memory, connectionId, existing } = opts;
  try {
    const res = await model.invoke([
      new SystemMessage(EXTRACT_SYSTEM),
      new HumanMessage(
        `Already known (do NOT repeat):\n${existing || "(nothing yet)"}\n\nConversation:\n${transcript(messages)}`,
      ),
    ]);
    const text = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
    if (/^\s*none\s*$/i.test(text.trim())) return 0;
    const facts = text
      .split("\n")
      .map((l) => l.replace(/^[-*\d.\s]+/, "").trim())
      .filter(looksLikeFact)
      .slice(0, 5);
    for (const f of facts) memory.remember("project", connectionId, f);
    if (facts.length) {
      await memory.consolidate(connectionId).catch(() => 0);
      log.info("memory extracted", { count: facts.length, conn: connectionId });
    }
    return facts.length;
  } catch (e) {
    log.warn("memory extraction failed", { error: String(e) });
    return 0;
  }
}
