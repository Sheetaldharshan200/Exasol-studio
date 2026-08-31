// Shared active-session channel: the AI panel and the pet(s) are different
// views of the SAME agent session. Whoever creates/switches a session
// publishes it here; every other view follows.

type Listener = (sessionId: string | null) => void;

let current: string | null = null;
const listeners = new Set<Listener>();

export const sessionBus = {
  get(): string | null {
    return current;
  },
  set(sessionId: string | null) {
    if (sessionId === current) return;
    current = sessionId;
    for (const fn of listeners) fn(sessionId);
  },
  on(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
