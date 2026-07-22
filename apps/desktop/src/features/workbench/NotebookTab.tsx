import { useCallback, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Code2,
  Loader2,
  Pencil,
  Play,
  Plus,
  Text as TextIcon,
  Trash2,
} from "lucide-react";
import { errorMessage, ipc, type StatementResult } from "@/lib/ipc";
import { cn } from "@/lib/utils";

type CellType = "sql" | "markdown";
type Cell = {
  id: string;
  type: CellType;
  src: string;
  running: boolean;
  result: StatementResult | null;
  error: string | null;
  count: number | null; // execution count, Jupyter-style
  editing: boolean; // markdown cells: editing vs rendered
};

let seq = 0;
const mkCell = (type: CellType = "sql", src = ""): Cell => ({
  id: `c${++seq}-${Math.random().toString(36).slice(2, 6)}`,
  type,
  src,
  running: false,
  result: null,
  error: null,
  count: null,
  editing: type === "markdown" ? !src : true,
});

/**
 * A Jupyter-style notebook for Exasol: SQL and Markdown cells you can add above
 * or below, reorder, switch type, and run. SQL cells execute against the
 * connection and show a scrollable result grid; Markdown cells render in place.
 */
export function NotebookTab({ profileId, connectionName }: { profileId: string | null; connectionName: string }) {
  const [cells, setCells] = useState<Cell[]>(() => [mkCell("sql")]);
  const execCount = useRef(0);
  const runningAll = useRef(false);

  const patch = useCallback((id: string, p: Partial<Cell>) => {
    setCells((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));
  }, []);

  const runCell = useCallback(
    async (id: string) => {
      let cell: Cell | undefined;
      setCells((cs) => {
        cell = cs.find((c) => c.id === id);
        return cs;
      });
      if (!cell) return;
      if (cell.type === "markdown") {
        patch(id, { editing: false });
        return;
      }
      if (!profileId) {
        patch(id, { error: "Connect to a database first.", result: null });
        return;
      }
      if (!cell.src.trim()) return;
      patch(id, { running: true, error: null });
      try {
        const res = await ipc.executeSql(profileId, connectionName, cell.src, 1000, false);
        const r = res.results[res.results.length - 1] ?? null;
        patch(id, { running: false, result: r, error: r?.error ?? null, count: ++execCount.current });
      } catch (e) {
        patch(id, { running: false, error: errorMessage(e), result: null, count: ++execCount.current });
      }
    },
    [profileId, connectionName, patch],
  );

  function insert(at: string, where: "above" | "below", type: CellType) {
    setCells((cs) => {
      const i = cs.findIndex((c) => c.id === at);
      const next = [...cs];
      next.splice(where === "above" ? i : i + 1, 0, mkCell(type));
      return next;
    });
  }
  function move(id: string, dir: -1 | 1) {
    setCells((cs) => {
      const i = cs.findIndex((c) => c.id === id);
      const j = i + dir;
      if (j < 0 || j >= cs.length) return cs;
      const next = [...cs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function remove(id: string) {
    setCells((cs) => (cs.length === 1 ? [mkCell("sql")] : cs.filter((c) => c.id !== id)));
  }
  function setType(id: string, type: CellType) {
    patch(id, { type, result: null, error: null, editing: true });
  }
  async function runAll() {
    if (runningAll.current) return;
    runningAll.current = true;
    const ids = cells.map((c) => c.id);
    for (const id of ids) await runCell(id);
    runningAll.current = false;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="font-heading text-[14px] font-bold text-foreground">Notebook</span>
        <span className="text-xs text-muted-foreground">{connectionName || "no connection"}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => void runAll()}
            className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Play className="h-3.5 w-3.5" /> Run all
          </button>
          <button
            onClick={() => setCells((cs) => [...cs, mkCell("sql")])}
            className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Code2 className="h-3.5 w-3.5" /> SQL
          </button>
          <button
            onClick={() => setCells((cs) => [...cs, mkCell("markdown")])}
            className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85"
          >
            <TextIcon className="h-3.5 w-3.5" /> Markdown
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-width:thin]">
        <div className="mx-auto flex max-w-4xl flex-col gap-2.5">
          {cells.map((cell, i) => (
            <CellView
              key={cell.id}
              cell={cell}
              first={i === 0}
              last={i === cells.length - 1}
              onChange={(src) => patch(cell.id, { src })}
              onRun={() => void runCell(cell.id)}
              onEdit={() => patch(cell.id, { editing: true })}
              onType={(t) => setType(cell.id, t)}
              onInsert={(w, t) => insert(cell.id, w, t)}
              onMove={(d) => move(cell.id, d)}
              onRemove={() => remove(cell.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CellView({
  cell,
  first,
  last,
  onChange,
  onRun,
  onEdit,
  onType,
  onInsert,
  onMove,
  onRemove,
}: {
  cell: Cell;
  first: boolean;
  last: boolean;
  onChange: (src: string) => void;
  onRun: () => void;
  onEdit: () => void;
  onType: (t: CellType) => void;
  onInsert: (where: "above" | "below", type: CellType) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const isMd = cell.type === "markdown";
  const rendered = isMd && !cell.editing;

  return (
    <div className="group/cell relative">
      {/* Insert-above hover strip */}
      <InsertBar onSql={() => onInsert("above", "sql")} onMd={() => onInsert("above", "markdown")} className="-top-2.5" />

      <div className={cn("overflow-hidden rounded-xl border transition-colors", rendered ? "border-transparent hover:border-border" : "border-border bg-panel/40")}>
        <div className="flex items-stretch">
          {/* Gutter */}
          <div className="flex w-11 shrink-0 flex-col items-center gap-1.5 py-2 font-mono text-[10px] text-muted-foreground">
            <button
              onClick={() => onType(isMd ? "sql" : "markdown")}
              title={isMd ? "Switch to SQL" : "Switch to Markdown"}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
            >
              {isMd ? <TextIcon className="h-3.5 w-3.5" /> : <Code2 className="h-3.5 w-3.5" />}
            </button>
            {!isMd ? <span>[{cell.count ?? " "}]</span> : null}
          </div>

          {/* Body */}
          <div className="min-w-0 flex-1">
            {rendered ? (
              <div
                onDoubleClick={onEdit}
                className="md-body prose-sm max-w-none cursor-text px-3 py-2 text-[13px] leading-relaxed"
              >
                {cell.src.trim() ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{cell.src}</ReactMarkdown>
                ) : (
                  <span className="text-muted-foreground/50 italic">Empty markdown — double-click to edit</span>
                )}
              </div>
            ) : (
              <textarea
                value={cell.src}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    onRun();
                  }
                }}
                rows={Math.min(16, Math.max(2, cell.src.split("\n").length))}
                spellCheck={false}
                placeholder={isMd ? "# Markdown…   ·   ⌘/Ctrl+Enter to render" : "SELECT * FROM …   ·   ⌘/Ctrl+Enter to run"}
                className="min-w-0 w-full resize-none bg-transparent px-3 py-2 font-mono text-[12.5px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50 [scrollbar-width:thin]"
              />
            )}
          </div>

          {/* Actions */}
          <div className="flex shrink-0 flex-col items-center gap-0.5 p-1.5 opacity-0 transition-opacity group-hover/cell:opacity-100">
            <button
              onClick={onRun}
              disabled={cell.running}
              title={isMd ? "Render (⌘/Ctrl+Enter)" : "Run (⌘/Ctrl+Enter)"}
              className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
            >
              {cell.running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : rendered ? <Pencil className="h-3 w-3" /> : <Play className="h-3.5 w-3.5" />}
            </button>
            <button onClick={() => onMove(-1)} disabled={first} title="Move up" className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30">
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => onMove(1)} disabled={last} title="Move down" className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30">
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button onClick={onRemove} title="Delete cell" className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* SQL result */}
        {!isMd && cell.error ? (
          <div className="border-t border-border bg-destructive/5 px-3 py-2 font-mono text-[11.5px] text-destructive [overflow-wrap:anywhere]">
            {cell.error}
          </div>
        ) : !isMd && cell.result ? (
          <div className="border-t border-border">
            <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-muted-foreground">
              <button onClick={() => setCollapsed((v) => !v)} className="flex items-center gap-1 hover:text-foreground">
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", collapsed && "-rotate-90")} />
                {cell.result.kind === "rowCount"
                  ? `${cell.result.rowCount} row(s) affected`
                  : `${cell.result.rowCount} row${cell.result.rowCount === 1 ? "" : "s"}`}
              </button>
              <span className="ml-auto font-mono">{cell.result.elapsedMs} ms</span>
            </div>
            {!collapsed && cell.result.kind === "resultSet" ? (
              <ResultGrid columns={cell.result.columns} rows={cell.result.rows} truncated={cell.result.truncated} />
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Insert-below hover strip */}
      <InsertBar onSql={() => onInsert("below", "sql")} onMd={() => onInsert("below", "markdown")} className="-bottom-2.5" />
    </div>
  );
}

function InsertBar({ onSql, onMd, className }: { onSql: () => void; onMd: () => void; className?: string }) {
  return (
    <div className={cn("absolute inset-x-0 z-10 flex h-5 items-center justify-center gap-1 opacity-0 transition-opacity hover:opacity-100 group-hover/cell:opacity-100", className)}>
      <span className="h-px flex-1 bg-border/60" />
      <button onClick={onSql} className="flex items-center gap-0.5 rounded border border-border bg-editor px-1.5 py-0.5 text-[9.5px] text-muted-foreground hover:text-foreground">
        <Plus className="h-2.5 w-2.5" /> SQL
      </button>
      <button onClick={onMd} className="flex items-center gap-0.5 rounded border border-border bg-editor px-1.5 py-0.5 text-[9.5px] text-muted-foreground hover:text-foreground">
        <Plus className="h-2.5 w-2.5" /> MD
      </button>
      <span className="h-px flex-1 bg-border/60" />
    </div>
  );
}

function ResultGrid({ columns, rows, truncated }: { columns: { name: string; typeName: string }[]; rows: unknown[][]; truncated: boolean }) {
  return (
    <div className="max-h-[420px] overflow-auto [scrollbar-width:thin]">
      <table className="w-full border-collapse text-[11.5px]">
        <thead className="sticky top-0 z-10 bg-secondary">
          <tr>
            <th className="border-b border-border px-2 py-1 text-right font-mono text-[10px] text-muted-foreground">#</th>
            {columns.map((c) => (
              <th key={c.name} className="border-b border-border px-2.5 py-1 text-left font-medium whitespace-nowrap">
                {c.name}
                <span className="ml-1 font-mono text-[9.5px] font-normal text-muted-foreground">{c.typeName}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono">
          {rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-secondary/40">
              <td className="border-b border-border/40 px-2 py-1 text-right text-[10px] text-muted-foreground/60 select-none">{ri + 1}</td>
              {row.map((v, ci) => (
                <td
                  key={ci}
                  className={cn("max-w-[360px] truncate border-b border-border/40 px-2.5 py-1 whitespace-nowrap", v === null && "text-muted-foreground/50 italic")}
                  title={v === null ? "NULL" : String(v)}
                >
                  {v === null ? "NULL" : String(v)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 1} className="px-3 py-4 text-center text-muted-foreground">No rows.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {truncated ? (
        <p className="border-t border-border px-3 py-1.5 text-[10.5px] text-muted-foreground">Showing the first {rows.length} rows.</p>
      ) : null}
    </div>
  );
}
