import { Fragment, memo, useCallback, useEffect, useRef, useState } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { AgentMark } from "@/components/studio/AgentMark";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  ChevronDown,
  Code,
  Code2,
  Database,
  Download,
  Eye,
  GripVertical,
  Loader2,
  Pencil,
  Play,
  Plus,
  Share2,
  Table as TableIcon,
  Text as TextIcon,
  Trash2,
  Waypoints,
} from "lucide-react";
import { errorMessage, ipc, isTauri, type StatementResult } from "@/lib/ipc";
import { SourceLogo } from "@/features/connection/SourceLogo";
import { MermaidView } from "@/features/workbench/MermaidView";
import { ShadcnChartPanel } from "@/features/bi/ShadcnChartPanel";
import { ChartKindPicker, EchartsCell, KpiCell } from "@/features/workbench/cell-viz";
import { cellRenderer, resolveCellConnection, type CellViz } from "@/features/workbench/notebook-cell";
import { SYSTEM_DASHBOARDS } from "@/features/bi/system-dashboards";
import type { Dashboard } from "@/lib/agent-client";
import { MarkdownEditor } from "@/features/workbench/MarkdownEditor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dashboards } from "@/lib/agent-client";
import { Icon } from "@/components/ui/icon";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { buildNotebookMarkdown, buildNotebookHtml, printNotebookHtml, EXPORT_ALL, filterExportCells, type ExportCell, type ExportInclude } from "@/features/workbench/notebook-export";
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
  /** Chart type from an imported dashboard panel — the cell renders this
   *  visualization (not just a table) once it runs. */
  chart?: string;
  /** Which connected database this cell runs on (default: the active one). */
  connProfileId?: string;
  connName?: string;
  /** Field mapping / stacking / raw ECharts override from an imported panel. */
  viz?: CellViz;
};

let seq = 0;
const mkCell = (type: CellType = "sql", src = "", chart?: string): Cell => ({
  id: `c${++seq}-${Math.random().toString(36).slice(2, 6)}`,
  type,
  src,
  running: false,
  result: null,
  error: null,
  count: null,
  // Text/diagram cells are preview-first once they have content; SQL always edits.
  editing: type === "sql" ? true : !src,
  chart,
});

export type NotebookConn = { id: string; name: string; host: string };

// Persistence keys live in notebook-store.ts so other features (the chat's
// "Create notebook" card) can add notebooks without mounting this tab.
import { NB_ACTIVE_KEY, NB_KEY, NBS_KEY } from "./notebook-store";

type NotebookDoc = { id: string; title: string; cells: { type: CellType; src: string; chart?: string; connProfileId?: string; connName?: string; viz?: CellViz }[]; updatedAt: number };

/** Load all notebooks, migrating the legacy single notebook on first run. */
function loadNotebooks(): NotebookDoc[] {
  try {
    const raw = JSON.parse(localStorage.getItem(NBS_KEY) ?? "[]") as NotebookDoc[];
    if (Array.isArray(raw) && raw.length) return raw;
  } catch {
    /* fresh */
  }
  let cells: { type: CellType; src: string }[] = [{ type: "sql", src: "" }];
  try {
    const legacy = JSON.parse(localStorage.getItem(NB_KEY) ?? "[]") as { type: CellType; src: string }[];
    if (Array.isArray(legacy) && legacy.length) cells = legacy;
  } catch {
    /* none */
  }
  return [{ id: `nb-${Date.now().toString(36)}`, title: "Notebook 1", cells, updatedAt: Date.now() }];
}

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
  onAsk: (text: string, kind: CellType, chart?: string) => void;
}) {
  // Multiple named notebooks, all persisted. `cells` is the ACTIVE notebook's
  // working state; edits flow back into the store on an idle debounce.
  const [books, setBooks] = useState<NotebookDoc[]>(loadNotebooks);
  const [activeId, setActiveId] = useState<string>(() => {
    const saved = localStorage.getItem(NB_ACTIVE_KEY);
    const all = loadNotebooks();
    return all.some((b) => b.id === saved) ? (saved as string) : all[0].id;
  });
  const activeBook = books.find((b) => b.id === activeId) ?? books[0];
  const [cells, setCells] = useState<Cell[]>(() => {
    const b = loadNotebooks().find((x) => x.id === (localStorage.getItem(NB_ACTIVE_KEY) ?? "")) ?? loadNotebooks()[0];
    return b.cells.length ? b.cells.map((c) => ({ ...mkCell(c.type, c.src, c.chart), connProfileId: c.connProfileId, connName: c.connName, viz: c.viz })) : [mkCell("sql")];
  });
  const [renamingBook, setRenamingBook] = useState<string | null>(null);

  // Another feature created a notebook (the chat's "Create notebook" card):
  // reload the list and jump straight into the new active one.
  useEffect(() => {
    const onChanged = () => {
      const all = loadNotebooks();
      setBooks(all);
      const target = all.find((b) => b.id === localStorage.getItem(NB_ACTIVE_KEY)) ?? all[0];
      setActiveId(target.id);
      setCells(
        target.cells.length
          ? target.cells.map((c) => ({ ...mkCell(c.type, c.src, c.chart), connProfileId: c.connProfileId, connName: c.connName, viz: c.viz }))
          : [mkCell("sql")],
      );
    };
    window.addEventListener("studio:notebooks-changed", onChanged);
    return () => window.removeEventListener("studio:notebooks-changed", onChanged);
  }, []);

  // Persist on idle, not on every keystroke — a synchronous JSON.stringify +
  // localStorage write per character is a real typing-jank source.
  useEffect(() => {
    const t = setTimeout(() => {
      setBooks((bs) => {
        const next = bs.map((b) =>
          b.id === activeId ? { ...b, cells: cells.map((c) => ({ type: c.type, src: c.src, chart: c.chart, connProfileId: c.connProfileId, connName: c.connName, viz: c.viz })), updatedAt: Date.now() } : b,
        );
        try {
          localStorage.setItem(NBS_KEY, JSON.stringify(next));
        } catch {
          /* quota */
        }
        return next;
      });
    }, 400);
    return () => clearTimeout(t);
  }, [cells, activeId]);

  /** Switch to another notebook: flush the current cells, then load the target. */
  function openBook(id: string) {
    if (id === activeId) return;
    setBooks((bs) => {
      const next = bs.map((b) =>
        b.id === activeId ? { ...b, cells: cells.map((c) => ({ type: c.type, src: c.src, chart: c.chart, connProfileId: c.connProfileId, connName: c.connName, viz: c.viz })), updatedAt: Date.now() } : b,
      );
      const target = next.find((b) => b.id === id);
      setCells(target && target.cells.length ? target.cells.map((c) => ({ ...mkCell(c.type, c.src, c.chart), connProfileId: c.connProfileId, connName: c.connName, viz: c.viz })) : [mkCell("sql")]);
      try {
        localStorage.setItem(NBS_KEY, JSON.stringify(next));
      } catch {
        /* quota */
      }
      return next;
    });
    setActiveId(id);
    localStorage.setItem(NB_ACTIVE_KEY, id);
  }

  function newBook() {
    const id = `nb-${Date.now().toString(36)}`;
    const title = `Notebook ${books.length + 1}`;
    setBooks((bs) => [...bs, { id, title, cells: [{ type: "sql", src: "" }], updatedAt: Date.now() }]);
    openBook(id);
    setRenamingBook(id); // name it right away
  }

  function renameBook(id: string, title: string) {
    const t = title.trim();
    setBooks((bs) => {
      const next = bs.map((b) => (b.id === id && t ? { ...b, title: t, updatedAt: Date.now() } : b));
      try { localStorage.setItem(NBS_KEY, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
    setRenamingBook(null);
  }

  function deleteBook(id: string) {
    setBooks((bs) => {
      let next = bs.filter((b) => b.id !== id);
      if (!next.length) next = [{ id: `nb-${Date.now().toString(36)}`, title: "Notebook 1", cells: [{ type: "sql", src: "" }], updatedAt: Date.now() }];
      if (id === activeId) {
        const target = next[0];
        setActiveId(target.id);
        localStorage.setItem(NB_ACTIVE_KEY, target.id);
        setCells(target.cells.length ? target.cells.map((c) => ({ ...mkCell(c.type, c.src, c.chart), connProfileId: c.connProfileId, connName: c.connName, viz: c.viz })) : [mkCell("sql")]);
      }
      try { localStorage.setItem(NBS_KEY, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }
  const execCount = useRef(0);
  const runningAll = useRef(false);
  const [runQueue, setRunQueue] = useState<Set<string>>(new Set());

  // Pointer-based drag reorder of cells (HTML5 DnD is flaky in the webview).
  // A green insertion line marks where the cell will drop; the reorder is
  // committed on release, not live — so the target is always clear.
  const drag = useRef<{ id: string; moved: boolean } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: "above" | "below" } | null>(null);
  const dropTargetRef = useRef<{ id: string; pos: "above" | "below" } | null>(null);
  dropTargetRef.current = dropTarget;
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!drag.current) return;
      drag.current.moved = true;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-cell-id]");
      const over = el?.dataset.cellId;
      if (!over || over === drag.current.id) {
        setDropTarget(null);
        return;
      }
      const rect = el!.getBoundingClientRect();
      setDropTarget({ id: over, pos: e.clientY < rect.top + rect.height / 2 ? "above" : "below" });
    };
    const onUp = () => {
      const d = drag.current;
      const dt = dropTargetRef.current;
      if (d && dt && d.id !== dt.id) {
        setCells((cs) => {
          const from = cs.findIndex((c) => c.id === d.id);
          if (from < 0) return cs;
          const next = [...cs];
          const [m] = next.splice(from, 1);
          const t = next.findIndex((c) => c.id === dt.id);
          if (t < 0) return cs;
          next.splice(dt.pos === "below" ? t + 1 : t, 0, m);
          return next;
        });
      }
      drag.current = null;
      setDragId(null);
      setDropTarget(null);
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
      const resolved = resolveCellConnection(
        cell,
        profileId ? { profileId, name: connectionName } : null,
        connections.map((c) => ({ id: c.id, name: c.name })),
      );
      if (!resolved.ok) {
        patch(id, { error: resolved.error, result: null });
        return;
      }
      if (!cell.src.trim()) return;
      patch(id, { running: true, error: null });
      try {
        const res = await ipc.executeSql(resolved.conn.profileId, resolved.conn.name, cell.src, 1000, false);
        const r = res.results[res.results.length - 1] ?? null;
        patch(id, { running: false, result: r, error: r?.error ?? null, count: ++execCount.current });
      } catch (e) {
        patch(id, { running: false, error: errorMessage(e), result: null, count: ++execCount.current });
      }
    },
    [profileId, connectionName, connections, patch],
  );

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
    try {
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
    } finally {
      // A throw mid-run must never wedge the guard shut — that reads as
      // "the Run all button does nothing" forever after.
      setRunQueue(new Set());
      runningAll.current = false;
    }
  }
  // Run-all on request (the chat's "Create notebook" card runs + verifies the
  // fresh notebook automatically). Ref so the listener sees current cells.
  const runAllRef = useRef(runAll);
  runAllRef.current = runAll;
  useEffect(() => {
    const on = () => void runAllRef.current();
    window.addEventListener("studio:notebook-run-all", on);
    return () => window.removeEventListener("studio:notebook-run-all", on);
  }, []);

  // The assistant's "Apply" targets the pinned cell: write the SQL in, run it.
  useEffect(() => {
    const onApply = (e: Event) => {
      const d = (e as CustomEvent<{ cellId?: string; sql?: string }>).detail;
      if (!d?.cellId || !d.sql) return;
      let exists = false;
      setCells((cs) => {
        exists = cs.some((c) => c.id === d.cellId);
        return exists ? cs.map((c) => (c.id === d.cellId ? { ...c, src: d.sql! } : c)) : cs;
      });
      if (exists) window.setTimeout(() => void runCell(d.cellId!), 60);
    };
    window.addEventListener("studio:apply-to-cell", onApply);
    return () => window.removeEventListener("studio:apply-to-cell", onApply);
  }, [runCell]);

  const notify = (kind: "success" | "warning", title: string, body: string, go?: string) =>
    window.dispatchEvent(new CustomEvent("studio:notice", { detail: { kind, title, body, go } }));

  // Export the whole notebook — notes, SQL + result tables, and diagrams — as
  // one document (Markdown / self-contained HTML / PDF via the print dialog).
  const [exportInc, setExportInc] = useState<ExportInclude>({ ...EXPORT_ALL });
  async function doExport(kind: "markdown" | "html" | "pdf") {
    const exportCells: ExportCell[] = filterExportCells(
      cells.map((c) => ({ type: c.type, src: c.src, result: c.result })),
      exportInc,
    );
    const title = activeBook.title || "Exasol Notebook";
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "notebook";
    try {
      // Browser build: no native save dialog — hand the file to the browser's
      // own download flow (the Tauri dialog API throws in a plain web page).
      const download = (filename: string, text: string, mime: string) => {
        const url = URL.createObjectURL(new Blob([text], { type: mime }));
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        notify("success", "Notebook exported", `Downloaded ${filename}`);
      };
      if (kind === "markdown") {
        const md = buildNotebookMarkdown(title, exportCells);
        if (!isTauri()) { download(`${slug}.md`, md, "text/markdown"); return; }
        const path = await saveDialog({ defaultPath: `${slug}.md`, filters: [{ name: "Markdown", extensions: ["md"] }] });
        if (path) { await ipc.writeTextFile(path, md); notify("success", "Notebook exported", `Saved ${path}`, `file:${path}`); }
        return;
      }
      const html = await buildNotebookHtml(title, exportCells);
      if (kind === "html") {
        if (!isTauri()) { download(`${slug}.html`, html, "text/html"); return; }
        const path = await saveDialog({ defaultPath: `${slug}.html`, filters: [{ name: "HTML", extensions: ["html"] }] });
        if (path) { await ipc.writeTextFile(path, html); notify("success", "Notebook exported", `Saved ${path}`, `file:${path}`); }
      } else {
        printNotebookHtml(html);
        notify("success", "Print dialog opened", "Choose “Save as PDF”. No dialog? Export HTML and print from your browser.");
      }
    } catch (e) {
      notify("warning", "Export failed", errorMessage(e));
    }
  }

  // Import a dashboard's panels as cells: markdown panels → markdown cells,
  // query panels → SQL cells (titled with a comment). Ecosystem glue between
  // Dashboards and the Notebook.
  const [dashList, setDashList] = useState<{ id: string; title: string; panels: number }[] | null>(null);
  async function loadDashList() {
    try {
      const list = await dashboards.list();
      setDashList(list.map((d) => ({ id: d.id, title: d.title, panels: d.panels })));
    } catch {
      setDashList([]);
    }
  }
  /** Convert dashboard panels to notebook cells (markdown → markdown, query → SQL+chart). */
  function cellsFromDashboard(dash: Dashboard): Cell[] {
    const imported: Cell[] = [];
    imported.push(mkCell("markdown", `## ${dash.title}\n\n${dash.description || ""}`.trim()));
    for (const p of dash.panels) {
      if (p.viz.type === "markdown") {
        imported.push(mkCell("markdown", p.viz.content));
      } else if (p.query?.sql?.trim()) {
        const chart = p.viz.type === "echarts" ? ((p.viz as { chart?: string }).chart ?? "bar") : p.viz.type === "kpi" ? "kpi" : "table";
        const cell = mkCell("sql", `-- ${p.title || "Panel"}\n${p.query.sql.trim()}`, chart);
        if (p.viz.type === "echarts") {
          // Field mapping, stacking and raw option survive the import — a
          // custom-designed panel must render the same as it did before.
          const e = p.viz as { xField?: string; yFields?: string[]; stacked?: boolean; option?: Record<string, unknown> };
          if (e.xField || e.yFields || e.stacked || e.option) cell.viz = { xField: e.xField, yFields: e.yFields, stacked: e.stacked, option: e.option };
        }
        imported.push(cell);
      }
    }
    return imported;
  }

  /** System dashboards live in code — open one as its own auto-running
   *  notebook (regenerated on every open; edits belong in a copy). */
  function openSystemDashboard(factory: () => Dashboard) {
    const dash = factory();
    const title = `System · ${dash.title}`;
    const imported = cellsFromDashboard(dash);
    const existing = books.find((b) => b.title === title);
    const id = existing?.id ?? `nb-${Date.now().toString(36)}`;
    setBooks((bs) => {
      const withCurrent = bs.map((b) =>
        b.id === activeId ? { ...b, cells: cells.map((c) => ({ type: c.type, src: c.src, chart: c.chart, connProfileId: c.connProfileId, connName: c.connName, viz: c.viz })), updatedAt: Date.now() } : b,
      );
      const doc = { id, title, cells: imported.map((c) => ({ type: c.type, src: c.src, chart: c.chart, viz: c.viz })), updatedAt: Date.now() };
      const next = existing ? withCurrent.map((b) => (b.id === id ? doc : b)) : [...withCurrent, doc];
      try { localStorage.setItem(NBS_KEY, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
    setActiveId(id);
    localStorage.setItem(NB_ACTIVE_KEY, id);
    setCells(imported);
    if (profileId) {
      const ids = imported.filter((c) => c.type === "sql").map((c) => c.id);
      setTimeout(() => { void (async () => { for (const cid of ids) await runCell(cid); })(); }, 50);
    } else {
      notify("warning", "Connect a database", "Connect to a database and press Run all to render the panels.");
    }
  }

  async function importDashboard(id: string) {
    try {
      const dash = await dashboards.get(id);
      const imported: Cell[] = [];
      imported.push(mkCell("markdown", `## ${dash.title}\n\n${dash.description || ""}`.trim()));
      for (const p of dash.panels) {
        if (p.viz.type === "markdown") {
          imported.push(mkCell("markdown", p.viz.content));
        } else if (p.query?.sql?.trim()) {
          // Carry the panel's visualization, so the cell renders the CHART,
          // not just the query text.
          const chart =
            p.viz.type === "echarts" ? ((p.viz as { chart?: string }).chart ?? "bar") : p.viz.type === "kpi" ? "kpi" : "table";
          const cell = mkCell("sql", `-- ${p.title || "Panel"} (from dashboard “${dash.title}”)\n${p.query.sql.trim()}`, chart);
          if (p.viz.type === "echarts") {
            const e = p.viz as { xField?: string; yFields?: string[]; stacked?: boolean; option?: Record<string, unknown> };
            if (e.xField || e.yFields || e.stacked || e.option) cell.viz = { xField: e.xField, yFields: e.yFields, stacked: e.stacked, option: e.option };
          }
          imported.push(cell);
        }
      }
      if (imported.length <= 1) {
        notify("warning", "Nothing to import", "That dashboard has no markdown or SQL panels.");
        return;
      }
      setCells((cs) => [...cs, ...imported]);
      // Run the imported panels right away so the charts appear — the point of
      // importing is the visuals, not the SQL.
      if (profileId) {
        const ids = imported.filter((c) => c.type === "sql").map((c) => c.id);
        setTimeout(() => { void (async () => { for (const cid of ids) await runCell(cid); })(); }, 50);
        notify("success", "Dashboard imported", `${imported.length - 1} panel${imported.length === 2 ? "" : "s"} from “${dash.title}” rendering now.`);
      } else {
        notify("warning", "Dashboard imported", "Connect to a database and press Run all to render the panels.");
      }
    } catch (e) {
      notify("warning", "Import failed", errorMessage(e));
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        {/* Notebook picker: switch / create / rename / delete. */}
        {renamingBook === activeBook.id ? (
          <input
            autoFocus
            defaultValue={activeBook.title}
            onBlur={(e) => renameBook(activeBook.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") renameBook(activeBook.id, (e.target as HTMLInputElement).value);
              else if (e.key === "Escape") setRenamingBook(null);
            }}
            className="h-7 w-44 rounded-md border border-primary/50 bg-background px-2 font-heading text-[13px] font-bold text-foreground outline-none"
          />
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-7 items-center gap-1.5 rounded-md px-1.5 font-heading text-[14px] font-bold text-foreground hover:bg-secondary" title="Switch notebook">
                <Icon name="notebook" className="h-4 w-4 text-primary" />
                <span className="max-w-[220px] truncate">{activeBook.title}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Notebooks</DropdownMenuLabel>
              {books.map((b) => (
                <DropdownMenuItem key={b.id} onClick={() => openBook(b.id)}>
                  <Icon name="notebook" className="h-3.5 w-3.5" />
                  <span className="flex-1 truncate">{b.title}</span>
                  {b.id === activeId ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={newBook}><Plus className="h-3.5 w-3.5" /> New notebook</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRenamingBook(activeBook.id)}><Pencil className="h-3.5 w-3.5" /> Rename</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => deleteBook(activeBook.id)}><Trash2 className="h-3.5 w-3.5" /> Delete notebook</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <span className="hidden min-w-0 flex-1 truncate text-[11px] text-muted-foreground lg:block">SQL, Markdown, Mermaid &amp; charts in one canvas</span>
        <div className="ml-auto flex items-center gap-1.5">
          <DropdownMenu onOpenChange={(open) => { if (open) void loadDashList(); }}>
            <DropdownMenuTrigger asChild>
              <button title="Import dashboard panels as cells" className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <Icon name="dashboards" className="h-3.5 w-3.5" /> Import <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>From dashboard</DropdownMenuLabel>
              {dashList === null ? (
                <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
              ) : dashList.length === 0 ? (
                <DropdownMenuItem disabled>No dashboards yet</DropdownMenuItem>
              ) : (
                dashList.map((d) => (
                  <DropdownMenuItem key={d.id} onClick={() => void importDashboard(d.id)}>
                    <Icon name="dashboards" className="h-3.5 w-3.5" />
                    <span className="flex-1 truncate">{d.title}</span>
                    <span className="text-[10px] text-muted-foreground">{d.panels}</span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <button onClick={() => setCells((cs) => [...cs, mkCell("sql")])} className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <Plus className="h-3.5 w-3.5" /> Cell
          </button>
          <button onClick={() => void runAll()} className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium leading-none text-primary-foreground hover:bg-primary/85">
            <Play className="h-3.5 w-3.5" /> Run all
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button title="Export the whole notebook" className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Include</DropdownMenuLabel>
              {(
                [
                  ["queries", "Queries (SQL)"],
                  ["results", "Results"],
                  ["notes", "Markdown notes"],
                  ["diagrams", "Mermaid diagrams"],
                ] as const
              ).map(([key, label]) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={exportInc[key]}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(v) => setExportInc((inc) => ({ ...inc, [key]: Boolean(v) }))}
                  className="text-[12px]"
                >
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void doExport("markdown")}>Export Markdown (.md)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void doExport("html")}>Export HTML (.html)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void doExport("pdf")}>Export PDF (print…)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
        {/* Connect actions. Once a database is connected, virtual schemas are
            the notebook's primary building block, so lead with that and shrink
            "Connect database" to a compact secondary + . */}
        {connections.length > 0 ? (
          <>
            <button onClick={onAddVirtualSchema} className="flex items-center gap-1 rounded-full border border-teal/40 bg-teal/8 px-2.5 py-1 text-[11.5px] font-medium text-foreground transition-colors hover:border-teal/70 hover:bg-teal/12">
              <Plus className="h-3.5 w-3.5" /> <Waypoints className="h-3.5 w-3.5 text-teal" /> Virtual schema
            </button>
            <button onClick={onConnectDb} title="Connect another database" className="flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
              <Plus className="h-3.5 w-3.5" /> <Database className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button onClick={onConnectDb} className="flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
            <Plus className="h-3.5 w-3.5" /> <Database className="h-3.5 w-3.5" /> Connect database
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-width:thin]">
        <div className="mx-auto flex max-w-4xl flex-col">
          {cells.map((cell, i) => (
            <Fragment key={cell.id}>
            <InsertZone onAdd={() => setCells((cs) => [...cs.slice(0, i), mkCell("sql"), ...cs.slice(i)])} />
            <div className="relative">
              {dropTarget?.id === cell.id && dropTarget.pos === "above" ? (
                <div className="pointer-events-none absolute -top-1 left-0 right-0 z-30 h-0.5 rounded-full bg-primary shadow-[0_0_0_1px_var(--primary)]" />
              ) : null}
              {dropTarget?.id === cell.id && dropTarget.pos === "below" ? (
                <div className="pointer-events-none absolute -bottom-1 left-0 right-0 z-30 h-0.5 rounded-full bg-primary shadow-[0_0_0_1px_var(--primary)]" />
              ) : null}
            <CellView
              cell={cell}
              first={i === 0}
              last={i === cells.length - 1}
              editorTheme={editorTheme}
              beforeMount={beforeMount}
              onChange={(src) => patch(cell.id, { src })}
              onRun={() => void runCell(cell.id)}
              onEdit={() => patch(cell.id, { editing: true })}
              onType={(t) => setType(cell.id, t)}
              onChart={(t) => patch(cell.id, { chart: t === "table" ? undefined : t })}
              onConn={(c) => patch(cell.id, { connProfileId: c?.id, connName: c?.name })}
              connections={connections}
              activeProfileId={profileId}
              onMove={(d) => move(cell.id, d)}
              onRemove={() => remove(cell.id)}
              index={i}
              onAsk={() => {
                if (cell.type === "sql") {
                  // Pin: the assistant gets the cell as a chip and a mandate
                  // to work on it; its final SQL applies back here and runs.
                  // Open the panel FIRST — a closed panel has no pin listener.
                  window.dispatchEvent(new Event("studio:assistant-open"));
                  window.setTimeout(() => {
                    window.dispatchEvent(
                      new CustomEvent("exa:pin-cell", {
                        detail: { cellId: cell.id, index: i, sql: cell.src, chart: cell.chart ?? null, connection: cell.connName ?? null },
                      }),
                    );
                  }, 150);
                } else {
                  onAsk(cell.src, cell.type, cell.chart);
                }
              }}
              queued={runQueue.has(cell.id)}
              dragging={dragId === cell.id}
              onGrip={() => {
                drag.current = { id: cell.id, moved: false };
                setDragId(cell.id);
                document.body.style.cursor = "grabbing";
              }}
            />
            </div>
            </Fragment>
          ))}
          <InsertZone onAdd={() => setCells((cs) => [...cs, mkCell("sql")])} />
        </div>
      </div>

      {/* Bottom bar: built-in System dashboards open as auto-running notebooks. */}
      <footer className="flex h-9 shrink-0 items-center gap-2 border-t border-border bg-panel/40 px-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button title="Built-in system dashboards" className="flex h-6.5 items-center gap-1.5 rounded-md border border-border px-2.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              <Icon name="dashboards" className="h-3.5 w-3.5 text-primary" /> System <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>System dashboards</DropdownMenuLabel>
            {SYSTEM_DASHBOARDS.map((factory) => {
              const d = factory();
              return (
                <DropdownMenuItem key={d.title} onClick={() => openSystemDashboard(factory)}>
                  <Icon name="dashboards" className="h-3.5 w-3.5" />
                  <span className="flex flex-col">
                    <span>{d.title}</span>
                    <span className="text-[10px] text-muted-foreground">{d.description}</span>
                  </span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="text-[10.5px] text-muted-foreground">Live views of the engine — refreshed on open, never deletable.</span>
      </footer>
    </div>
  );
}

const CellView = memo(function CellView({
  cell,
  first,
  last,
  editorTheme,
  beforeMount,
  onChange,
  onRun,
  onEdit,
  onType,
  onChart,
  onConn,
  connections,
  activeProfileId,
  onMove,
  onRemove,
  onAsk,
  queued,
  dragging,
  onGrip,
  index,
}: {
  cell: Cell;
  first: boolean;
  last: boolean;
  /** Position in the notebook (0-based) — every cell shows index+1, and the
   *  AI refers to cells by that same number. */
  index: number;
  editorTheme: string;
  beforeMount: (m: Monaco) => void;
  onChange: (src: string) => void;
  onRun: () => void;
  onEdit: () => void;
  onType: (t: CellType) => void;
  onChart: (t: string) => void;
  onConn: (c: { id: string; name: string } | null) => void;
  connections: NotebookConn[];
  activeProfileId: string | null;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onAsk: () => void;
  queued: boolean;
  dragging: boolean;
  onGrip: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mdFocused, setMdFocused] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const isSql = cell.type === "sql";
  const isMd = cell.type === "markdown";
  const isMermaid = cell.type === "mermaid";
  const rendered = isMermaid && !cell.editing; // mermaid preview (md is always WYSIWYG)
  // Fit the editor to the SQL: a 1-line query gets a 2-line box (room to type),
  // not a 3-line box + fat slack — that read as a blank gap above the result.
  const lines = Math.min(18, Math.max(2, cell.src.split("\n").length));
  const editorHeight = lines * 19 + 8;

  // Markdown cell: full-width, no gutter — a Word-style WYSIWYG document you
  // edit in place. Type dropdown + drag/delete appear on hover, top-right.
  if (isMd) {
    return (
      <div data-cell-id={cell.id} className={cn("group/cell relative transition-opacity", dragging && "opacity-40")}>
        <div className={cn("relative rounded-lg", mdFocused ? "bg-secondary/10 ring-1 ring-border" : "hover:bg-secondary/10")}>
          <MarkdownEditor
            value={cell.src}
            onChange={onChange}
            onFocusChange={setMdFocused}
            // While editing, the cell controls live INSIDE the toolbar's right
            // end — never overlapping the formatting buttons.
            trailing={
              <>
                <button onClick={onAsk} title="Mention this note in Exa" className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-primary"><AgentMark className="h-3.5 w-3.5" /></button>
                <Select value={cell.type} onValueChange={(v) => onType(v as CellType)}>
                  <SelectTrigger size="sm" className="h-6 w-[118px] text-[11px]"><SelectValue /></SelectTrigger>
                  <SelectContent align="end">
                    {CELL_TYPES.map((t) => { const I = t.icon; return (<SelectItem key={t.value} value={t.value}><span className="flex items-center gap-1.5"><I className="h-3.5 w-3.5" /> {t.label}</span></SelectItem>); })}
                  </SelectContent>
                </Select>
                <button onPointerDown={(e) => { e.preventDefault(); onGrip(); }} title="Drag to reorder" className="flex h-6 w-6 cursor-grab items-center justify-center rounded-md text-muted-foreground/60 hover:bg-secondary hover:text-foreground"><GripVertical className="h-3.5 w-3.5" /></button>
                <button onClick={onRemove} title="Delete cell" className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </>
            }
          />
          {/* Not editing → compact hover controls, top-right (no toolbar to collide with). */}
          {!mdFocused ? (
            <div className="pointer-events-none absolute right-1.5 top-1 z-10 flex items-center gap-0.5 rounded-md bg-editor opacity-0 transition-opacity group-hover/cell:pointer-events-auto group-hover/cell:opacity-100">
              <button onClick={onAsk} title="Mention this note in Exa" className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-primary"><AgentMark className="h-3.5 w-3.5" /></button>
              <Select value={cell.type} onValueChange={(v) => onType(v as CellType)}>
                <SelectTrigger size="sm" className="h-6 w-[118px] text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent align="end">
                  {CELL_TYPES.map((t) => { const I = t.icon; return (<SelectItem key={t.value} value={t.value}><span className="flex items-center gap-1.5"><I className="h-3.5 w-3.5" /> {t.label}</span></SelectItem>); })}
                </SelectContent>
              </Select>
              <button onPointerDown={(e) => { e.preventDefault(); onGrip(); }} title="Drag to reorder" className="flex h-6 w-6 cursor-grab items-center justify-center rounded-md text-muted-foreground/60 hover:bg-secondary hover:text-foreground"><GripVertical className="h-3.5 w-3.5" /></button>
              <button onClick={onRemove} title="Delete cell" className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // Mermaid preview: clean, notebook-style — click to edit, hover controls.
  if (rendered) {
    return (
      <div data-cell-id={cell.id} className={cn("group/cell relative transition-opacity", dragging && "opacity-40")}>
        <div className="relative rounded-lg">
          <MermaidView code={cell.src} />
          <div className="pointer-events-none absolute right-1 top-1 z-10 flex items-center gap-0.5 rounded-md bg-editor opacity-0 transition-opacity group-hover/cell:pointer-events-auto group-hover/cell:opacity-100">
            <Select value={cell.type} onValueChange={(v) => onType(v as CellType)}>
              <SelectTrigger size="sm" className="h-6 w-[118px] text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent align="end">
                {CELL_TYPES.map((t) => { const I = t.icon; return (<SelectItem key={t.value} value={t.value}><span className="flex items-center gap-1.5"><I className="h-3.5 w-3.5" /> {t.label}</span></SelectItem>); })}
              </SelectContent>
            </Select>
            <button onClick={onAsk} title="Mention this diagram in Exa" className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-primary"><AgentMark className="h-3.5 w-3.5" /></button>
            <button onClick={onEdit} title="Edit the diagram code" className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
            <button onPointerDown={(e) => { e.preventDefault(); onGrip(); }} title="Drag to reorder" className="flex h-6 w-6 cursor-grab items-center justify-center rounded-md text-muted-foreground/60 hover:bg-secondary hover:text-foreground"><GripVertical className="h-3.5 w-3.5" /></button>
            <button onClick={onRemove} title="Delete cell" className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-cell-id={cell.id} className={cn("group/cell relative transition-opacity", dragging && "opacity-40")}>

      <div className={cn("overflow-hidden rounded-lg border border-border bg-editor transition-colors", queued && "ring-2 ring-inset ring-primary/40")}>
        <div className="flex items-stretch">
          {/* Left-center gutter — SQL only: the Jupyter [n] that turns into a
              Run button on hover (run control + indicator). Text/diagram cells
              have no run — they render when you click away. */}
          {isSql ? (
            <button
              onClick={onRun}
              disabled={cell.running}
              title="Run (⌘/Ctrl+Enter)"
              className="group/run flex w-10 shrink-0 select-none items-center justify-center"
            >
              {cell.running ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : (
                <>
                  <span className="font-mono text-[10px] text-muted-foreground/70 group-hover/run:hidden">[{index + 1}]</span>
                  <Play className="hidden h-3.5 w-3.5 fill-current text-primary group-hover/run:block" />
                </>
              )}
            </button>
          ) : (
            <div className="flex w-10 shrink-0 select-none items-center justify-center font-mono text-[10px] text-muted-foreground/70">[{index + 1}]</div>
          )}
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
          {isSql && (connections.length > 1 || cell.connProfileId) ? (
            // Which database this cell queries — default follows the active
            // connection; only alternatives are listed (never a duplicate row).
            <Select
              value={cell.connProfileId ?? "__active__"}
              onValueChange={(v) => onConn(v === "__active__" ? null : { id: v, name: connections.find((c) => c.id === v)?.name ?? v })}
            >
              <SelectTrigger size="sm" className="h-6 max-w-[190px] text-[11px]" title="Database this cell runs on">
                <Database className={cn("h-3 w-3 shrink-0", cell.connProfileId ? "text-teal" : "text-primary")} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__active__">Active ({connections.find((c) => c.id === activeProfileId)?.name ?? "none"})</SelectItem>
                {connections
                  .filter((c) => c.id !== activeProfileId)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ) : null}
          {/* Preview ↔ Code toggle: diagrams default to Preview so the user
              visualizes the result, not the raw markup. */}
          {isMermaid ? (
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

        {isSql ? (
              // Monaco SQL cell — Exasol autocompletion comes from the app-global
              // completion provider on the shared monaco instance.
              <div style={{ height: editorHeight }} className="pt-1">
                <Editor
                  // Remount on position change: React REORDERS cells by moving
                  // DOM nodes, and Monaco's view dies on a moved node (uncaught
                  // 'this.domNode.setClassName' storms in its rAF runner — the
                  // drag-reorder black screen). A keyed remount is clean; the
                  // value is controlled so nothing is lost.
                  key={`${cell.id}:${index}`}
                  height="100%"
                  defaultLanguage="sql"
                  theme={editorTheme}
                  beforeMount={beforeMount}
                  loading={<BrandLoader size={32} />}
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
                // Click away → render (unless focus moved to this cell's own
                // controls like the format toolbar).
                onBlur={(e) => {
                  const cellEl = (e.currentTarget as HTMLElement).closest("[data-cell-id]");
                  if (!cellEl || !cellEl.contains(e.relatedTarget as Node)) onRun();
                }}
                rows={lines}
                placeholder={isMermaid ? "graph TD; A[Start] --> B[Next]   ·   click away to render" : "# Markdown — images, tables, links   ·   click away to render"}
                className="min-w-0 w-full resize-none bg-transparent px-3 py-2 font-mono text-[12.5px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50 [scrollbar-width:thin]"
              />
            )}
          </div>

          <div className="flex shrink-0 flex-col items-center gap-0.5 p-1.5">
            {/* Mention in Exa — always visible: the assistant gets this cell
                (by its number) as working context and can manipulate it. */}
            <button onClick={onAsk} title={`Mention cell ${index + 1} in Exa — work on it from the chat`} className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-primary">
              <AgentMark className="h-3.5 w-3.5" />
            </button>
            <div className="flex flex-col items-center gap-0.5 opacity-0 transition-opacity group-hover/cell:opacity-100">
            <button
              onPointerDown={(e) => { e.preventDefault(); onGrip(); }}
              title="Drag to reorder"
              className="flex h-6 w-6 cursor-grab items-center justify-center rounded-md text-muted-foreground/60 hover:bg-secondary hover:text-foreground active:cursor-grabbing"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => onMove(-1)} disabled={first} title="Move up" className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
            <button onClick={() => onMove(1)} disabled={last} title="Move down" className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
            <button onClick={onRemove} title="Delete cell" className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
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
                // Visual picker: every chart kind as a picture tile; "table" = the grid.
                <ChartKindPicker value={cell.chart ?? "table"} onChange={onChart} />
              ) : null}
              <span className="ml-auto font-mono">{cell.result.elapsedMs} ms</span>
            </div>
            {!collapsed && cell.result.kind === "resultSet"
              ? (() => {
                  switch (cellRenderer(cell.chart, cell.viz)) {
                    case "kpi":
                      return <div className="border-t border-border/60"><KpiCell result={cell.result} /></div>;
                    case "recharts":
                      return (
                        <div className="h-64 border-t border-border/60">
                          <ShadcnChartPanel chart={cell.chart as "bar" | "hbar" | "line" | "area" | "pie" | "donut" | "radar" | "radial"} result={cell.result} />
                        </div>
                      );
                    case "echarts":
                      return <div className="h-72 border-t border-border/60"><EchartsCell chart={cell.chart ?? "bar"} viz={cell.viz} result={cell.result} /></div>;
                    default:
                      return <ResultGrid columns={cell.result.columns} rows={cell.result.rows} truncated={cell.result.truncated} />;
                  }
                })()
              : null}
          </div>
        ) : null}
      </div>

    </div>
  );
}, (prev, next) =>
  // Skip re-render unless THIS cell's data or view flags changed. Unedited
  // cells keep the same `cell` object reference across setCells, so typing in
  // one cell no longer re-renders every other cell's Monaco/TipTap editor.
  prev.cell === next.cell &&
  prev.first === next.first &&
  prev.last === next.last &&
  prev.dragging === next.dragging &&
  prev.queued === next.queued &&
  prev.editorTheme === next.editorTheme &&
  prev.connections === next.connections &&
  prev.activeProfileId === next.activeProfileId,
);

/** In-flow insert affordance BETWEEN cells: occupies real layout space, so it
 *  can never be painted over or slide under a neighboring cell. */
function InsertZone({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex h-5 items-center justify-center opacity-0 transition-opacity hover:opacity-100">
      <span className="h-px flex-1 bg-border/60" />
      <button onClick={onAdd} title="Add a cell here" className="mx-1 flex items-center gap-0.5 rounded border border-border bg-editor px-1.5 py-0.5 text-[9.5px] text-muted-foreground hover:text-foreground">
        <Plus className="h-2.5 w-2.5" /> Cell
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
