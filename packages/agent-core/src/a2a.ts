import { randomUUID } from "node:crypto";

/**
 * A2A-style task orchestration (modeled on Google's Agent2Agent protocol):
 * every unit of work is a Task with an observable lifecycle
 * (submitted → working → completed | failed), pollable by id while a drain
 * loop runs the swarm to completion. The orchestrator WAITS for every task to
 * reach a terminal state — no more "did one file and stopped".
 */

export type A2ATaskState = "submitted" | "working" | "completed" | "failed";

export type A2ATask = {
  id: string;
  title: string;
  state: A2ATaskState;
  /** Latest progress line from the worker (A2A status message). */
  status?: string;
  result?: unknown;
  error?: string;
  startedAt: number;
  updatedAt: number;
};

type Worker = (report: (status: string) => void) => Promise<unknown>;

export class TaskManager {
  private tasks = new Map<string, A2ATask>();
  private workers = new Map<string, Worker>();

  /** tasks/send — submit a unit of work. */
  submit(title: string, worker: Worker): string {
    const id = randomUUID().slice(0, 8);
    const now = Date.now();
    this.tasks.set(id, { id, title, state: "submitted", startedAt: now, updatedAt: now });
    this.workers.set(id, worker);
    return id;
  }

  /** tasks/get — poll one task. */
  get(id: string): A2ATask | undefined {
    return this.tasks.get(id);
  }

  list(): A2ATask[] {
    return [...this.tasks.values()];
  }

  private patch(id: string, changes: Partial<A2ATask>): void {
    const t = this.tasks.get(id);
    if (t) Object.assign(t, changes, { updatedAt: Date.now() });
  }

  /**
   * Run every submitted task to a terminal state with bounded concurrency,
   * invoking `onUpdate` on every state change so the caller can stream
   * progress to the UI. Resolves only when ALL tasks are terminal.
   */
  async drain(concurrency: number, onUpdate: (task: A2ATask) => void): Promise<A2ATask[]> {
    const pending = [...this.tasks.keys()];
    const runOne = async (id: string): Promise<void> => {
      const worker = this.workers.get(id)!;
      this.patch(id, { state: "working" });
      onUpdate(this.get(id)!);
      try {
        const result = await worker((status) => {
          this.patch(id, { status });
          onUpdate(this.get(id)!);
        });
        this.patch(id, { state: "completed", result });
      } catch (e) {
        this.patch(id, { state: "failed", error: e instanceof Error ? e.message : String(e) });
      }
      onUpdate(this.get(id)!);
    };
    const lanes = Array.from({ length: Math.max(1, concurrency) }, async () => {
      while (pending.length) {
        const id = pending.shift();
        if (id) await runOne(id);
      }
    });
    await Promise.all(lanes);
    return this.list();
  }
}
