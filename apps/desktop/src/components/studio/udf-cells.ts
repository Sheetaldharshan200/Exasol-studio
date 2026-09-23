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
import { udfAccentColor, udfCellHeading } from "../../lib/udf-block-style.ts";

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
  const accent = udfAccentColor(cell.language) ?? "var(--primary)";
  const bar = document.createElement("div");
  bar.className = "exa-udf-cellbar";
  bar.style.setProperty("--exa-udf-accent", accent);

  const dot = document.createElement("span");
  dot.className = "exa-udf-cellbar-dot";
  bar.appendChild(dot);

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

export function installUdfCells(editor: StudioEditor, _monaco: Monaco): { dispose: () => void } {
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

  update();
  let timer: number | undefined;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(update, 200);
  };
  const subs = [editor.onDidChangeModelContent(schedule), editor.onDidChangeModel(update)];
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
