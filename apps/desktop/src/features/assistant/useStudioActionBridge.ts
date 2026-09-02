import { useEffect } from "react";
import { agent } from "@/lib/agent-client";
import { executeStudioAction } from "./studio-actions";
import { isTauri } from "@/lib/ipc";

/**
 * The webview side of the app-control bridge: long-polls the sidecar for the
 * next action the agent requested, runs it against the app (studio-actions),
 * and posts the result back. One instance, mounted once. Fully defensive — a
 * failed poll just retries; the agent's tool call times out server-side if no
 * window ever answers, so nothing hangs the chat.
 */
export function useStudioActionBridge(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !isTauri()) return;
    let stopped = false;
    const loop = async () => {
      while (!stopped) {
        let next: { id?: string; action?: string; args?: unknown } | null = null;
        try {
          next = await agent.actionNext();
        } catch {
          // Sidecar restarting / transient — back off, then retry.
          await sleep(2000);
          continue;
        }
        if (stopped) break;
        if (!next || !next.id || !next.action) continue; // 204 / idle tick
        const result = await executeStudioAction(next.action, next.args).catch((e) => ({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        }));
        try {
          await agent.actionResult(next.id, result);
        } catch {
          /* result POST failed — the server-side call will time out cleanly */
        }
      }
    };
    void loop();
    return () => {
      stopped = true;
    };
  }, [enabled]);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
