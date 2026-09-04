// Notebook and canvas are two VIEWS over one document — this pure module derives
// each view's item list from the shared `DashboardDoc`, so switching views (or
// round-tripping through both) can never lose a widget, query, or result: there
// is only ever the one widget array underneath.
//
// The notebook view is linear/run-order and ignores layout; the canvas view is
// freeform and reads layout. Neither copies widget content — both reference the
// same widgets — so identity is guaranteed by construction, and the tests pin it.

import type { DashboardDoc, Widget, Layout } from "./model.ts";

export type NotebookCell = { index: number; widget: Widget };
export type CanvasItem = { widget: Widget; layout: Layout };

/** Linear, run-order cells numbered 1..N; layout is intentionally ignored. */
export function toNotebookCells(doc: DashboardDoc): NotebookCell[] {
  return doc.widgets.map((widget, i) => ({ index: i + 1, widget }));
}

/** Freeform items carrying each widget's grid layout. */
export function toCanvasItems(doc: DashboardDoc): CanvasItem[] {
  return doc.widgets.map((widget) => ({ widget, layout: widget.layout }));
}

/** True when two documents hold the same widgets (id, type, query) in the same order. */
export function sameWidgets(a: DashboardDoc, b: DashboardDoc): boolean {
  if (a.widgets.length !== b.widgets.length) return false;
  return a.widgets.every((w, i) => {
    const o = b.widgets[i];
    return w.id === o.id && w.type === o.type && w.query === o.query;
  });
}
