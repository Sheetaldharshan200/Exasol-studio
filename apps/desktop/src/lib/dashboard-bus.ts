// Signal to open a specific dashboard (fired when the agent saves one).
// Latches the last request so a view that mounts slightly later still gets
// it — no race between opening the Dashboards tab and it subscribing.
type Listener = (id: string) => void;
const listeners = new Set<Listener>();
let pending: string | null = null;

export const dashboardBus = {
  open(id: string) {
    pending = id;
    for (const fn of listeners) fn(id);
  },
  /** Subscribe; immediately receive any pending request, then clear it. */
  on(fn: Listener): () => void {
    listeners.add(fn);
    if (pending) {
      const id = pending;
      pending = null;
      queueMicrotask(() => fn(id));
    }
    return () => listeners.delete(fn);
  },
};
