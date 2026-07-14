import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Tiny structured logger: JSON lines to <dataDir>/logs/agent-YYYY-MM-DD.log
// plus human-readable mirror on stderr. Zero deps by design.

let logDir = "";

export function initLog(dataDir: string) {
  logDir = join(dataDir, "logs");
  mkdirSync(logDir, { recursive: true });
}

function write(level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), level, msg, ...extra };
  process.stderr.write(`[agent] ${level} ${msg}${extra ? " " + JSON.stringify(extra) : ""}\n`);
  if (logDir) {
    const day = entry.ts.slice(0, 10);
    try {
      appendFileSync(join(logDir, `agent-${day}.log`), JSON.stringify(entry) + "\n");
    } catch {
      // Logging must never crash the agent.
    }
  }
}

export const log = {
  info: (msg: string, extra?: Record<string, unknown>) => write("info", msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => write("warn", msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => write("error", msg, extra),
};
