/**
 * Statement-number badges in the editor's LEFT margin: every statement of a
 * multi-statement buffer shows its 1-based number ("1]", "2]", …) in the
 * glyph margin next to its first line, matching the numbering in the result
 * tabs and Query Performance. Single-statement buffers show nothing.
 * Toggled from Settings → SQL Editor (on by default).
 */
import { type Monaco } from "@monaco-editor/react";
import { findScriptBlocks, splitStatements } from "@/lib/sql-text";

type StudioEditor = import("monaco-editor").editor.IStandaloneCodeEditor;
type Decoration = import("monaco-editor").editor.IModelDeltaDecoration;

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
    // Number badges only for multi-statement buffers; the UDF block visuals
    // below apply even when the buffer is a single script.
    const stmts = splitStatements(sql);
    const numbered = stmts.length >= 2 ? stmts : [];
    ensureBadgeStyles(numbered.length);
    const decorations: Decoration[] = numbered.map((s, i) => {
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
    });
    // `--/ … /` UDF script blocks render as an embedded code block: a tinted
    // whole-line background plus a language chip on the marker line.
    for (const block of findScriptBlocks(sql)) {
      const from = model.getPositionAt(block.start);
      const to = model.getPositionAt(block.end);
      decorations.push({
        range: new monaco.Range(from.lineNumber, 1, to.lineNumber, model.getLineMaxColumn(to.lineNumber)),
        options: { isWholeLine: true, className: "exa-udf-block" },
      });
      decorations.push({
        range: new monaco.Range(from.lineNumber, model.getLineMaxColumn(from.lineNumber), from.lineNumber, model.getLineMaxColumn(from.lineNumber)),
        options: {
          after: { content: `  ${block.language} script`, inlineClassName: "exa-udf-lang" },
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      });
    }
    collection.set(decorations);
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
