/**
 * How to launch the exa engine binary as a local server (exa-agent-v2,
 * task 1.2). Pure command/arg/env construction so it is unit-tested; the actual
 * child_process spawn is thin I/O in supervisor.ts. The exact `serve` flag
 * spelling is the one bit pending verification against the pinned release —
 * kept here in ONE place so a correction is a one-line change.
 */

export type SpawnPlan = {
  command: string;
  args: string[];
  /** Extra env merged over process.env — isolates config to Studio's dir. */
  env: Record<string, string>;
};

export type SpawnInput = {
  /** Absolute path to the resolved opencode binary. */
  binary: string;
  /** localhost port the server should bind. */
  port: number;
  /** Studio-owned config/data directory (never the user's ~/.config/opencode). */
  configDir: string;
};

/**
 * Build the spawn plan for `opencode serve` bound to localhost on `port`,
 * with the config directory pinned to Studio's isolated dir via env so no
 * user-level opencode config leaks in.
 */
export function serveSpawnPlan(input: SpawnInput): SpawnPlan {
  return {
    command: input.binary,
    args: ["serve", "--hostname", "127.0.0.1", "--port", String(input.port)],
    env: {
      // The engine reads XDG_* / its data dir from the environment; pin both so
      // sessions/config live under Studio's dir, shared with the exa CLI.
      EXA_CONFIG_DIR: input.configDir,
      XDG_DATA_HOME: input.configDir,
      XDG_CONFIG_HOME: input.configDir,
    },
  };
}

/** The base URL the SDK client connects to for a served port. */
export function baseUrlFor(port: number): string {
  return `http://127.0.0.1:${port}`;
}
