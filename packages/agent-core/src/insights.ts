import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Shared workspace knowledge: short, verified facts the agent records while
 * working (join keys, table meanings, business definitions). Injected into
 * every session's system prompt so knowledge carries across sessions.
 */
export class InsightStore {
  private readonly file: string;

  constructor(dataDir: string) {
    this.file = join(dataDir, "insights.jsonl");
  }

  add(connectionId: string | null, text: string) {
    const t = text.replace(/\s+/g, " ").trim().slice(0, 300);
    if (!t) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      appendFileSync(
        this.file,
        JSON.stringify({ ts: new Date().toISOString(), connection: connectionId, text: t }) + "\n",
      );
    } catch {
      // best-effort
    }
  }

  /** Most recent insights for this connection (plus global ones). */
  recent(connectionId: string | null, limit = 12): string[] {
    let raw = "";
    try {
      raw = readFileSync(this.file, "utf8");
    } catch {
      return [];
    }
    const out: string[] = [];
    const lines = raw.split("\n");
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const e = JSON.parse(line) as { connection?: string | null; text?: string };
        if (e.text && (!e.connection || e.connection === connectionId)) out.push(e.text);
      } catch {
        // skip
      }
    }
    return out.reverse();
  }
}
