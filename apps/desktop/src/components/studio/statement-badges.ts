/**
 * Statement-number labels in the editor: every statement of a multi-statement
 * buffer gets a virtual "1] " marker injected before its first keyword, so
 * the buffer reads "1] DROP …", "2] CREATE …" and matches the numbering in
 * the result tabs and Query Performance. Injected text is display-only — it
 * is not part of the SQL and cannot be selected or executed.
 * Single-statement buffers show nothing.
 */
import { type Monaco } from "@monaco-editor/react";
import { splitStatements } from "@/lib/sql-text";

type StudioEditor = import("monaco-editor").editor.IStandaloneCodeEditor;

/** Keep the markers in sync with the buffer; disposed with the editor. */
export function installStatementBadges(editor: StudioEditor, monaco: Monaco) {
  const collection = editor.createDecorationsCollection();
  const update = () => {
    const model = editor.getModel();
    if (!model) {
      collection.clear();
      return;
    }
    const sql = model.getValue();
    const stmts = splitStatements(sql);
    if (stmts.length < 2) {
      collection.clear();
      return;
    }
    collection.set(
      stmts.map((s, i) => {
        // First character of the statement's actual text, not its leading whitespace.
        const span = sql.slice(s.start, s.end);
        const textStart = s.start + (span.length - span.trimStart().length);
        const pos = model.getPositionAt(textStart);
        return {
          range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
          options: {
            before: {
              content: `${i + 1}] `,
              inlineClassName: "exa-stmt-inline",
              cursorStops: monaco.editor.InjectedTextCursorStops.None,
            },
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        };
      }),
    );
  };
  update();
  const subs = [editor.onDidChangeModelContent(update), editor.onDidChangeModel(update)];
  editor.onDidDispose(() => {
    subs.forEach((s) => s.dispose());
    collection.clear();
  });
}
