// One job at a time, per key.
//
// A database session here is a single websocket: two statements in flight on
// it hang or kill the driver. Everything that executes goes through a queue
// keyed by connection, so statements on one connection are serialized while
// different connections still run in parallel.

export type SerialQueue = {
  /** Run `job` after everything already queued for `key` has settled. */
  run<T>(key: string, job: () => Promise<T>): Promise<T>;
  /** Keys with work still queued — for tests and diagnostics. */
  pending(): string[];
};

export function createSerialQueue(): SerialQueue {
  const tails = new Map<string, Promise<unknown>>();
  return {
    run<T>(key: string, job: () => Promise<T>): Promise<T> {
      const prev = tails.get(key) ?? Promise.resolve();
      // Both arms run the job: one job's failure must not cancel the next.
      const result = prev.then(job, job);
      const tail = result.then(
        () => undefined,
        () => undefined,
      );
      tails.set(key, tail);
      // Drop the tail once it settles, unless someone has queued behind it —
      // otherwise the map keeps a finished promise per connection forever.
      void tail.then(() => {
        if (tails.get(key) === tail) tails.delete(key);
      });
      return result;
    },
    pending: () => [...tails.keys()],
  };
}
