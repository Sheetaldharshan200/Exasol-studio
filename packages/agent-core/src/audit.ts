import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Append-only audit stream (JSONL): every connector lifecycle change,
 * external tool call (with the user's allow/deny), export, and deletion.
 * The transcript is per-conversation; this is the machine-wide account of
 * what touched the outside world.
 */
export class Audit {
  private file: string;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, "audit.jsonl");
  }

  log(event: Record<string, unknown>): void {
    try {
      appendFileSync(this.file, JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n");
    } catch {
      /* auditing must never break the operation itself */
    }
  }

  tail(limit = 100): Record<string, unknown>[] {
    try {
      const lines = readFileSync(this.file, "utf8").split("\n").filter(Boolean);
      return lines.slice(-limit).map((l) => {
        try {
          return JSON.parse(l) as Record<string, unknown>;
        } catch {
          return { raw: l };
        }
      });
    } catch {
      return [];
    }
  }
}
