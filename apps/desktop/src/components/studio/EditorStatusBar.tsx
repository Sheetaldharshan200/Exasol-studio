import { useEffect, useMemo, useState } from "react";
import { Braces } from "lucide-react";
import { splitStatements } from "@/lib/sql-text";
import { openSettingsWindow } from "@/lib/settings-window";

type StatusEditor = import("monaco-editor").editor.IStandaloneCodeEditor;

/** A right-side status chip — clicking opens Settings at the given page. */
function Chip({ children, label, cat }: { children: React.ReactNode; label: string; cat: string }) {
  return (
    <button
      onClick={() => void openSettingsWindow(cat)}
      title={label}
      className="flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-secondary hover:text-foreground"
    >
      {children}
    </button>
  );
}

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
        <Chip label="Editor settings" cat="sqlEditor">
          Spaces: {tabSize}
        </Chip>
        <Chip label="Encoding settings" cat="encoding">
          UTF-8
        </Chip>
        <Chip label="Editor settings" cat="sqlEditor">
          {eol}
        </Chip>
        <Chip label="SQL editor settings — syntax colors" cat="sqlEditor">
          <Braces className="h-3 w-3" /> SQL
        </Chip>
      </div>
    </div>
  );
}
