import type { Monaco } from "@monaco-editor/react";

type Ed = import("monaco-editor").editor.IStandaloneCodeEditor;
export type AiBulbKind = "explain-plan" | "explain" | "optimize" | "edit";

/**
 * Custom floating 💡 that follows the SELECTION (not Monaco's finicky
 * lightbulb): select SQL → bulb appears at the selection's first line →
 * click → menu of AI actions that operate on that selection only.
 */
export function attachAiBulb(editor: Ed, monaco: Monaco, onAction: (kind: AiBulbKind) => void): void {
  const node = document.createElement("div");
  node.className = "exa-ai-bulb-wrap";
  const bulb = document.createElement("button");
  bulb.type = "button";
  bulb.className = "exa-ai-bulb";
  bulb.innerHTML =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>' +
    '<path d="M9 18h6"/><path d="M10 22h4"/></svg>';
  bulb.title = "AI actions for this selection";
  const menu = document.createElement("div");
  menu.className = "exa-ai-menu";
  menu.style.display = "none";
  const ACTIONS: [AiBulbKind, string][] = [
    ["explain-plan", "Explain the plan"],
    ["explain", "Explain what this does"],
    ["optimize", "Optimize"],
    ["edit", "Edit with instruction…"],
  ];
  for (const [kind, label] of ACTIONS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    // preventDefault on mousedown keeps the editor selection alive.
    b.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    b.addEventListener("click", (e) => {
      e.preventDefault();
      menu.style.display = "none";
      onAction(kind);
    });
    menu.appendChild(b);
  }
  bulb.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  bulb.addEventListener("click", () => {
    menu.style.display = menu.style.display === "none" ? "block" : "none";
  });
  node.append(bulb, menu);

  let pos: import("monaco-editor").IPosition | null = null;
  const widget: import("monaco-editor").editor.IContentWidget = {
    // The bulb hangs LEFT of column 1 (into the gutter gap) — without this
    // flag Monaco clips content widgets to the text area and it vanishes.
    allowEditorOverflow: true,
    getId: () => "exa.ai.bulb",
    getDomNode: () => node,
    getPosition: () =>
      pos
        ? {
            position: pos,
            preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
          }
        : null,
  };
  editor.addContentWidget(widget);
  editor.onDidChangeCursorSelection((e) => {
    if (e.selection.isEmpty()) {
      pos = null;
      menu.style.display = "none";
    } else {
      // Anchor at the LEFT END of the active line (VS Code style), not
      // floating above/below the selection.
      pos = { lineNumber: e.selection.startLineNumber, column: 1 };
    }
    editor.layoutContentWidget(widget);
  });
}
