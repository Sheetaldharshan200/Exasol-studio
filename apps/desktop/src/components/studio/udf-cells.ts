/**
 * The notebook cell around a `--/ … /` script block.
 *
 * Line decorations can only tint a background, which is why tinting alone
 * never read as a cell. A real header bar needs real DOM, and Monaco's view
 * zones are how you put DOM between two lines. Each block gets one: a strip
 * above it carrying the language, the script's name and its kind, drawn in
 * the language's own accent — the top of the cell, with the declaration and
 * the function's own child cell below it.
 *
 * The zones are rebuilt only when the blocks change shape, never per
 * keystroke: a view zone changes the editor's layout, and rebuilding one on
 * every character made the buffer jump under the caret.
 */
import { type Monaco } from "@monaco-editor/react";
import { findScriptBlocks } from "../../lib/sql-text.ts";
import { udfBodyStart, udfCellHeading } from "../../lib/udf-block-style.ts";
import { nextIndent } from "../../lib/udf-indent.ts";
import { embeddedConfig } from "../../lib/sql-udf-embedding.ts";

type StudioEditor = import("monaco-editor").editor.IStandaloneCodeEditor;

/** The cells a buffer should show: one per closed block. */
export type UdfCell = { line: number; language: string | null; name: string | null; kind: string | null };

/** Which cells a buffer calls for. Pure, so the decision is testable without
 *  an editor: a block still being typed has no cell yet. */
export function udfCellsOf(sql: string, lineOf: (offset: number) => number): UdfCell[] {
  return findScriptBlocks(sql)
    .filter((b) => b.closed)
    .map((b) => {
      const heading = udfCellHeading(sql.slice(b.start, b.end));
      return { line: lineOf(b.start), language: b.language ?? heading.language, name: heading.name, kind: heading.kind };
    });
}

/** A key that changes only when the cells would look different. */
export function udfCellsKey(cells: readonly UdfCell[]): string {
  return cells.map((c) => `${c.line}:${c.language ?? ""}:${c.name ?? ""}:${c.kind ?? ""}`).join("|");
}

function headerDom(cell: UdfCell): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "exa-udf-cellbar";

  const lang = document.createElement("span");
  lang.className = "exa-udf-cellbar-lang";
  lang.textContent = cell.language ? cell.language.toUpperCase() : "SCRIPT";
  bar.appendChild(lang);

  if (cell.name) {
    const name = document.createElement("span");
    name.className = "exa-udf-cellbar-name";
    name.textContent = cell.name;
    bar.appendChild(name);
  }
  if (cell.kind) {
    const kind = document.createElement("span");
    kind.className = "exa-udf-cellbar-kind";
    kind.textContent = cell.kind.toLowerCase();
    bar.appendChild(kind);
  }
  return bar;
}

export function installUdfCells(editor: StudioEditor, monaco: Monaco): { dispose: () => void } {
  let zones: string[] = [];
  let lastKey = "";

  const update = () => {
    const model = editor.getModel();
    if (!model) return;
    const cells = udfCellsOf(model.getValue(), (offset) => model.getPositionAt(offset).lineNumber);
    const key = udfCellsKey(cells);
    if (key === lastKey) return;
    lastKey = key;
    editor.changeViewZones((accessor) => {
      for (const id of zones) accessor.removeZone(id);
      zones = cells.map((cell) =>
        accessor.addZone({
          // Above the block's opening marker: the top of the cell.
          afterLineNumber: cell.line - 1,
          heightInPx: 26,
          domNode: headerDom(cell),
        }),
      );
    });
  };

  // Enter inside a body follows the EMBEDDED language's rules. The model's
  // language is SQL, so without this a Python `if x:` gets no indent and a
  // Lua `function` none either — the moment the block stops feeling like
  // writing in that language.
  const onEnter = editor.onKeyDown((e) => {
    if (e.keyCode !== 3 /* Enter */ || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
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
    const full = model.getLineContent(pos.lineNumber);
    const indent = nextIndent(
      embeddedConfig(block.language) as never,
      {
        beforeText: full.slice(0, pos.column - 1),
        afterText: full.slice(pos.column - 1),
        previousLineText: pos.lineNumber > 1 ? model.getLineContent(pos.lineNumber - 1) : "",
      },
      model.getOptions().tabSize,
      monaco.languages.IndentAction,
    );
    e.preventDefault();
    e.stopPropagation();
    editor.executeEdits("exa-udf-indent", [
      { range: { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column }, text: `\n${indent}` },
    ]);
    const next = { lineNumber: pos.lineNumber + 1, column: indent.length + 1 };
    editor.setPosition(next);
    editor.revealPositionInCenterIfOutsideViewport(next);
  });

  update();
  let timer: number | undefined;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(update, 200);
  };
  const subs = [editor.onDidChangeModelContent(schedule), editor.onDidChangeModel(update), onEnter];
  return {
    dispose: () => {
      window.clearTimeout(timer);
      for (const s of subs) s.dispose();
      editor.changeViewZones((accessor) => {
        for (const id of zones) accessor.removeZone(id);
        zones = [];
      });
    },
  };
}
