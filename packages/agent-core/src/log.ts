import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Tiny structured logger: JSON lines to <dataDir>/logs/agent-YYYY-MM-DD.log
// plus human-readable mirror on stderr. Zero deps by design.

let logDir = "";
// stderr mirror threshold — the interactive CLI raises it to "warn" so info
// lines never interleave with the conversation (file logging is unaffected).
let mirrorMin: "info" | "warn" = "info";

export function initLog(dataDir: string, opts?: { stderrMin?: "info" | "warn" }) {
  logDir = join(dataDir, "logs");
  mkdirSync(logDir, { recursive: true });
  if (opts?.stderrMin) mirrorMin = opts.stderrMin;
}

function write(level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), level, msg, ...extra };
  if (level !== "info" || mirrorMin === "info") {
    process.stderr.write(`[agent] ${level} ${msg}${extra ? " " + JSON.stringify(extra) : ""}\n`);
  }
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
