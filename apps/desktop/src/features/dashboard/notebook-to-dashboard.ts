// Convert a notebook's cells into a dashboard document — the "open as dashboard"
// bridge. A linked dashboard is a fresh document derived from the notebook's
// cells: SQL cells become chart/kpi/table widgets (honoring the cell's chosen
// chart kind), markdown becomes text, mermaid is carried as a fenced code block.
// Pure, so the mapping and the left→right flow layout are unit-tested.

import { applyOps, emptyDoc, type DashboardDoc, type Layout, type Op } from "./model.ts";

/** The subset of a notebook cell this conversion reads. */
export type SourceCell = {
  type: "sql" | "markdown" | "mermaid";
  src: string;
  chart?: string;
  viz?: { xField?: string; yFields?: string[] };
};

const COLS = 12;

/** A simple flow layouter: place left→right, wrapping to a new row when full. */
function makeFlow() {
  let x = 0, y = 0, rowH = 0;
  return (w: number, h: number): Layout => {
    if (x + w > COLS) {
      y += rowH;
      x = 0;
      rowH = 0;
    }
    const layout = { x, y, w, h };
    x += w;
    rowH = Math.max(rowH, h);
    return layout;
  };
}

/** Build a dashboard document from notebook cells. When `sourceNotebook` is set,
 *  the result is a synced child of that notebook (content edited there). */
export function dashboardDocFromCells(id: string, title: string, cells: SourceCell[], sourceNotebook?: string): DashboardDoc {
  const place = makeFlow();
  const ops: Op[] = [];

  for (const cell of cells) {
    const src = cell.src?.trim() ?? "";
    if (!src) continue;

    if (cell.type === "markdown") {
      ops.push({ op: "add_widget", widget: { type: "markdown", props: { text: cell.src }, layout: place(12, 2) } });
      continue;
    }
    if (cell.type === "mermaid") {
      ops.push({ op: "add_widget", widget: { type: "markdown", props: { text: "```mermaid\n" + cell.src + "\n```" }, layout: place(12, 2) } });
      continue;
    }
    // SQL cell → a data widget, honoring the cell's chosen chart kind.
    const kind = cell.chart;
    if (kind === "kpi") {
      ops.push({ op: "add_widget", widget: { type: "kpi", query: cell.src, layout: place(3, 2) } });
    } else if (kind && kind !== "table") {
      ops.push({ op: "add_widget", widget: { type: "chart", query: cell.src, props: { kind, xField: cell.viz?.xField, yFields: cell.viz?.yFields }, layout: place(6, 4) } });
    } else {
      ops.push({ op: "add_widget", widget: { type: "table", query: cell.src, layout: place(6, 4) } });
    }
  }

  const doc = applyOps(emptyDoc(id, title), ops).doc;
  if (sourceNotebook) doc.sourceNotebook = sourceNotebook;
  return doc;
}
