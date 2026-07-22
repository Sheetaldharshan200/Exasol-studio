import { useCallback, useEffect, useRef, useState } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bold,
  ChevronDown,
  Code,
  Code2,
  Database,
  Eye,
  GripVertical,
  Heading,
  Italic,
  Link2,
  List,
  Loader2,
  Play,
  Plus,
  Share2,
  Sparkles,
  SquareCode,
  Table as TableIcon,
  Text as TextIcon,
  Trash2,
  Waypoints,
} from "lucide-react";
import { errorMessage, ipc, type StatementResult } from "@/lib/ipc";
import { SourceLogo } from "@/features/connection/SourceLogo";
import { MermaidView } from "@/features/workbench/MermaidView";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type CellType = "sql" | "markdown" | "mermaid";
const CELL_TYPES: { value: CellType; label: string; icon: typeof Code2 }[] = [
  { value: "sql", label: "SQL", icon: Code2 },
  { value: "markdown", label: "Markdown", icon: TextIcon },
  { value: "mermaid", label: "Mermaid", icon: Share2 },
];
type Cell = {
  id: string;
  type: CellType;
  src: string;
  running: boolean;
  result: StatementResult | null;
  error: string | null;
  count: number | null;
  editing: boolean;
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
  // Text/diagram cells are preview-first once they have content; SQL always edits.
  editing: type === "sql" ? true : !src,
});

export type NotebookConn = { id: string; name: string; host: string };

const NB_KEY = "studio.notebook.v1";

/**
 * The data notebook for analysts & scientists: connect one or more databases
 * (including cross-database virtual schemas), then explore with SQL + Markdown
 * cells — Monaco editing with Exasol autocompletion, per-cell AI assist, and
 * scrollable result grids.
 */
export function NotebookTab({
  profileId,
  connectionName,
  connections,
  editorTheme,
  beforeMount,
  onConnectDb,
  onAddVirtualSchema,
  onAsk,
}: {
  profileId: string | null;
  connectionName: string;
  connections: NotebookConn[];
  editorTheme: string;
  beforeMount: (m: Monaco) => void;
  onConnectDb: () => void;
  onAddVirtualSchema: () => void;
  onAsk: (text: string) => void;
}) {
  // Persist the notebook (cell type + source only) across restarts.
  const [cells, setCells] = useState<Cell[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(NB_KEY) ?? "[]") as { type: CellType; src: string }[];
      if (Array.isArray(raw) && raw.length) return raw.map((c) => mkCell(c.type, c.src));
    } catch {
      /* fresh */
    }
    return [mkCell("sql")];
  });
  useEffect(() => {
    const save = cells.map((c) => ({ type: c.type, src: c.src }));
    try {
      localStorage.setItem(NB_KEY, JSON.stringify(save));
    } catch {
      /* quota */
    }
  }, [cells]);
  const execCount = useRef(0);
  const runningAll = useRef(false);
  const [runQueue, setRunQueue] = useState<Set<string>>(new Set());

  // Pointer-based drag reorder of cells (HTML5 DnD is flaky in the webview).
  const drag = useRef<{ id: string; moved: boolean } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!drag.current) return;
      drag.current.moved = true;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-cell-id]");
      const over = el?.dataset.cellId;
      if (!over || over === drag.current.id) return;
      setCells((cs) => {
        const from = cs.findIndex((c) => c.id === drag.current!.id);
        const to = cs.findIndex((c) => c.id === over);
        if (from < 0 || to < 0 || from === to) return cs;
        const next = [...cs];
        const [m] = next.splice(from, 1);
        next.splice(to, 0, m);
        return next;
      });
    };
    const onUp = () => {
      drag.current = null;
      setDragId(null);
      document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

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
      if (cell.type === "markdown" || cell.type === "mermaid") {
        patch(id, { editing: false }); // render the preview
        return;
      }
      if (!profileId) {
        patch(id, { error: "Connect a database first (＋ above).", result: null });
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
    const order = cells.map((c) => c.id);
    setRunQueue(new Set(order)); // everyone queued…
    for (const id of order) {
      setRunQueue((q) => {
        const n = new Set(q);
        n.delete(id);
        return n;
      });
      await runCell(id); // …executed one by one, in order
    }
    setRunQueue(new Set());
    runningAll.current = false;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="font-heading text-[14px] font-bold text-foreground">Notebook</span>
        <span className="text-[11px] text-muted-foreground">Explore data with SQL &amp; Markdown</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setCells((cs) => [...cs, mkCell("sql")])} className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <Plus className="h-3.5 w-3.5" /> Cell
          </button>
          <button onClick={() => void runAll()} className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85">
            <Play className="h-3.5 w-3.5" /> Run all
          </button>
        </div>
      </header>

      {/* Sources bar — connect databases / virtual schemas to query here. */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border bg-panel/30 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Data sources</span>
        {connections.map((c) => (
          <span
            key={c.id}
            title={c.host}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11.5px]",
              c.id === profileId ? "border-primary/40 bg-primary/8 text-foreground" : "border-border text-muted-foreground",
            )}
          >
            <SourceLogo className="h-4 w-4 rounded" />
            <span className="max-w-[160px] truncate font-medium">{c.name}</span>
            <span className={cn("h-1.5 w-1.5 rounded-full", c.id === profileId ? "bg-primary" : "bg-muted-foreground/40")} />
          </span>
        ))}
        {/* Two prominent connect actions. */}
        <button onClick={onConnectDb} className="flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
          <Plus className="h-3.5 w-3.5" /> <Database className="h-3.5 w-3.5" /> Connect database
        </button>
        <button onClick={onAddVirtualSchema} className="flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-teal/60 hover:text-foreground">
          <Plus className="h-3.5 w-3.5" /> <Waypoints className="h-3.5 w-3.5 text-teal" /> Virtual schema
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-width:thin]">
        <div className="mx-auto flex max-w-4xl flex-col gap-2.5">
          {cells.map((cell, i) => (
            <CellView
              key={cell.id}
              cell={cell}
              first={i === 0}
              last={i === cells.length - 1}
              editorTheme={editorTheme}
              beforeMount={beforeMount}
              onChange={(src) => patch(cell.id, { src })}
              onRun={() => void runCell(cell.id)}
              onEdit={() => patch(cell.id, { editing: true })}
              onType={(t) => setType(cell.id, t)}
              onInsert={(w, t) => insert(cell.id, w, t)}
              onMove={(d) => move(cell.id, d)}
              onRemove={() => remove(cell.id)}
              onAsk={() => onAsk(cell.src)}
              queued={runQueue.has(cell.id)}
              dragging={dragId === cell.id}
              onGrip={() => {
                drag.current = { id: cell.id, moved: false };
                setDragId(cell.id);
                document.body.style.cursor = "grabbing";
              }}
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
  editorTheme,
  beforeMount,
  onChange,
  onRun,
  onEdit,
  onType,
  onInsert,
  onMove,
  onRemove,
  onAsk,
  queued,
  dragging,
  onGrip,
}: {
  cell: Cell;
  first: boolean;
  last: boolean;
  editorTheme: string;
  beforeMount: (m: Monaco) => void;
  onChange: (src: string) => void;
  onRun: () => void;
  onEdit: () => void;
  onType: (t: CellType) => void;
  onInsert: (where: "above" | "below", type: CellType) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onAsk: () => void;
  queued: boolean;
  dragging: boolean;
  onGrip: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [resultView, setResultView] = useState<"table" | "chart">("table");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const isSql = cell.type === "sql";
  const isMd = cell.type === "markdown";
  const isMermaid = cell.type === "mermaid";
  const rendered = (isMd || isMermaid) && !cell.editing;
  const lines = Math.min(18, Math.max(3, cell.src.split("\n").length));
  const editorHeight = lines * 19 + 16;

  // Wrap the current selection (or insert) — powers the Markdown toolbar.
  function surround(before: string, after = before, block = false) {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const sel = value.slice(s, e) || (block ? "" : "text");
    const pre = block && s > 0 && value[s - 1] !== "\n" ? "\n" : "";
    const next = value.slice(0, s) + pre + before + sel + after + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const caret = s + pre.length + before.length + sel.length;
      ta.setSelectionRange(caret, caret);
    });
  }

  return (
    <div data-cell-id={cell.id} className={cn("group/cell relative transition-opacity", dragging && "opacity-40")}>
      <InsertBar onAdd={() => onInsert("above", "sql")} className="-top-2.5" />

      <div className={cn("overflow-hidden rounded-lg border border-border bg-editor transition-colors", queued && "ring-2 ring-inset ring-primary/40")}>
        <div className="flex items-stretch">
          {/* Left-center gutter — the Jupyter [n] that turns into a Run button
              on hover (it's both the run control and the run indicator). */}
          <button
            onClick={onRun}
            disabled={cell.running}
            title={isSql ? "Run (⌘/Ctrl+Enter)" : "Render (⌘/Ctrl+Enter)"}
            className="group/run flex w-10 shrink-0 select-none items-center justify-center"
          >
            {cell.running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : (
              <>
                <span className="font-mono text-[10px] text-muted-foreground/70 group-hover/run:hidden">
                  {isSql ? `[${cell.count ?? " "}]` : "[ ]"}
                </span>
                <Play className="hidden h-3.5 w-3.5 fill-current text-primary group-hover/run:block" />
              </>
            )}
          </button>
          <div className="min-w-0 flex-1">
        {/* Cell header: type dropdown + (Markdown) format toolbar + (Text/Diagram) Preview|Code toggle. */}
        <div className="flex items-center gap-2 px-2 pt-1.5">
          <Select value={cell.type} onValueChange={(v) => onType(v as CellType)}>
            <SelectTrigger size="sm" className="h-6 w-[124px] text-[11.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CELL_TYPES.map((t) => {
                const I = t.icon;
                return (
                  <SelectItem key={t.value} value={t.value}>
                    <span className="flex items-center gap-1.5"><I className="h-3.5 w-3.5" /> {t.label}</span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {isMd && cell.editing ? (
            <div className="flex items-center gap-0.5">
              {([
                [Bold, "Bold", () => surround("**")],
                [Italic, "Italic", () => surround("_")],
                [Code, "Inline code", () => surround("`")],
                [SquareCode, "Code block", () => surround("```\n", "\n```", true)],
                [Heading, "Heading", () => surround("## ", "", true)],
                [List, "List", () => surround("- ", "", true)],
                [Link2, "Link", () => surround("[", "](https://)")],
              ] as const).map(([Icon, tip, fn], i) => (
                <button key={i} onClick={fn} title={tip} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground">
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          ) : null}
          {/* Preview ↔ Code toggle: markdown/diagram default to Preview so the
              user visualizes the result, not the raw markup. */}
          {isMd || isMermaid ? (
            <div className="ml-auto flex items-center gap-0.5 rounded-md bg-secondary/60 p-0.5">
              <button
                onClick={onRun}
                className={cn("flex h-5 items-center gap-1 rounded px-1.5 text-[10.5px]", !cell.editing ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                <Eye className="h-3 w-3" /> Preview
              </button>
              <button
                onClick={onEdit}
                className={cn("flex h-5 items-center gap-1 rounded px-1.5 text-[10.5px]", cell.editing ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                <Code className="h-3 w-3" /> Code
              </button>
            </div>
          ) : null}
        </div>

        {rendered && isMd ? (
              <div onDoubleClick={onEdit} className="md-body max-w-none cursor-text px-3 py-2 text-[13px] leading-relaxed">
                {cell.src.trim() ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: (props) => <img {...props} className="my-2 max-w-full rounded-md border border-border" alt={props.alt ?? ""} /> }}>
                    {cell.src}
                  </ReactMarkdown>
                ) : (
                  <span className="text-muted-foreground/50 italic">Empty text cell — double-click to edit</span>
                )}
              </div>
            ) : rendered && isMermaid ? (
              <div onDoubleClick={onEdit} className="cursor-text">
                <MermaidView code={cell.src} />
              </div>
            ) : isSql ? (
              // Monaco SQL cell — Exasol autocompletion comes from the app-global
              // completion provider on the shared monaco instance.
              <div style={{ height: editorHeight }} className="py-1">
                <Editor
                  height="100%"
                  defaultLanguage="sql"
                  theme={editorTheme}
                  beforeMount={beforeMount}
                  value={cell.src}
                  onChange={(v) => onChange(v ?? "")}
                  onMount={(ed, monaco) => {
                    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRun());
                  }}
                  options={{
                    fontFamily: "JetBrains Mono",
                    fontSize: 12.5,
                    minimap: { enabled: false },
                    lineNumbers: "off",
                    folding: false,
                    scrollBeyondLastLine: false,
                    renderLineHighlight: "none",
                    overviewRulerLanes: 0,
                    scrollbar: { vertical: "auto", horizontalScrollbarSize: 8, verticalScrollbarSize: 8 },
                    padding: { top: 6, bottom: 6 },
                    wordWrap: "on",
                    // Ensure Exasol autocompletion actually pops in cells.
                    quickSuggestions: { other: true, comments: false, strings: false },
                    suggestOnTriggerCharacters: true,
                    tabCompletion: "on",
                    fixedOverflowWidgets: true,
                  }}
                />
              </div>
            ) : (
              // Markdown / Mermaid source editor (preview-first: render on run).
              <textarea
                ref={taRef}
                value={cell.src}
                autoFocus
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); onRun(); } }}
                rows={lines}
                placeholder={isMermaid ? "graph TD; A[Start] --> B[Next]   ·   ⌘/Ctrl+Enter to render" : "# Markdown — images, tables, links   ·   ⌘/Ctrl+Enter to render"}
                className="min-w-0 w-full resize-none bg-transparent px-3 py-2 font-mono text-[12.5px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50 [scrollbar-width:thin]"
              />
            )}
          </div>

          <div className="flex shrink-0 flex-col items-center gap-0.5 p-1.5 opacity-0 transition-opacity group-hover/cell:opacity-100">
            <button
              onPointerDown={(e) => { e.preventDefault(); onGrip(); }}
              title="Drag to reorder"
              className="flex h-6 w-6 cursor-grab items-center justify-center rounded-md text-muted-foreground/60 hover:bg-secondary hover:text-foreground active:cursor-grabbing"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            {isSql ? (
              <button onClick={onAsk} title="Ask Exa about this SQL" className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
                <Sparkles className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <button onClick={() => onMove(-1)} disabled={first} title="Move up" className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
            <button onClick={() => onMove(1)} disabled={last} title="Move down" className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
            <button onClick={onRemove} title="Delete cell" className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>

        {isSql && cell.error ? (
          <div className="mx-2 mb-2 rounded-md bg-destructive/5 px-3 py-2 font-mono text-[11.5px] text-destructive [overflow-wrap:anywhere]">{cell.error}</div>
        ) : isSql && cell.result ? (
          <div className="px-1 pb-1">
            <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-muted-foreground">
              <button onClick={() => setCollapsed((v) => !v)} className="flex items-center gap-1 hover:text-foreground">
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", collapsed && "-rotate-90")} />
                {cell.result.kind === "rowCount" ? `${cell.result.rowCount} row(s) affected` : `${cell.result.rowCount} row${cell.result.rowCount === 1 ? "" : "s"}`}
              </button>
              {cell.result.kind === "resultSet" && cell.result.rows.length > 0 ? (
                <div className="flex items-center gap-0.5 rounded-md bg-background/60 p-0.5">
                  {(["table", "chart"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setResultView(v)}
                      className={cn("flex h-5 items-center gap-1 rounded px-1.5 text-[10.5px] capitalize", resultView === v ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
                    >
                      {v === "table" ? <TableIcon className="h-3 w-3" /> : <BarChart3 className="h-3 w-3" />} {v}
                    </button>
                  ))}
                </div>
              ) : null}
              <span className="ml-auto font-mono">{cell.result.elapsedMs} ms</span>
            </div>
            {!collapsed && cell.result.kind === "resultSet" ? (
              resultView === "chart" ? (
                <ResultChart columns={cell.result.columns} rows={cell.result.rows} />
              ) : (
                <ResultGrid columns={cell.result.columns} rows={cell.result.rows} truncated={cell.result.truncated} />
              )
            ) : null}
          </div>
        ) : null}
      </div>

      <InsertBar onAdd={() => onInsert("below", "sql")} className="-bottom-2.5" />
    </div>
  );
}

function InsertBar({ onAdd, className }: { onAdd: () => void; className?: string }) {
  return (
    <div className={cn("absolute inset-x-0 z-10 flex h-5 items-center justify-center gap-1 opacity-0 transition-opacity group-hover/cell:opacity-100", className)}>
      <span className="h-px flex-1 bg-border/60" />
      <button onClick={onAdd} title="Add a cell here" className="flex items-center gap-0.5 rounded border border-border bg-editor px-1.5 py-0.5 text-[9.5px] text-muted-foreground hover:text-foreground"><Plus className="h-2.5 w-2.5" /> Cell</button>
      <span className="h-px flex-1 bg-border/60" />
    </div>
  );
}

/** Quick bar/line chart of a result set: first non-numeric column = category
 *  (x), numeric columns = series. Lazy-loads echarts, theme-aware. */
function ResultChart({ columns, rows }: { columns: { name: string; typeName: string }[]; rows: unknown[][] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState<"bar" | "line">("bar");

  const isNum = (v: unknown) => v !== null && v !== "" && !Number.isNaN(Number(v));
  const numericCols = columns
    .map((c, i) => ({ c, i }))
    .filter(({ i }) => rows.slice(0, 20).every((r) => r[i] === null || isNum(r[i])) && rows.some((r) => isNum(r[i])));
  const catIdx = columns.findIndex((_, i) => !numericCols.some((n) => n.i === i));
  const xIdx = catIdx >= 0 ? catIdx : 0;

  useEffect(() => {
    if (!ref.current || !numericCols.length) return;
    let chart: import("echarts").ECharts | null = null;
    let disposed = false;
    void import("echarts").then((echarts) => {
      if (disposed || !ref.current) return;
      const dark = document.documentElement.classList.contains("dark");
      chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
      const cats = rows.slice(0, 200).map((r) => String(r[xIdx] ?? ""));
      const palette = ["#5fc33b", "#4a9fd4", "#e0a63a", "#c65fd0", "#e05f5f", "#2bb8a3"];
      chart.setOption({
        color: palette,
        grid: { top: 24, right: 16, bottom: 40, left: 52 },
        tooltip: { trigger: "axis" },
        legend: { top: 0, textStyle: { color: dark ? "#a1a1aa" : "#52525b", fontSize: 10 }, type: "scroll" },
        xAxis: { type: "category", data: cats, axisLabel: { color: dark ? "#a1a1aa" : "#52525b", fontSize: 10, rotate: cats.length > 8 ? 30 : 0 } },
        yAxis: { type: "value", axisLabel: { color: dark ? "#a1a1aa" : "#52525b", fontSize: 10 }, splitLine: { lineStyle: { color: dark ? "#27272a" : "#e4e4e7" } } },
        series: numericCols.map(({ c, i }) => ({
          name: c.name,
          type: kind,
          data: rows.slice(0, 200).map((r) => (isNum(r[i]) ? Number(r[i]) : null)),
          smooth: kind === "line",
          barMaxWidth: 28,
        })),
      });
    });
    const ro = new ResizeObserver(() => chart?.resize());
    ro.observe(ref.current);
    return () => {
      disposed = true;
      ro.disconnect();
      chart?.dispose();
    };
  }, [columns, rows, kind, xIdx, numericCols.length]);

  if (!numericCols.length) {
    return <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">No numeric columns to chart.</p>;
  }
  return (
    <div className="rounded-md bg-background/40 p-1">
      <div className="flex items-center gap-0.5 px-1 pb-0.5">
        {(["bar", "line"] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={cn("rounded px-1.5 py-0.5 text-[10.5px] capitalize", kind === k ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>{k}</button>
        ))}
        <span className="ml-1 text-[10px] text-muted-foreground/70">x: {columns[xIdx]?.name}</span>
      </div>
      <div ref={ref} style={{ height: 300 }} className="w-full" />
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
                <td key={ci} className={cn("max-w-[360px] truncate border-b border-border/40 px-2.5 py-1 whitespace-nowrap", v === null && "text-muted-foreground/50 italic")} title={v === null ? "NULL" : String(v)}>
                  {v === null ? "NULL" : String(v)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length + 1} className="px-3 py-4 text-center text-muted-foreground">No rows.</td></tr>
          ) : null}
        </tbody>
      </table>
      {truncated ? <p className="border-t border-border px-3 py-1.5 text-[10.5px] text-muted-foreground">Showing the first {rows.length} rows.</p> : null}
    </div>
  );
}
