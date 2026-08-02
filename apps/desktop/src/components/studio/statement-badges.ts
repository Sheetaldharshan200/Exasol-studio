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
  let lastKey = "";
  const collection = editor.createDecorationsCollection();
  const update = () => {
    const model = editor.getModel();
    if (!enabled || !model) {
      collection.clear();
      lastKey = "";
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
          glyphMarginHoverMessage: { value: `Statement ${i + 1} — click to select it` },
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      };
    });
    // `--/ … /` UDF script blocks render as an embedded code block: a tinted
    // whole-line background plus a language chip on the marker line. Blocks
    // still being typed (no closing "/") stay unpainted — tinting the whole
    // rest of the buffer mid-keystroke reads as the editor jumping around.
    for (const block of findScriptBlocks(sql)) {
      if (!block.closed) continue;
      const from = model.getPositionAt(block.start);
      const to = model.getPositionAt(block.end);
      decorations.push({
        range: new monaco.Range(from.lineNumber, 1, to.lineNumber, model.getLineMaxColumn(to.lineNumber)),
        options: { isWholeLine: true, className: "exa-udf-block" },
      });
      // The delimiters (`--/` line + closing `/`) style as block markers, not
      // as the comment / operator colors the SQL tokenizer would give them.
      decorations.push({
        range: new monaco.Range(from.lineNumber, 1, from.lineNumber, model.getLineMaxColumn(from.lineNumber)),
        options: { inlineClassName: "exa-udf-marker" },
      });
      decorations.push({
        range: new monaco.Range(to.lineNumber, 1, to.lineNumber, model.getLineMaxColumn(to.lineNumber)),
        options: { inlineClassName: "exa-udf-marker" },
      });
      // Language chip only once the CREATE header names a language.
      if (block.language) {
        decorations.push({
          range: new monaco.Range(from.lineNumber, model.getLineMaxColumn(from.lineNumber), from.lineNumber, model.getLineMaxColumn(from.lineNumber)),
          options: {
            after: { content: `  ${block.language} script`, inlineClassName: "exa-udf-lang" },
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        });
      }
    }
    // Re-apply ONLY on structural change — replacing identical decorations on
    // every keystroke made the margin and block tint visibly push around.
    const key = decorations
      .map((d) => `${d.range.startLineNumber}:${d.range.endLineNumber}:${d.options.glyphMarginClassName ?? d.options.className ?? d.options.inlineClassName ?? ""}:${d.options.after?.content ?? ""}`)
      .join("|");
    if (key === lastKey) return;
    lastKey = key;
    collection.set(decorations);
  };
  update();
  // Debounced on typing: re-splitting and re-numbering on EVERY keystroke made
  // the margin churn (a lone "-" merges statements until the next char lands).
  let timer: number | undefined;
  const scheduleUpdate = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(update, 200);
  };
  const subs = [editor.onDidChangeModelContent(scheduleUpdate), editor.onDidChangeModel(update)];

  // Clicking a statement's number selects the whole statement (script blocks
  // select marker line through the closing "/").
  const mouseSub = editor.onMouseDown((e) => {
    if (!enabled) return;
    if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
    const line = e.target.position?.lineNumber;
    const model = editor.getModel();
    if (!line || !model) return;
    const sql = model.getValue();
    for (const s of splitStatements(sql)) {
      const span = sql.slice(s.start, s.end);
      const textStart = s.start + (span.length - span.trimStart().length);
      if (model.getPositionAt(textStart).lineNumber !== line) continue;
      const from = model.getPositionAt(textStart);
      // Include the trailing ";" / "/" terminator when present.
      const endOffset = s.end < sql.length && (sql[s.end] === ";" || sql[s.end] === "/") ? s.end + 1 : s.end;
      const to = model.getPositionAt(endOffset);
      editor.setSelection({ startLineNumber: from.lineNumber, startColumn: from.column, endLineNumber: to.lineNumber, endColumn: to.column });
      editor.focus();
      return;
    }
  });

  editor.onDidDispose(() => {
    subs.forEach((s) => s.dispose());
    mouseSub.dispose();
    window.clearTimeout(timer);
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
