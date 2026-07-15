// Signal to open a specific dashboard (fired when the agent saves one).
type Listener = (id: string) => void;
const listeners = new Set<Listener>();
export const dashboardBus = {
  open(id: string) {
    for (const fn of listeners) fn(id);
  },
  on(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
