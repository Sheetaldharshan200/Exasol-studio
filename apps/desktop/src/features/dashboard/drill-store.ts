// Per-widget drill state (transient, like cross-filters): which level a drillable
// chart is at, and the path taken to get there. Cleared when a dashboard opens.

import { useEffect, useReducer } from "react";
import type { DrillState } from "./drill-sql";
export type { DrillState } from "./drill-sql";

let states: Record<string, DrillState> = {};
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

export const getDrill = (id: string): DrillState => states[id] ?? { level: 0, path: [] };

/** Drill one level deeper on the clicked value. */
export function drillDown(id: string, col: string, value: string): void {
  const s = getDrill(id);
  states = { ...states, [id]: { level: s.level + 1, path: [...s.path, { col, value }] } };
  notify();
}

/** Jump back to a level (0 = the top). */
export function drillTo(id: string, level: number): void {
  const s = getDrill(id);
  if (level >= s.level) return;
  states = { ...states, [id]: { level, path: s.path.slice(0, level) } };
  notify();
}

export function resetDrills(): void {
  if (Object.keys(states).length) {
    states = {};
    notify();
  }
}

export function useDrill(id: string): DrillState {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    subs.add(force);
    return () => {
      subs.delete(force);
    };
  }, []);
  return getDrill(id);
}
