/**
 * The red and yellow wavy underlines in the SQL editor.
 *
 * Two sources, deliberately separate. lib/sql-diagnostics.ts reports what is
 * wrong in any database — a string left open, a bracket never closed — and
 * those are errors. lib/sql-lint.ts reports what is wrong in THIS one — a
 * schema this connection cannot see, a script language the server does not
 * offer, a shape Exasol rejects — and those are warnings, except the dialect
 * ones, which are certain.
 *
 * Both are debounced: underlining a string the moment its opening quote is
 * typed would mark every string as broken while it is being written.
 */
import { type Monaco } from "@monaco-editor/react";
import { findProblems } from "@/lib/sql-diagnostics";
import { lintSql, type LintCatalog } from "@/lib/sql-lint";

type StudioEditor = import("monaco-editor").editor.IStandaloneCodeEditor;
type TextModel = import("monaco-editor").editor.ITextModel;
type Marker = import("monaco-editor").editor.IMarkerData;

/** Ours, so clearing these never disturbs anyone else's markers. */
const OWNER = "exa-sql";

export type MarkerDeps = {
  /** Whether the user wants underlines at all (Settings). Read per pass, so
   *  switching it off clears what is already drawn. */
  enabled: () => boolean;
  /** The connected database's catalog, or undefined before one is loaded. */
  catalog: () => LintCatalog | undefined;
  /** Script-language aliases the server offers, or undefined when unknown. */
  languages: () => readonly string[] | undefined;
};

/** Disposable, plus a way to re-run when the catalog arrives after the text. */
export type SqlMarkers = { dispose: () => void; refresh: () => void };

export function installSqlMarkers(editor: StudioEditor, monaco: Monaco, deps: MarkerDeps): SqlMarkers {
  // Markers are owned by a MODEL. Each tab has its own, so switching tabs has
  // to clear the one we left — setting markers on the newly attached model
  // does not remove the ones already on the old one.
  let marked: TextModel | null = null;
  const clear = () => {
    if (marked && !marked.isDisposed()) monaco.editor.setModelMarkers(marked, OWNER, []);
    marked = null;
  };

  const update = () => {
    const model = editor.getModel();
    if (marked && marked !== model) clear();
    if (!model) return;
    // Switched off means no underlines at all, not just the contextual ones —
    // the setting says "Problem underlines", and half of them staying would
    // read as the toggle being broken.
    if (!deps.enabled()) {
      monaco.editor.setModelMarkers(model, OWNER, []);
      marked = model;
      return;
    }
    const sql = model.getValue();
    const span = (start: number, end: number) => {
      const from = model.getPositionAt(start);
      const to = model.getPositionAt(end);
      return {
        startLineNumber: from.lineNumber,
        startColumn: from.column,
        endLineNumber: to.lineNumber,
        endColumn: to.column,
      };
    };

    const certain: Marker[] = findProblems(sql).map((p) => ({
      severity: monaco.MarkerSeverity.Error,
      message: p.message,
      ...span(p.start, p.end),
    }));
    const contextual: Marker[] = lintSql(sql, {
      catalog: deps.catalog(),
      languages: deps.languages(),
    }).map((l) => ({
      severity: l.severity === "error" ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
      message: l.message,
      ...span(l.start, l.end),
    }));

    monaco.editor.setModelMarkers(model, OWNER, [...certain, ...contextual]);
    marked = model;
  };

  // Long enough that an unfinished string is not flagged mid-word.
  let timer: number | undefined;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(update, 500);
  };
  update();
  const subs = [editor.onDidChangeModelContent(schedule), editor.onDidChangeModel(update)];
  return {
    refresh: update,
    dispose: () => {
      window.clearTimeout(timer);
      for (const s of subs) s.dispose();
      clear();
    },
  };
}
