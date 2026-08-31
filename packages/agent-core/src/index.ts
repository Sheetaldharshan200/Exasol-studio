import { ConfigStore, defaultDataDir } from "./config.ts";
import { initLog, log } from "./log.ts";
import { startServer } from "./server.ts";

// Entry point. Spawned by the desktop app (or run standalone for the CLI).
//
//   node dist/agent-core.cjs [--data-dir <path>]
//
// Prints exactly one "ready" JSON line on stdout so the parent can connect:
//   {"event":"ready","port":12345,"token":"…"}
//
// Exits when stdin closes (parent process died) — no orphaned sidecars.

async function main() {
  const args = process.argv.slice(2);
  const dataDirIdx = args.indexOf("--data-dir");
  const dataDir = dataDirIdx >= 0 && args[dataDirIdx + 1] ? args[dataDirIdx + 1] : defaultDataDir();

  const config = new ConfigStore(dataDir);
  initLog(dataDir);

  const { port, token } = await startServer(config);
  log.info("agent-core listening", { port, dataDir });
  process.stdout.write(JSON.stringify({ event: "ready", port, token }) + "\n");

  // Parent-death watchdog: when the spawning process exits, stdin closes.
  process.stdin.resume();
  process.stdin.on("end", () => {
    log.info("stdin closed — shutting down");
    process.exit(0);
  });
  process.stdin.on("error", () => process.exit(0));
}

main().catch((e) => {
  process.stderr.write(`[agent] fatal: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
