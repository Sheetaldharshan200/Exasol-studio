// Where the canvas was before it zoomed somewhere.
//
// Tapping a schema or a table frames it. Tapping the empty canvas afterwards
// should put the view back exactly where it was, not fit the whole diagram —
// you were looking at something, you went to look at one part of it, and now
// you want to be back. The rules are small but easy to get wrong, so they
// live here where they can be tested.

export type ViewportMemory<T> = {
  /** Remember where we were. The FIRST such call wins: zooming from one
   *  schema straight into another must still come back to where the user
   *  actually started, not to the schema in between. */
  remember(view: T): void;
  /** Take what was remembered, if anything, and forget it. */
  take(): T | null;
  /** Nothing to come back to — the diagram changed under us. */
  clear(): void;
  has(): boolean;
};

/**
 * Does this viewport change mean the user has moved on?
 *
 * React Flow reports a move with the event that caused it, and with `null`
 * when the move was programmatic. A move the user made themselves replaces
 * where they came from — going "back" after they have driven somewhere else
 * would send them to a place they left deliberately — while our own framing
 * animations must not disturb it.
 */
export const isUserMove = (event: unknown): boolean => event != null;

export function createViewportMemory<T>(): ViewportMemory<T> {
  let saved: T | null = null;
  return {
    remember(view) {
      if (saved === null) saved = view;
    },
    take() {
      const view = saved;
      saved = null;
      return view;
    },
    clear() {
      saved = null;
    },
    has: () => saved !== null,
  };
}
