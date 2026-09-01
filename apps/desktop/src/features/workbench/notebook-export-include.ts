import type { ExportCell } from "./notebook-export";

/** What goes into an export — every part on by default. */
export type ExportInclude = { queries: boolean; results: boolean; notes: boolean; diagrams: boolean };
export const EXPORT_ALL: ExportInclude = { queries: true, results: true, notes: true, diagrams: true };

/** Apply the include selection to the cell list (pure — tested). */
export function filterExportCells(cells: ExportCell[], inc: ExportInclude): ExportCell[] {
  const out: ExportCell[] = [];
  for (const c of cells) {
    if (c.type === "markdown") {
      if (inc.notes) out.push(c);
    } else if (c.type === "mermaid") {
      if (inc.diagrams) out.push(c);
    } else {
      if (!inc.queries && !inc.results) continue;
      out.push({ ...c, src: inc.queries ? c.src : "", result: inc.results ? c.result : null });
    }
  }
  return out;
}
