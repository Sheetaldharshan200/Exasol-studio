/**
 * Typing inside a `--/ … /` script block behaves like the language in it.
 *
 * The buffer's language is SQL, so Monaco indents by SQL's rules everywhere,
 * including inside a block where the code is Python, Lua, Java or R. Typing a
 * Python `if x:` and getting no indent is the moment the block stops behaving
 * like the language it holds.
 *
 * No rule about any language is written here. Monaco ships a configuration
 * for every language it can highlight, and `nextIndent` evaluates whichever
 * one the block's CREATE header names.
 */
import { type Monaco } from "@monaco-editor/react";
import { findScriptBlocks } from "../../lib/sql-text.ts";
import { udfBodyStart } from "../../lib/udf-block-style.ts";
import { nextIndent } from "../../lib/udf-indent.ts";
import { embeddedConfig } from "../../lib/sql-udf-embedding.ts";

type StudioEditor = import("monaco-editor").editor.IStandaloneCodeEditor;

export function installUdfTyping(editor: StudioEditor, monaco: Monaco): { dispose: () => void } {
  // Enter belongs to whatever popup is open before it belongs to us: the
  // suggestion list accepts on Enter, and so do the parameter hints. Taking
  // it unconditionally meant a suggestion could never be accepted — Enter
  // just broke the line instead.
  const popupOpen = () => {
    const dom = editor.getDomNode();
    return Boolean(dom?.querySelector(".suggest-widget.visible, .parameter-hints-widget.visible"));
  };

  const onEnter = editor.onKeyDown((e) => {
    if (e.keyCode !== 3 /* Enter */ || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
    if (popupOpen()) return;
    const model = editor.getModel();
    const pos = editor.getPosition();
    if (!model || !pos) return;
    const sql = model.getValue();
    const offset = model.getOffsetAt(pos);
    const block = findScriptBlocks(sql).find((b) => offset > b.start && (offset < b.end || !b.closed));
    if (!block) return;
    const startLine = model.getPositionAt(block.start).lineNumber;
    const lines: string[] = [];
    const endLine = model.getPositionAt(Math.min(block.end, sql.length)).lineNumber;
    for (let l = startLine; l <= endLine; l++) lines.push(model.getLineContent(l));
    const bodyStart = udfBodyStart(lines);
    // Only inside the language's own code — the SQL header keeps SQL's rules.
    if (bodyStart === null || pos.lineNumber < startLine + bodyStart) return;
    // Enter with text selected REPLACES it. Editing at the bare cursor left
    // the selection in place and pushed a newline into the middle of it.
    const sel = editor.getSelection();
    const from = sel ? { lineNumber: sel.startLineNumber, column: sel.startColumn } : pos;
    const to = sel ? { lineNumber: sel.endLineNumber, column: sel.endColumn } : pos;
    const indent = nextIndent(
      embeddedConfig(block.language) as never,
      {
        beforeText: model.getLineContent(from.lineNumber).slice(0, from.column - 1),
        afterText: model.getLineContent(to.lineNumber).slice(to.column - 1),
        previousLineText: from.lineNumber > 1 ? model.getLineContent(from.lineNumber - 1) : "",
      },
      model.getOptions().tabSize,
      monaco.languages.IndentAction,
    );
    e.preventDefault();
    e.stopPropagation();
    editor.executeEdits("exa-udf-indent", [
      {
        range: {
          startLineNumber: from.lineNumber,
          startColumn: from.column,
          endLineNumber: to.lineNumber,
          endColumn: to.column,
        },
        text: `\n${indent}`,
      },
    ]);
    const next = { lineNumber: from.lineNumber + 1, column: indent.length + 1 };
    editor.setPosition(next);
    editor.revealPositionInCenterIfOutsideViewport(next);
  });

  return { dispose: () => onEnter.dispose() };
}
