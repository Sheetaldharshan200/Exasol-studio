import { useCallback, useRef, useState } from "react";
import { ChevronDown, Loader2, Play, Plus, Trash2 } from "lucide-react";
import { errorMessage, ipc, type StatementResult } from "@/lib/ipc";
import { cn } from "@/lib/utils";

type Cell = {
  id: string;
  sql: string;
  running: boolean;
  result: StatementResult | null;
  error: string | null;
  ranAt: number | null;
};

let cellSeq = 0;
const newCell = (sql = ""): Cell => ({ id: `c${++cellSeq}-${Math.random().toString(36).slice(2, 6)}`, sql, running: false, result: null, error: null, ranAt: null });

/**
 * A Colab-style SQL notebook: independent cells you write and run against the
 * connection, each showing its own scrollable result grid. Add a cell below any
 * result and keep exploring — the workspace equivalent of a data notebook.
 */
export function NotebookTab({ profileId, connectionName }: { profileId: string | null; connectionName: string }) {
  const [cells, setCells] = useState<Cell[]>(() => [newCell()]);
  const runningAll = useRef(false);

  const patch = useCallback((id: string, p: Partial<Cell>) => {
    setCells((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));
  }, []);

  const runCell = useCallback(
    async (id: string, sql: string) => {
      if (!profileId) {
        patch(id, { error: "Connect to a database first.", result: null });
        return;
      }
      if (!sql.trim()) return;
      patch(id, { running: true, error: null });
      try {
        const res = await ipc.executeSql(profileId, connectionName, sql, 1000, false);
        const r = res.results[res.results.length - 1] ?? null;
        patch(id, { running: false, result: r, error: r?.error ?? null, ranAt: Date.now() });
      } catch (e) {
        patch(id, { running: false, error: errorMessage(e), result: null });
      }
    },
    [profileId, connectionName, patch],
  );

  function addCellAfter(id: string) {
    setCells((cs) => {
      const i = cs.findIndex((c) => c.id === id);
      const next = [...cs];
      next.splice(i + 1, 0, newCell());
      return next;
    });
  }
  function removeCell(id: string) {
    setCells((cs) => (cs.length === 1 ? [newCell()] : cs.filter((c) => c.id !== id)));
  }
  async function runAll() {
    if (runningAll.current) return;
    runningAll.current = true;
    for (const c of cells) if (c.sql.trim()) await runCell(c.id, c.sql);
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
            onClick={() => setCells((cs) => [...cs, newCell()])}
            className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85"
          >
            <Plus className="h-3.5 w-3.5" /> Cell
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-width:thin]">
        <div className="mx-auto flex max-w-4xl flex-col gap-3">
          {cells.map((cell, i) => (
            <CellView
              key={cell.id}
              index={i + 1}
              cell={cell}
              onChange={(sql) => patch(cell.id, { sql })}
              onRun={() => void runCell(cell.id, cell.sql)}
              onAddBelow={() => addCellAfter(cell.id)}
              onRemove={() => removeCell(cell.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CellView({
  index,
  cell,
  onChange,
  onRun,
  onAddBelow,
  onRemove,
}: {
  index: number;
  cell: Cell;
  onChange: (sql: string) => void;
  onRun: () => void;
  onAddBelow: () => void;
  onRemove: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="group/cell overflow-hidden rounded-xl border border-border bg-panel/40">
      {/* Editor row */}
      <div className="flex items-stretch">
        <div className="flex w-10 shrink-0 flex-col items-center gap-1 border-r border-border/60 py-2 font-mono text-[10px] text-muted-foreground">
          <span>[{index}]</span>
        </div>
        <textarea
          value={cell.sql}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              onRun();
            }
          }}
          rows={Math.min(12, Math.max(2, cell.sql.split("\n").length))}
          spellCheck={false}
          placeholder="SELECT * FROM …   ·   ⌘/Ctrl+Enter to run"
          className="min-w-0 flex-1 resize-none bg-transparent px-3 py-2 font-mono text-[12.5px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50 [scrollbar-width:thin]"
        />
        <div className="flex shrink-0 flex-col items-center gap-1 p-1.5">
          <button
            onClick={onRun}
            disabled={cell.running}
            title="Run (⌘/Ctrl+Enter)"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
          >
            {cell.running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onRemove}
            title="Delete cell"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/cell:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Result */}
      {cell.error ? (
        <div className="border-t border-border bg-destructive/5 px-3 py-2 font-mono text-[11.5px] text-destructive [overflow-wrap:anywhere]">
          {cell.error}
        </div>
      ) : cell.result ? (
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

      {/* Add-below affordance */}
      <button
        onClick={onAddBelow}
        className="flex w-full items-center justify-center gap-1 border-t border-border/60 py-1 text-[10.5px] text-muted-foreground opacity-0 transition-opacity hover:bg-secondary/40 hover:text-foreground group-hover/cell:opacity-100"
      >
        <Plus className="h-3 w-3" /> Cell below
      </button>
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
                  className={cn(
                    "max-w-[360px] truncate border-b border-border/40 px-2.5 py-1 whitespace-nowrap",
                    v === null && "text-muted-foreground/50 italic",
                  )}
                  title={v === null ? "NULL" : String(v)}
                >
                  {v === null ? "NULL" : String(v)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 1} className="px-3 py-4 text-center text-muted-foreground">
                No rows.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {truncated ? (
        <p className="border-t border-border px-3 py-1.5 text-[10.5px] text-muted-foreground">
          Showing the first {rows.length} rows.
        </p>
      ) : null}
    </div>
  );
}
