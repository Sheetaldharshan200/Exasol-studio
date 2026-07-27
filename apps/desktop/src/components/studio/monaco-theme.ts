/**
 * Monaco editor themes matched to the Studio light/dark palettes.
 * Extracted from ExasolStudio.tsx.
 */
import { type Monaco } from "@monaco-editor/react";

export function defineMonacoThemes(monaco: Monaco) {
  monaco.editor.defineTheme("exasol-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "82dd4b", fontStyle: "bold" },
      { token: "string", foreground: "e9a94f" },
      { token: "number", foreground: "5fd0c0" },
      { token: "comment", foreground: "6a6a70", fontStyle: "italic" },
    ],
    colors: {
      "editor.background": "#0a0a0b",
      "editor.foreground": "#ededee",
      "editor.lineHighlightBackground": "#151517",
      "editorLineNumber.foreground": "#3a3a40",
      "editorLineNumber.activeForeground": "#8a8a90",
      "editor.selectionBackground": "#26331d",
      "editorCursor.foreground": "#5fc33b",
      "editorIndentGuide.background1": "#1c1c1f",
    },
  });
  monaco.editor.defineTheme("exasol-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "157f3c", fontStyle: "bold" },
      { token: "string", foreground: "a7681c" },
      { token: "number", foreground: "0b73a2" },
      { token: "comment", foreground: "6b7280", fontStyle: "italic" },
    ],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#0b1730",
      "editor.lineHighlightBackground": "#f1f5fb",
      "editorLineNumber.foreground": "#9aa2ab",
      "editorLineNumber.activeForeground": "#0b1730",
      "editorCursor.foreground": "#4fa823",
    },
  });
}
