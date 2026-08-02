import { useEffect, useMemo, useState } from "react";
import { Braces } from "lucide-react";
import { splitStatements } from "@/lib/sql-text";

type StatusEditor = import("monaco-editor").editor.IStandaloneCodeEditor;

/**
 * VS Code-style status strip under the SQL editor: cursor position (click →
 * Go to Line), selection size, live statement count, and the indent/encoding/
 * EOL/language facts on the right.
 */
export function EditorStatusBar({ editor, sql }: { editor: StatusEditor | null; sql: string }) {
  const [line, setLine] = useState(1);
  const [col, setCol] = useState(1);
  const [selected, setSelected] = useState(0);
  const [eol, setEol] = useState<"LF" | "CRLF">("LF");
  const [tabSize, setTabSize] = useState(4);

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const p = editor.getPosition();
      if (p) {
        setLine(p.lineNumber);
        setCol(p.column);
      }
      const model = editor.getModel();
      const sel = editor.getSelection();
      setSelected(model && sel && !sel.isEmpty() ? model.getValueLengthInRange(sel) : 0);
      if (model) {
        setEol(model.getEOL() === "\r\n" ? "CRLF" : "LF");
        setTabSize(Number(model.getOptions().tabSize) || 4);
      }
    };
    update();
    // Cursor-selection events also fire on plain cursor moves; model swaps
    // happen when switching query tabs (each tab has its own path/model).
    const subs = [editor.onDidChangeCursorSelection(update), editor.onDidChangeModel(update)];
    return () => subs.forEach((s) => s.dispose());
  }, [editor]);

  const statements = useMemo(() => splitStatements(sql).length, [sql]);

  return (
    <div className="flex h-6 shrink-0 select-none items-center border-t border-border bg-panel/70 px-1 text-[11px] text-muted-foreground">
      <button
        onClick={() => {
          editor?.focus();
          editor?.trigger("status-bar", "editor.action.gotoLine", null);
        }}
        title="Go to line…"
        className="rounded px-1.5 py-0.5 tabular-nums transition-colors hover:bg-secondary hover:text-foreground"
      >
        Ln {line}, Col {col}
        {selected > 0 ? ` (${selected} selected)` : ""}
      </button>
      <span className="px-1.5 tabular-nums">
        {statements} {statements === 1 ? "statement" : "statements"}
      </span>
      <div className="ml-auto flex items-center">
        <span className="px-1.5">Spaces: {tabSize}</span>
        <span className="px-1.5">UTF-8</span>
        <span className="px-1.5">{eol}</span>
        <span className="flex items-center gap-1 px-1.5">
          <Braces className="h-3 w-3" /> SQL
        </span>
      </div>
    </div>
  );
}
