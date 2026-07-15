// Tiny command bus so exactly ONE pet exists on screen: the docked companion
// is the same creature that travels to perform UI actions.

export type PetCommand =
  | { type: "travel"; x: number; y: number }
  | { type: "work" }
  | { type: "celebrate"; ok: boolean }
  | { type: "home" };

type Listener = (cmd: PetCommand) => void;

const listeners = new Set<Listener>();

export const petBus = {
  on(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  emit(cmd: PetCommand) {
    for (const fn of listeners) fn(cmd);
  },
};
