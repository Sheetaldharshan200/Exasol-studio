// Transient cross-filter state — the "click a bar to filter the whole dashboard"
// interaction. Clicking a chart records {category column → clicked value}; every
// OTHER widget's query is wrapped to that filter (see useWidgetData). It is NOT
// persisted (cross-filtering is a live exploration, not part of the saved doc)
// and is cleared when a dashboard opens.

import { useEffect, useReducer } from "react";
import { applyCrossFilters, type CrossFilter, type CrossFilters } from "./cross-filter-sql";

export { applyCrossFilters };
export type { CrossFilter, CrossFilters };

let filters: CrossFilters = {};
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

export const getCrossFilters = (): CrossFilters => filters;

/** Set (or replace) the filter on a column. Clicking the same value clears it. */
export function setCrossFilter(column: string, value: string, source: string): void {
  const col = column.toUpperCase();
  const cur = filters[col];
  if (cur && cur.value === value && cur.source === source) {
    const next = { ...filters };
    delete next[col];
    filters = next;
  } else {
    filters = { ...filters, [col]: { value, source } };
  }
  notify();
}

export function clearCrossFilters(): void {
  if (Object.keys(filters).length) {
    filters = {};
    notify();
  }
}

/** Subscribe a component to cross-filter changes. */
export function useCrossFilters(): CrossFilters {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    subs.add(force);
    return () => {
      subs.delete(force);
    };
  }, []);
  return filters;
}

