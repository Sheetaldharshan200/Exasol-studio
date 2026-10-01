// Puts a failed run's error into the editor as a marker (the range comes from
// lib/error-markers.ts). Separate from sql-markers: those are lint, re-derived
// on every edit; this one stays on its tab's model until that tab runs again.

import { type Monaco } from "@monaco-editor/react";
import type { ErrorMarker } from "@/lib/error-markers";

type TextModel = import("monaco-editor").editor.ITextModel;

const OWNER = "studio-run-error";

export function markRunError(model: TextModel | null | undefined, monaco: Monaco | null, marker: ErrorMarker | null) {
  if (!model || model.isDisposed() || !monaco) return;
  if (!marker) {
    monaco.editor.setModelMarkers(model, OWNER, []);
    return;
  }
  const s = model.getPositionAt(marker.start);
  const e = model.getPositionAt(marker.end);
  monaco.editor.setModelMarkers(model, OWNER, [
    {
      severity: monaco.MarkerSeverity.Error,
      message: marker.message,
      startLineNumber: s.lineNumber,
      startColumn: s.column,
      endLineNumber: e.lineNumber,
      endColumn: e.column,
    },
  ]);
}
