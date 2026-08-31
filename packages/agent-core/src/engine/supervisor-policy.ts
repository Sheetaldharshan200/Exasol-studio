/**
 * Pure supervision policy for the Exa engine sidecar (exa-agent-v2, task 1.2).
 *
 * The runtime supervisor (spawn/kill/health-poll) is I/O and lives beside this;
 * every DECISION it makes — which port to try, whether to restart, how long to
 * wait, when to give up — is factored out here so it can be unit-tested without
 * spawning a process. Mirrors the pattern of loop.ts's tested helpers.
 */

export type EngineState = "stopped" | "starting" | "running" | "backoff" | "failed";

export type SupervisorConfig = {
  /** Ports to try in order (first free one wins). */
  portCandidates: number[];
  /** Restart attempts before declaring `failed`. */
  maxRestarts: number;
  /** Backoff schedule in ms, indexed by restart attempt; last value repeats. */
  backoffMs: number[];
};

export const DEFAULT_SUPERVISOR: SupervisorConfig = {
  // 4123..4127 — localhost-only, away from common dev ports.
  portCandidates: [4123, 4124, 4125, 4126, 4127],
  maxRestarts: 5,
  backoffMs: [500, 1000, 2000, 5000, 10000],
};

/** First candidate port not in `taken`; null when all are occupied. */
export function pickPort(cfg: SupervisorConfig, taken: readonly number[]): number | null {
  const used = new Set(taken);
  for (const p of cfg.portCandidates) if (!used.has(p)) return p;
  return null;
}

/** Backoff delay for a given restart attempt (0-based), clamped to the tail. */
export function backoffFor(cfg: SupervisorConfig, attempt: number): number {
  if (cfg.backoffMs.length === 0) return 0;
  const i = Math.min(Math.max(0, attempt), cfg.backoffMs.length - 1);
  return cfg.backoffMs[i];
}

export type Transition = {
  state: EngineState;
  /** ms to wait before the supervisor's next action (restart), when relevant. */
  waitMs?: number;
  /** Human-readable reason, surfaced to the user on failed/backoff. */
  reason?: string;
};

/**
 * The next state after an event, given how many restarts have already happened.
 * Deterministic and side-effect-free — the supervisor performs the I/O the
 * transition implies (spawn, sleep waitMs, emit reason).
 */
export function nextState(
  cfg: SupervisorConfig,
  current: EngineState,
  event: "start" | "ready" | "crash" | "stop",
  restarts: number,
): Transition {
  switch (event) {
    case "start":
      return { state: "starting" };
    case "ready":
      return { state: "running" };
    case "stop":
      return { state: "stopped" };
    case "crash": {
      // A clean user stop is handled by "stop"; a crash counts against the
      // budget. Exhausting it is terminal until the user retries.
      if (restarts >= cfg.maxRestarts) {
        return {
          state: "failed",
          reason: `Engine crashed and did not recover after ${cfg.maxRestarts} restart attempts.`,
        };
      }
      return {
        state: "backoff",
        waitMs: backoffFor(cfg, restarts),
        reason: `Engine crashed; restarting (attempt ${restarts + 1} of ${cfg.maxRestarts}).`,
      };
    }
  }
}

/** Terminal states never transition on their own — the user must re-`start`. */
export function isTerminal(state: EngineState): boolean {
  return state === "failed" || state === "stopped";
}
