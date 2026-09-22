// The toast a dashboard export ends with — pure, so the wording and the
// "nothing to say on cancel" rule are tested without a dialog or a window.

import type { ExportFormat, ExportResult } from "./export-dashboard";

export type ExportNotice = { kind: "success" | "warning"; title: string; body: string; go?: string };

/** null when the user cancelled the save dialog — that needs no toast. */
export function exportNotice(result: ExportResult, format: ExportFormat): ExportNotice | null {
  if (!result.ok) {
    return result.error ? { kind: "warning", title: "Export failed", body: result.error } : null;
  }
  if (format === "pdf") {
    return result.dialog === false
      ? { kind: "success", title: "Print window opened", body: "Press ⌘P in that window, then choose “Save as PDF”." }
      : { kind: "success", title: "Print dialog opened", body: "Choose “Save as PDF” in the print dialog." };
  }
  return { kind: "success", title: "Dashboard exported", body: `Saved ${result.path}`, go: `file:${result.path}` };
}
