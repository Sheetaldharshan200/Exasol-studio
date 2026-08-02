/**
 * Statement-number badges in the editor's LEFT margin: every statement of a
 * multi-statement buffer shows its 1-based number ("1]", "2]", …) in the
 * glyph margin next to its first line, matching the numbering in the result
 * tabs and Query Performance. Single-statement buffers show nothing.
 * Toggled from Settings → SQL Editor (on by default).
 */
import { type Monaco } from "@monaco-editor/react";
import { splitStatements } from "@/lib/sql-text";

type StudioEditor = import("monaco-editor").editor.IStandaloneCodeEditor;

// The numbers render via CSS content — one tiny rule per number, generated on
// demand (`.exa-stmt-badge-7::after { content: "7]" }`).
let styledUpTo = 0;
function ensureBadgeStyles(count: number) {
  if (count <= styledUpTo) return;
  let el = document.getElementById("exa-stmt-badge-styles");
  if (!el) {
    el = document.createElement("style");
    el.id = "exa-stmt-badge-styles";
    document.head.appendChild(el);
  }
  let css = "";
  for (let n = styledUpTo + 1; n <= count; n++) css += `.exa-stmt-badge-${n}::after{content:"${n}]"}\n`;
  el.appendChild(document.createTextNode(css));
  styledUpTo = count;
}

/** Keep badges in sync with the buffer; returns the enable/disable handle. */
export function installStatementBadges(editor: StudioEditor, monaco: Monaco): { setEnabled: (on: boolean) => void } {
  let enabled = true;
  const collection = editor.createDecorationsCollection();
  const update = () => {
    const model = editor.getModel();
    if (!enabled || !model) {
      collection.clear();
      return;
    }
    const sql = model.getValue();
    const stmts = splitStatements(sql);
    if (stmts.length < 2) {
      collection.clear();
      return;
    }
    ensureBadgeStyles(stmts.length);
    collection.set(
      stmts.map((s, i) => {
        // First line of the statement's actual text, not its leading whitespace.
        const span = sql.slice(s.start, s.end);
        const textStart = s.start + (span.length - span.trimStart().length);
        const pos = model.getPositionAt(textStart);
        return {
          range: new monaco.Range(pos.lineNumber, 1, pos.lineNumber, 1),
          options: {
            glyphMarginClassName: `exa-stmt-badge exa-stmt-badge-${i + 1}`,
            glyphMarginHoverMessage: { value: `Statement ${i + 1}` },
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
  return {
    setEnabled(on: boolean) {
      enabled = on;
      // The glyph margin is only worth its width while badges are shown.
      editor.updateOptions({ glyphMargin: on });
      update();
    },
  };
}
