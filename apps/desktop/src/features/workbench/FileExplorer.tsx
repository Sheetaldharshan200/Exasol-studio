import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  ChevronsDownUp,
  Database,
  File,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  MoreVertical,
  RefreshCcw,
  Search,
  Table2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { errorMessage, ipc, isTauri, type FsEntry } from "@/lib/ipc";
import { cn } from "@/lib/utils";

function ToolBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {children}
    </button>
  );
}

const INDENT = 14;
const ROW_H = 24;

function fileIcon(ext: string | null): LucideIcon {
  switch (ext) {
    case "sql":
      return Database;
    case "csv":
    case "tsv":
    case "parquet":
      return Table2;
    default:
      return File;
  }
}

function fileAccent(ext: string | null): string {
  if (ext === "sql") return "text-primary";
  if (ext === "csv" || ext === "tsv" || ext === "parquet") return "text-teal";
  return "text-muted-foreground";
}

/** Files Exasol Studio can open: SQL scripts and tabular data. */
const TEXT_EXT = new Set(["sql"]);
const TABLE_EXT = new Set(["csv", "tsv", "parquet"]);
const OPENABLE = new Set([...TEXT_EXT, ...TABLE_EXT]);
const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

export function FileExplorer({
  onOpenFile,
  onOpenData,
}: {
  onOpenFile: (name: string, content: string) => void;
  onOpenData: (name: string, path: string) => void;
}) {
  const [roots, setRoots] = useState<FsEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [children, setChildren] = useState<Record<string, FsEntry[]>>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FsEntry[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [rootError, setRootError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const entryByPath = useRef<Map<string, FsEntry>>(new Map());

  // Fetch a directory's contents (always hits the backend).
  const fetchDir = useCallback((path: string) => {
    setLoading((s) => new Set(s).add(path));
    ipc
      .fsListDir(path)
      .then((entries) => {
        entries.forEach((e) => entryByPath.current.set(e.path, e));
        setChildren((c) => ({ ...c, [path]: entries }));
        setErrors((e) => {
          const n = { ...e };
          delete n[path];
          return n;
        });
      })
      .catch((err) => setErrors((e) => ({ ...e, [path]: errorMessage(err) })))
      .finally(() =>
        setLoading((s) => {
          const n = new Set(s);
          n.delete(path);
          return n;
        }),
      );
  }, []);

  useEffect(() => {
    ipc
      .fsHomeRoots()
      .then((r) => {
        setRoots(r);
        r.forEach((e) => entryByPath.current.set(e.path, e));
        // Expand the Home root so its contents show immediately.
        if (r[0]) {
          setExpanded(new Set([r[0].path]));
          fetchDir(r[0].path);
        }
      })
      .catch((e) => setRootError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDir = useCallback((path: string) => {
    if (children[path]) return;
    setLoading((s) => new Set(s).add(path));
    ipc
      .fsListDir(path)
      .then((entries) => {
        entries.forEach((e) => entryByPath.current.set(e.path, e));
        setChildren((c) => ({ ...c, [path]: entries }));
        setErrors((e) => {
          const n = { ...e };
          delete n[path];
          return n;
        });
      })
      .catch((err) => setErrors((e) => ({ ...e, [path]: errorMessage(err) })))
      .finally(() => setLoading((s) => {
        const n = new Set(s);
        n.delete(path);
        return n;
      }));
  }, [children]);

  const toggle = useCallback(
    (entry: FsEntry) => {
      if (!entry.isDir) return;
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(entry.path)) next.delete(entry.path);
        else {
          next.add(entry.path);
          loadDir(entry.path);
        }
        return next;
      });
    },
    [loadDir],
  );

  // Debounced recursive search across all roots.
  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const merged: FsEntry[] = [];
        for (const root of roots) {
          const hits = await ipc.fsSearch(root.path, term, 120);
          for (const h of hits) {
            if (!merged.some((m) => m.path === h.path)) merged.push(h);
            entryByPath.current.set(h.path, h);
          }
        }
        setResults(merged);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => clearTimeout(handle);
  }, [query, roots]);

  const toggleSelect = useCallback((path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // Route a file to the right surface: SQL → query tab, tabular → data preview.
  const openPath = useCallback(
    async (name: string, path: string) => {
      const ext = extOf(name);
      if (TABLE_EXT.has(ext)) {
        onOpenData(name, path);
      } else if (TEXT_EXT.has(ext)) {
        try {
          const content = await ipc.fsReadText(path);
          onOpenFile(name, content);
        } catch {
          /* ignore unreadable file */
        }
      }
    },
    [onOpenFile, onOpenData],
  );

  const openEntry = useCallback(
    (entry: FsEntry) => {
      if (entry.isDir) return;
      void openPath(entry.name, entry.path);
    },
    [openPath],
  );

  const openSelected = useCallback(async () => {
    const paths = [...selected];
    for (const p of paths) {
      const entry = entryByPath.current.get(p);
      if (entry && !entry.isDir) await openPath(entry.name, entry.path);
    }
    setSelected(new Set());
  }, [selected, openPath]);

  // Toolbar actions --------------------------------------------------------
  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  const reload = useCallback(() => {
    setChildren({});
    setErrors({});
    [...expanded].forEach((p) => fetchDir(p));
  }, [expanded, fetchDir]);

  const addFolder = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ directory: true, multiple: false });
      if (typeof dir === "string") {
        const entry: FsEntry = {
          name: dir.split("/").pop() || dir,
          path: dir,
          isDir: true,
          size: 0,
          modified: null,
          ext: null,
        };
        entryByPath.current.set(dir, entry);
        setRoots((prev) => (prev.some((r) => r.path === dir) ? prev : [...prev, entry]));
        setExpanded((prev) => new Set(prev).add(dir));
        fetchDir(dir);
      }
    } catch {
      /* cancelled */
    }
  }, [fetchDir]);

  const openViaDialog = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({
        multiple: true,
        filters: [{ name: "SQL & data", extensions: ["sql", "csv", "tsv", "parquet"] }],
      });
      const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
      for (const p of paths) {
        await openPath(p.split("/").pop() || p, p);
      }
    } catch {
      /* cancelled */
    }
  }, [openPath]);

  const isHidden = (name: string) => name.startsWith(".");

  // Flatten the tree into rows for rendering.
  const rows: React.ReactNode[] = [];
  const walk = (entries: FsEntry[], depth: number) => {
    for (const entry of entries) {
      if (!showHidden && isHidden(entry.name)) continue;
      rows.push(
        <Row
          key={entry.path}
          entry={entry}
          depth={depth}
          open={expanded.has(entry.path)}
          selected={selected.has(entry.path)}
          onToggle={() => toggle(entry)}
          onOpen={() => openEntry(entry)}
          onSelect={() => toggleSelect(entry.path)}
        />,
      );
      if (entry.isDir && expanded.has(entry.path)) {
        if (loading.has(entry.path)) {
          rows.push(<Hint key={entry.path + ":l"} depth={depth + 1} kind="loading" />);
        } else if (errors[entry.path]) {
          rows.push(<Hint key={entry.path + ":e"} depth={depth + 1} kind="error" text={errors[entry.path]} />);
        } else if (children[entry.path]) {
          if (children[entry.path].length === 0)
            rows.push(<Hint key={entry.path + ":empty"} depth={depth + 1} kind="empty" />);
          else walk(children[entry.path], depth + 1);
        }
      }
    }
  };
  walk(roots, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top toolbar */}
      <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-border px-1.5">
        <ToolBtn label="Add folder" onClick={addFolder}>
          <FolderPlus className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn label="Open file…" onClick={openViaDialog}>
          <FilePlus2 className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn label="Collapse all" onClick={collapseAll}>
          <ChevronsDownUp className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn label="Reload" onClick={reload}>
          <RefreshCcw className="h-3.5 w-3.5" />
        </ToolBtn>
        <div className="ml-auto" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="More options"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuCheckboxItem
              checked={showHidden}
              onCheckedChange={(v) => setShowHidden(v === true)}
            >
              Show hidden items
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="border-b border-border p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          {searching ? (
            <Loader2 className="absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : query ? (
            <button
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-7 pr-8 pl-8 text-xs"
            placeholder="Search files…"
          />
        </div>
      </div>

      {selected.size > 0 ? (
        <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-2 py-1.5 text-[11px]">
          <span className="text-muted-foreground">{selected.size} selected</span>
          <button
            onClick={openSelected}
            className="ml-auto rounded-md bg-primary px-2 py-0.5 font-medium text-primary-foreground hover:bg-primary/85"
          >
            Open in tabs
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="rounded-md px-2 py-0.5 text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {rootError ? (
          <p className="px-3 py-2 text-[11px] text-destructive">{rootError}</p>
        ) : results ? (
          results.length === 0 && !searching ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">No files found.</p>
          ) : (
            results.map((entry) => (
              <SearchRow
                key={entry.path}
                entry={entry}
                selected={selected.has(entry.path)}
                onOpen={() => openEntry(entry)}
                onSelect={() => toggleSelect(entry.path)}
              />
            ))
          )
        ) : (
          <div className="w-max min-w-full">{rows}</div>
        )}
      </div>
    </div>
  );
}

function RowIcon({ entry, open }: { entry: FsEntry; open: boolean }) {
  if (entry.isDir) {
    const Icon = open ? FolderOpen : Folder;
    return <Icon className="h-3.5 w-3.5 shrink-0 text-warning" />;
  }
  const Icon = fileIcon(entry.ext);
  return <Icon className={cn("h-3.5 w-3.5 shrink-0", fileAccent(entry.ext))} />;
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={cn(
        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors",
        checked ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/60",
      )}
    >
      {checked ? <span className="text-[9px] leading-none">✓</span> : null}
    </span>
  );
}

function Row({
  entry,
  depth,
  open,
  selected,
  onToggle,
  onOpen,
  onSelect,
}: {
  entry: FsEntry;
  depth: number;
  open: boolean;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onSelect: () => void;
}) {
  const openable = !entry.isDir && OPENABLE.has(entry.ext ?? "");
  return (
    <div
      style={{ height: ROW_H, paddingLeft: depth * INDENT + 6 }}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) onSelect();
        else if (entry.isDir) onToggle();
        else onSelect();
      }}
      onDoubleClick={() => (entry.isDir ? onToggle() : onOpen())}
      className={cn(
        "group flex min-w-full items-center gap-1.5 whitespace-nowrap pr-2 text-[13px] transition-colors",
        selected ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
        "cursor-pointer",
      )}
    >
      <Checkbox checked={selected} onChange={onSelect} />
      <span className="flex w-4 shrink-0 items-center justify-center">
        {entry.isDir ? (
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
        ) : null}
      </span>
      <RowIcon entry={entry} open={open} />
      <span className="shrink-0">{entry.name}</span>
      {openable ? null : entry.isDir ? null : (
        <span className="ml-1 shrink-0 text-[10px] text-muted-foreground/50">read-only</span>
      )}
    </div>
  );
}

function SearchRow({
  entry,
  selected,
  onOpen,
  onSelect,
}: {
  entry: FsEntry;
  selected: boolean;
  onOpen: () => void;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={(e) => (e.metaKey || e.ctrlKey ? onSelect() : entry.isDir ? undefined : onOpen())}
      onDoubleClick={() => (entry.isDir ? undefined : onOpen())}
      className={cn(
        "flex items-center gap-2 px-2.5 py-1.5 text-[12px] transition-colors",
        selected ? "bg-secondary" : "hover:bg-secondary/60",
        entry.isDir ? "cursor-default" : "cursor-pointer",
      )}
    >
      <Checkbox checked={selected} onChange={onSelect} />
      <RowIcon entry={entry} open={false} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-foreground">{entry.name}</span>
        <span className="block truncate text-[10px] text-muted-foreground">{entry.path}</span>
      </span>
    </div>
  );
}

function Hint({ depth, kind, text }: { depth: number; kind: "loading" | "error" | "empty"; text?: string }) {
  return (
    <div className="flex items-center text-[11px]" style={{ height: ROW_H, paddingLeft: depth * INDENT + 24 }}>
      {kind === "loading" ? (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </span>
      ) : kind === "error" ? (
        <span className="text-destructive">{text ?? "Cannot open"}</span>
      ) : (
        <span className="text-muted-foreground/60 italic">empty</span>
      )}
    </div>
  );
}
