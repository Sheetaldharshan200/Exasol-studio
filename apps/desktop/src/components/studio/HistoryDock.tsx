/**
 * The studio's results-and-history dock: the run-status strip, the results
 * grid, the git log pane, and the collapsible history dock with its sortable
 * execution log.
 *
 * Extracted from ExasolStudio.tsx, where these ~650 lines sat inline in a
 * ~5,000-line shell. They depend on the shell only through props plus the
 * shared SqlTab type and IconButton, so they move as a unit.
 */
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleSlash2,
  GitCommitHorizontal,
  History,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  SquareTerminal,
  Table2,
  Terminal,
  Trash2,
  X,
} from "lucide-react";

import { CopyButton } from "@/components/ui/copy-button";
import { EditableResultGrid } from "@/features/workbench/EditableResultGrid";
import { TerminalView } from "@/features/workbench/TerminalView";
import { ipc } from "@/lib/ipc";
import type { ExecuteResponse, GitLogEntry, HistoryEntry, StatementResult } from "@/lib/ipc";
import { fmtClock } from "@/lib/sql-text";
import { cellText, filterRows } from "@/lib/result-stats";
import { termBusReady } from "@/lib/term-bus";
import { cn } from "@/lib/utils";
import { IconButton } from "./IconButton";
import type { SqlTab } from "./tabs";

/** Execution lifecycle: Started → Running (live) → Completed/Failed, with timestamps. */
export function RunStatusStrip({
  meta,
  response,
}: {
  meta?: SqlTab["runMeta"];
  response: ExecuteResponse | null;
}) {
  const running = Boolean(meta && !meta.finishedAt);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => tick((n) => n + 1), 100);
    return () => window.clearInterval(t);
  }, [running]);
  if (!meta) return null;
  const elapsedMs = (meta.finishedAt ?? Date.now()) - meta.startedAt;
  const dur = elapsedMs < 10_000 ? `${Math.round(elapsedMs)} ms` : `${(elapsedMs / 1000).toFixed(1)} s`;
  const stmts = response?.results.length ?? 0;
  const rows = response?.results.reduce((a, r) => a + r.rowCount, 0) ?? 0;
  return (
    <div className="flex shrink-0 items-center gap-3 overflow-x-auto border-b border-border bg-panel/40 px-3 py-1 font-mono text-[10.5px] whitespace-nowrap text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <span>
        Started {fmtClock(meta.startedAt)} · {meta.scope}
      </span>
      {running ? (
        <span className="flex items-center gap-1 text-primary">
          <Loader2 className="h-3 w-3 animate-spin" /> Running… {(elapsedMs / 1000).toFixed(1)}s
        </span>
      ) : (
        <span className={meta.ok ? "text-primary" : "text-destructive"}>
          {meta.ok ? "✓ Completed" : "✗ Failed"} {fmtClock(meta.finishedAt!)} · {dur}
          {meta.ok && stmts > 0
            ? ` · ${stmts} statement${stmts === 1 ? "" : "s"} · ${rows} row${rows === 1 ? "" : "s"}`
            : ""}
        </span>
      )}
    </div>
  );
}

export function ResultsGrid({
  result,
  error,
  editable,
  onOpenSql,
  onCommitEdits,
  editBusy,
  fontSize = 12,
  zebra = true,
  filterQuery,
  onCellClick,
  selected,
  hideToolbar = false,
}: {
  result: StatementResult | null;
  error: string | null;
  /** Present when this result maps to a single updatable table. */
  editable?: { schema?: string; table: string; pk: string[]; columns: string[] } | null;
  onOpenSql?: (sql: string, title?: string) => void;
  onCommitEdits?: (statements: string[]) => Promise<{ ok: boolean; error?: string; failedSql?: string }>;
  editBusy?: boolean;
  fontSize?: number;
  zebra?: boolean;
  /** Client-side substring filter applied to the read-only rows (empty = all). */
  filterQuery?: string;
  /** Single-click a data cell to inspect it. Row/col index into the DISPLAYED
   *  (post-filter) rows. */
  onCellClick?: (info: { value: unknown; column: string; row: number; col: number }) => void;
  /** The currently inspected cell (display indices), highlighted. */
  selected?: { row: number; col: number } | null;
  /** Hide the internal toolbar (Edit data + count) when the parent shows its own. */
  hideToolbar?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  // The cell the user double-tapped — edit mode opens with THAT cell focused.
  const [focusCell, setFocusCell] = useState<{ row: number; col: number } | null>(null);
  // Column widths captured from the read-only table the moment editing starts,
  // so the editable grid renders with IDENTICAL geometry (no resize jump).
  const roTableRef = useRef<HTMLTableElement | null>(null);
  const [editColWidths, setEditColWidths] = useState<number[] | null>(null);
  const startEditing = (cell: { row: number; col: number } | null) => {
    const ths = roTableRef.current?.querySelectorAll("thead th");
    setEditColWidths(ths ? Array.from(ths).map((th) => (th as HTMLElement).offsetWidth) : null);
    setFocusCell(cell);
    setEditing(true);
  };
  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-lg rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
            <CircleSlash2 className="h-4 w-4 text-destructive" /> Statement failed
          </div>
          <pre className="font-mono text-xs whitespace-pre-wrap text-muted-foreground">{error}</pre>
        </div>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <Table2 className="h-6 w-6 opacity-40" />
        <p className="text-sm">Run a statement to see results here.</p>
      </div>
    );
  }
  if (result.kind === "rowCount") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <span className="rounded-md bg-secondary px-3 py-1.5">
          {result.rowCount} row{result.rowCount === 1 ? "" : "s"} affected · {result.elapsedMs} ms
        </span>
      </div>
    );
  }
  const canEdit = Boolean(editable && (onOpenSql || onCommitEdits));
  if (editing && editable && (onOpenSql || onCommitEdits)) {
    return (
      <EditableResultGrid
        columns={result.columns}
        rows={result.rows}
        schema={editable.schema}
        table={editable.table}
        pk={editable.pk}
        catalogColumns={editable.columns}
        initialFocus={focusCell}
        colWidths={editColWidths}
        onOpenSql={onOpenSql}
        onApply={onCommitEdits}
        onExit={() => {
          setEditing(false);
          setFocusCell(null);
        }}
      />
    );
  }
  const filterActive = Boolean(filterQuery && filterQuery.trim());
  const filtered = filterActive ? filterRows(result.rows, filterQuery!) : result.rows;
  // Editing addresses unfiltered `result.rows`, but the grid shows filtered
  // display indices — so double-click-to-edit is only safe when no filter is
  // active. Clear the filter to edit.
  const editableNow = canEdit && !filterActive;
  return (
    <div className="flex h-full flex-col">
      {hideToolbar ? null : (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1">
          {canEdit ? (
            <button
              onClick={() => startEditing(null)}
              title={`Edit rows in ${editable!.table}`}
              className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit data
            </button>
          ) : null}
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            {result.rowCount} row{result.rowCount === 1 ? "" : "s"} · {result.elapsedMs} ms
          </span>
        </div>
      )}
      <div className="h-full min-h-0 flex-1 overflow-auto" style={{ fontSize }}>
        {/* border-separate (NOT collapse) so the sticky header cells carry their
            own opaque background + border — with border-collapse the row bg and
            borders stay behind and scrolling rows show through the header. */}
        <table ref={roTableRef} className="w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="border-y border-r border-l border-border bg-secondary px-2 py-1.5 text-right font-mono text-[10px] text-muted-foreground">
                #
              </th>
              {result.columns.map((col) => (
                <th
                  key={col.name}
                  className="border-y border-r border-border bg-secondary px-3 py-1.5 text-left font-medium text-foreground"
                >
                  {col.name}
                  <span className="ml-1.5 font-mono text-[10px] font-normal text-muted-foreground">
                    {col.typeName}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={result.columns.length + 1}
                  className="border-r border-b border-l border-border px-3 py-4 text-center text-[11px] text-muted-foreground"
                >
                  {filterActive ? <>No rows match “{filterQuery}”.</> : "No rows found."}
                </td>
              </tr>
            ) : (
              filtered.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  title={editableNow ? "Double-click a cell to edit it" : undefined}
                  className={cn("hover:bg-accent/60", zebra && "even:bg-secondary/30", editableNow && "cursor-cell")}
                >
                  <td className="border-r border-b border-l border-border px-2 py-1 text-right text-[10px] text-muted-foreground">
                    {rowIndex + 1}
                  </td>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      onClick={onCellClick ? () => onCellClick({ value: cell, column: result.columns[cellIndex]?.name ?? "", row: rowIndex, col: cellIndex }) : undefined}
                      onDoubleClick={editableNow ? () => startEditing({ row: rowIndex, col: cellIndex }) : undefined}
                      className={cn(
                        "max-w-[380px] truncate border-r border-b border-border px-3 py-1 text-foreground",
                        onCellClick && "cursor-pointer",
                        selected && selected.row === rowIndex && selected.col === cellIndex && "bg-primary/15 ring-1 ring-inset ring-primary/40",
                      )}
                    >
                      {cell === null ? <span className="text-muted-foreground italic">null</span> : cellText(cell)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Recent git commits, shown to the right of SQL history. Refreshes when the
 *  workspace changes (agent auto-commit, manual commit). */
function GitLogPane() {
  const [log, setLog] = useState<GitLogEntry[] | null>(null);
  const [isRepo, setIsRepo] = useState(true);
  useEffect(() => {
    const load = () => {
      ipc.gitStatus()
        .then((s) => {
          setIsRepo(s.isRepo);
          if (s.isRepo) ipc.gitLog(80).then(setLog).catch(() => setLog([]));
          else setLog([]);
        })
        .catch(() => setLog([]));
    };
    load();
    window.addEventListener("studio:git-changed", load);
    return () => window.removeEventListener("studio:git-changed", load);
  }, []);
  return (
    <div className="flex w-72 shrink-0 flex-col border-l border-border bg-panel/30">
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border/60 px-2.5">
        <GitCommitHorizontal className="h-3.5 w-3.5 text-primary" />
        <span className="text-[9.5px] font-semibold tracking-wider text-muted-foreground uppercase">Git log</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
        {log === null ? (
          <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /></div>
        ) : !isRepo ? (
          <p className="px-3 py-3 text-[11px] text-muted-foreground">Not a git repo yet — commits appear here once the workspace is versioned.</p>
        ) : log.length === 0 ? (
          <p className="px-3 py-3 text-[11px] text-muted-foreground">No commits yet.</p>
        ) : (
          <ul className="py-0.5">
            {log.map((c) => (
              <li key={c.hash} className="border-b border-border/40 px-2.5 py-1.5 last:border-0">
                <div className="truncate text-[11.5px] text-foreground" title={c.subject}>{c.subject}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="font-mono text-primary">{c.hash.slice(0, 7)}</span>
                  <span className="truncate">{c.author}</span>
                  <span className="ml-auto shrink-0">{c.relative}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type LogSortKey = "time" | "status" | "command" | "exec" | "fetch" | "rows" | "message" | "sql";

function LogTable({ entries, onOpenSql }: { entries: HistoryEntry[]; onOpenSql: (sql: string) => void }) {
  const [sort, setSort] = useState<{ key: LogSortKey; dir: 1 | -1 }>({ key: "time", dir: -1 });
  const [detail, setDetail] = useState<{ label: string; value: string; mono: boolean; sql?: string } | null>(null);

  const verb = (e: HistoryEntry) => (e.sql.trim().match(/^[a-zA-Z]+/)?.[0] ?? "SQL").toUpperCase();
  const sortVal = (e: HistoryEntry, key: LogSortKey): string | number => {
    switch (key) {
      case "time": return e.executedAt;
      case "status": return e.success ? 1 : 0;
      case "command": return verb(e);
      case "exec": return e.execMs ?? e.elapsedMs;
      case "fetch": return e.fetchMs ?? -1;
      case "rows": return e.rowCount;
      case "message": return e.error ?? "";
      case "sql": return e.sql;
    }
  };
  const sorted = [...entries].sort((a, b) => {
    const va = sortVal(a, sort.key);
    const vb = sortVal(b, sort.key);
    const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
    return cmp * sort.dir;
  });
  const flip = (key: LogSortKey) =>
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === 1 ? -1 : 1 } : { key, dir: key === "time" ? -1 : 1 }));

  const HEADERS: { key: LogSortKey; label: string; width?: number | string; right?: boolean }[] = [
    { key: "time", label: "Time", width: 78 },
    { key: "status", label: "Status", width: 84 },
    { key: "command", label: "Command", width: 92 },
    { key: "exec", label: "Exec", width: 74, right: true },
    { key: "fetch", label: "Fetch", width: 74, right: true },
    { key: "rows", label: "Rows", width: 76, right: true },
    { key: "message", label: "Message", width: "30%" },
    { key: "sql", label: "SQL" },
  ];
  const ms = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v.toLocaleString()} ms`);
  const cellBtn = "block w-full cursor-pointer px-2.5 py-1.5 text-left hover:bg-accent/60";
  const openDetail = (label: string, value: string, mono = false, sql?: string) => setDetail({ label, value, mono, sql });

  return (
    <>
      <table className="w-full table-fixed border-separate border-spacing-0 text-[12px]">
        <colgroup>
          {HEADERS.map((h) => (
            <col key={h.key} style={h.width ? { width: h.width } : undefined} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr className="text-left text-muted-foreground">
            {HEADERS.map((h) => (
              <th key={h.key} className="border-r border-b border-border bg-secondary p-0 font-medium last:border-r-0">
                <button
                  onClick={() => flip(h.key)}
                  className={cn(
                    "flex w-full items-center gap-1 px-2.5 py-1.5 hover:text-foreground",
                    h.right && "justify-end",
                    sort.key === h.key && "text-foreground",
                  )}
                >
                  {h.label}
                  {sort.key === h.key ? (
                    sort.dir === 1 ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  ) : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => {
            const rows = e.truncated ? `${e.rowCount.toLocaleString()}+` : e.rowCount.toLocaleString();
            const summary =
              `${e.success ? "Success" : "Failed"} · ${verb(e)}${e.statementCount > 1 ? ` ×${e.statementCount}` : ""} · ` +
              `${new Date(e.executedAt).toLocaleString()} · ${e.connectionName}`;
            return (
              <tr key={e.id} className="align-top">
                <td className="border-r border-b border-border p-0 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                  <button className={cellBtn} onClick={() => openDetail("Executed at", `${new Date(e.executedAt).toLocaleString()}\n\n${summary}`)}>
                    {new Date(e.executedAt).toLocaleTimeString()}
                  </button>
                </td>
                <td className="border-r border-b border-border p-0">
                  <button className={cellBtn} onClick={() => openDetail("Status", e.success ? `Success\n\n${summary}` : `Failed\n\n${e.error ?? ""}\n\n${summary}`)}>
                    <span className={cn("flex w-fit items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium", e.success ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive")}>
                      {e.success ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                      {e.success ? "Success" : "Failed"}
                    </span>
                  </button>
                </td>
                <td className="border-r border-b border-border p-0 font-mono text-[11px] text-muted-foreground">
                  <button className={cellBtn} onClick={() => openDetail("Command", `${verb(e)}${e.statementCount > 1 ? ` — ${e.statementCount} statements in this run` : ""}\n\n${summary}`)}>
                    {verb(e)}{e.statementCount > 1 ? ` ×${e.statementCount}` : ""}
                  </button>
                </td>
                <td className="border-r border-b border-border p-0 font-mono text-muted-foreground whitespace-nowrap">
                  <button className={cn(cellBtn, "text-right")} onClick={() => openDetail("Execution time", `Exec ${ms(e.execMs ?? e.elapsedMs)} — until the server answered.\nFetch ${ms(e.fetchMs)} — streaming the rows.\nTotal ${ms(e.elapsedMs)}.\n\n${summary}`)}>
                    {ms(e.execMs ?? e.elapsedMs)}
                  </button>
                </td>
                <td className="border-r border-b border-border p-0 font-mono text-muted-foreground whitespace-nowrap">
                  <button className={cn(cellBtn, "text-right")} onClick={() => openDetail("Fetch time", `Fetch ${ms(e.fetchMs)} — time spent streaming rows after execution.\nExec ${ms(e.execMs ?? e.elapsedMs)} · Total ${ms(e.elapsedMs)}.\n\n${summary}`)}>
                    {ms(e.fetchMs)}
                  </button>
                </td>
                <td className="border-r border-b border-border p-0 font-mono">
                  <button
                    className={cn(cellBtn, "text-right")}
                    title={e.truncated ? "The row cap was hit — the query matched more rows than were fetched" : undefined}
                    onClick={() => openDetail("Rows", e.truncated ? `${e.rowCount.toLocaleString()} rows fetched — the row cap was hit, so the query matched MORE rows than this. Use the result pager or a LIMIT to walk the rest.\n\n${summary}` : `${e.rowCount.toLocaleString()} rows.\n\n${summary}`)}
                  >
                    {rows}
                  </button>
                </td>
                <td className="border-r border-b border-border p-0">
                  <button
                    className={cn(cellBtn, "truncate text-[11.5px] leading-snug", e.error ? "text-destructive" : "text-muted-foreground")}
                    onClick={() => openDetail("Message", e.error ?? "No message — the run completed without errors.", false, e.error ? e.sql : undefined)}
                  >
                    {e.error ?? "—"}
                  </button>
                </td>
                <td className="border-b border-border p-0 font-mono text-foreground">
                  <button className={cn(cellBtn, "truncate")} title="Open this SQL in a query tab" onClick={() => onOpenSql(e.sql)}>
                    {e.sql.replace(/\s+/g, " ").trim()}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setDetail(null)}>
          <div
            className="flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
              <span className="text-[12px] font-medium text-foreground">{detail.label}</span>
              <div className="flex items-center gap-1">
                <CopyButton text={detail.value} className="h-7 w-7" />
                <IconButton label="Close" onClick={() => setDetail(null)}>
                  <X className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            </div>
            <div className={cn("min-h-0 flex-1 overflow-auto px-3 py-2.5 text-[12px] leading-relaxed whitespace-pre-wrap break-words", detail.mono && "font-mono")}>
              {detail.value}
            </div>
            {detail.sql ? (
              <div className="shrink-0 border-t border-border px-3 py-2">
                <button
                  onClick={() => { onOpenSql(detail.sql!); setDetail(null); }}
                  className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-[11.5px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <Pencil className="h-3 w-3" /> Open the SQL in a query tab
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

export function HistoryDock({
  entries,
  open,
  onToggle,
  onPick,
  onClear,
  onRefresh,
}: {
  entries: HistoryEntry[];
  open: boolean;
  onToggle: () => void;
  onPick: (sql: string) => void;
  onClear: () => void;
  onRefresh: () => void;
}) {
  const [mode, setMode] = useState<"terminal" | "history">("history");
  // Drag-resizable like VS Code: panel height (top edge) and terminals-rail
  // width (inner edge), both remembered across restarts.
  const [height, setHeight] = useState(() => Number(localStorage.getItem("studio.dock.h")) || 240);
  const [railW, setRailW] = useState(() => Number(localStorage.getItem("studio.dock.railW")) || 160);
  function dragAxis(e: React.PointerEvent, axis: "y" | "x") {
    e.preventDefault();
    const startPos = axis === "y" ? e.clientY : e.clientX;
    const startVal = axis === "y" ? height : railW;
    const move = (ev: PointerEvent) => {
      const delta = startPos - (axis === "y" ? ev.clientY : ev.clientX);
      if (axis === "y") setHeight(Math.min(Math.max(startVal + delta, 120), Math.round(window.innerHeight * 0.8)));
      else setRailW(Math.min(Math.max(startVal + delta, 120), 480));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = axis === "y" ? "row-resize" : "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  useEffect(() => localStorage.setItem("studio.dock.h", String(height)), [height]);
  useEffect(() => localStorage.setItem("studio.dock.railW", String(railW)), [railW]);
  // VS Code-style terminal instances: right-side list, + to create, per-
  // terminal scrollback kept alive (hidden, not unmounted) when switching.
  const termCounter = useRef(0);
  const [terms, setTerms] = useState<{ id: number; pty: number; name: string }[]>([]);
  const [activeTerm, setActiveTerm] = useState(0);
  async function newTerminal() {
    try {
      await termBusReady(); // listener first, so the shell's first prompt isn't lost
      const pty = await invoke<number>("term_create", { cols: 100, rows: 24 });
      termCounter.current += 1;
      const id = termCounter.current;
      setTerms((l) => [...l, { id, pty, name: `zsh ${id}` }]);
      setActiveTerm(id);
      setMode("terminal");
    } catch {
      /* pty failed — nothing to add */
    }
  }
  function killTerminal(id: number) {
    const victim = terms.find((x) => x.id === id);
    if (victim) void invoke("term_kill", { id: victim.pty }).catch(() => undefined);
    setTerms((l) => {
      const next = l.filter((x) => x.id !== id);
      if (id === activeTerm && next.length) setActiveTerm(next[next.length - 1].id);
      return next;
    });
  }
  // First open of the terminal tab spawns the first shell.
  useEffect(() => {
    if (open && mode === "terminal" && terms.length === 0) void newTerminal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);
  // VS Code-style bottom panel: uppercase tab strip in the header, active tab
  // underlined; actions on the right are contextual to the active tab.
  const TABS: { id: "terminal" | "history"; label: string }[] = [
    { id: "terminal", label: "Terminal" },
    { id: "history", label: "SQL History" },
  ];
  return (
    <section
      className="relative flex min-h-0 flex-col border-t border-border bg-panel"
      style={{ height: open ? height : 36 }}
    >
      {open ? (
        <div
          onPointerDown={(e) => dragAxis(e, "y")}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize panel"
          className="absolute inset-x-0 -top-0.5 z-20 h-1.5 cursor-row-resize hover:bg-primary/40"
        />
      ) : null}
      <div className={cn("flex h-9 shrink-0 items-center justify-between pr-1 pl-2", open && "border-b border-border")}>
        <div className="flex h-full items-center gap-1">
          <button
            onClick={onToggle}
            aria-label={open ? "Collapse panel" : "Expand panel"}
            className="flex items-center rounded-md px-1 py-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
          </button>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                if (!open) onToggle();
                setMode(tab.id);
              }}
              className={cn(
                "relative flex h-full items-center gap-1.5 px-2 text-[10.5px] font-medium tracking-wider uppercase",
                open && mode === tab.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.id === "history" ? (
                <span className="rounded-full bg-secondary px-1.5 py-px font-mono text-[9.5px] normal-case text-muted-foreground">
                  {entries.length}
                </span>
              ) : null}
              {open && mode === tab.id ? (
                <span className="absolute inset-x-2 bottom-0 h-px bg-primary" />
              ) : null}
            </button>
          ))}
        </div>
        {open ? (
          <div className="flex items-center gap-0.5">
            {mode === "history" ? (
              <>
                <IconButton label="Refresh history" onClick={onRefresh}>
                  <RefreshCcw className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton label="Clear history" onClick={onClear}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              </>
            ) : (
              <IconButton label="New terminal" onClick={() => void newTerminal()}>
                <Plus className="h-3.5 w-3.5" />
              </IconButton>
            )}
          </div>
        ) : null}
      </div>
      <div className={cn("min-h-0 flex-1 overflow-auto", !open && "hidden")}>
        {mode === "terminal" ? (
          <div className="flex h-full min-h-0">
            <div className="min-w-0 flex-1">
              {terms.map((tm) => (
                <div key={tm.id} className={cn("h-full", tm.id !== activeTerm && "hidden")}>
                  <TerminalView ptyId={tm.pty} active={tm.id === activeTerm} />
                </div>
              ))}
            </div>
            <div
              onPointerDown={(e) => dragAxis(e, "x")}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize terminals list"
              className="z-10 -mr-1 w-1.5 shrink-0 cursor-col-resize hover:bg-primary/40"
            />
            <div className="flex shrink-0 flex-col border-l border-border bg-panel/70" style={{ width: railW }}>
              <div className="flex h-7 shrink-0 items-center border-b border-border/60 px-2">
                <span className="text-[9.5px] font-medium tracking-wider text-muted-foreground uppercase">Terminals</span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto py-0.5">
                {terms.map((tm) => (
                  <div
                    key={tm.id}
                    onClick={() => setActiveTerm(tm.id)}
                    className={cn(
                      "group flex cursor-pointer items-center gap-1.5 px-2 py-1 text-[11.5px]",
                      tm.id === activeTerm
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                    )}
                  >
                    <SquareTerminal className="h-3.5 w-3.5 shrink-0 text-primary/80" />
                    <span className="min-w-0 flex-1 truncate font-mono">{tm.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        killTerminal(tm.id);
                      }}
                      aria-label={`Kill ${tm.name}`}
                      className="rounded p-0.5 opacity-0 hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          // SQL history on the left, git commit log on the right.
          <div className="flex h-full min-h-0">
            <div className="min-w-0 flex-1 overflow-auto [scrollbar-width:thin]">
              {entries.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No queries run yet.</div>
              ) : (
                // Execution log, DB-tool style: every run — success or failure —
                // in a proper cell grid. Headers sort (tap toggles asc/desc),
                // the SQL cell opens the statement in a query tab, and every
                // other cell expands into a detail view with the full value.
                <LogTable entries={entries} onOpenSql={onPick} />
              )}
            </div>
            <GitLogPane />
          </div>
        )}
      </div>
    </section>
  );
}
