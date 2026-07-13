import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  ChevronsDownUp,
  Database,
  File,
  Folder,
  FolderOpen,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCcw,
  Search,
  Table2,
  Trash2,
  Upload,
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
import { errorMessage, ipc, type FsEntry } from "@/lib/ipc";
import { cn } from "@/lib/utils";

const INDENT = 12;
const ROW_H = 26;

/** Files Exasol Studio can open: SQL scripts and tabular data. */
const TEXT_EXT = new Set(["sql"]);
const TABLE_EXT = new Set(["csv", "tsv", "parquet"]);
const OPENABLE = new Set([...TEXT_EXT, ...TABLE_EXT]);
const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
const isHidden = (name: string) => name.startsWith(".");

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
  return "text-muted-foreground/70";
}

function fmtSize(bytes: number): string {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

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

export function FileExplorer({
  onOpenFile,
  onOpenData,
  onLoadData,
  refreshSignal = 0,
}: {
  onOpenFile: (name: string, content: string, path?: string) => void;
  onOpenData: (name: string, path: string) => void;
  /** Load a tabular file into Exasol via ExaPump (hover icon / right-click). */
  onLoadData?: (name: string, path: string) => void;
  /** Bump to reload the workspace (e.g. after a Save writes a new file). */
  refreshSignal?: number;
}) {
  const [roots, setRoots] = useState<FsEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [children, setChildren] = useState<Record<string, FsEntry[]>>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [results, setResults] = useState<FsEntry[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [rootError, setRootError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const entryByPath = useRef<Map<string, FsEntry>>(new Map());
  const workspacePath = useRef<string | null>(null);
  const untitledCounter = useRef(0);

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
    Promise.all([ipc.fsWorkspaceDir().catch(() => null), ipc.fsHomeRoots().catch(() => [])])
      .then(([ws, home]) => {
        const list = [...(ws ? [ws] : []), ...home];
        if (ws) workspacePath.current = ws.path;
        setRoots(list);
        list.forEach((e) => entryByPath.current.set(e.path, e));
        // Expand the workspace (where saved scripts land) by default.
        if (ws) {
          setExpanded(new Set([ws.path]));
          fetchDir(ws.path);
        }
      })
      .catch((e) => setRootError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload the workspace when a Save (or similar) writes a new file.
  useEffect(() => {
    if (refreshSignal > 0 && workspacePath.current) fetchDir(workspacePath.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  const toggle = useCallback(
    (entry: FsEntry) => {
      if (!entry.isDir) return;
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(entry.path)) {
          next.delete(entry.path);
        } else {
          next.add(entry.path);
          if (!children[entry.path]) fetchDir(entry.path);
        }
        return next;
      });
    },
    [children, fetchDir],
  );

  // Debounced recursive search under the roots.
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

  const openPath = useCallback(
    async (name: string, path: string) => {
      const ext = extOf(name);
      if (TABLE_EXT.has(ext)) {
        onOpenData(name, path);
      } else if (TEXT_EXT.has(ext)) {
        try {
          const content = await ipc.fsReadText(path);
          onOpenFile(name, content, path);
        } catch {
          /* ignore unreadable file */
        }
      }
    },
    [onOpenFile, onOpenData],
  );

  const openEntry = useCallback(
    (entry: FsEntry) => {
      if (!entry.isDir) void openPath(entry.name, entry.path);
    },
    [openPath],
  );

  // Selection: plain click selects one (and expands folders); ⌘/Ctrl toggles.
  const rowClick = useCallback(
    (entry: FsEntry, e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(entry.path)) next.delete(entry.path);
          else next.add(entry.path);
          return next;
        });
        return;
      }
      setSelected(new Set([entry.path]));
      if (entry.isDir) toggle(entry);
    },
    [toggle],
  );

  const openSelected = useCallback(async () => {
    for (const p of [...selected]) {
      const entry = entryByPath.current.get(p);
      if (entry && !entry.isDir && OPENABLE.has(extOf(entry.name))) {
        await openPath(entry.name, entry.path);
      }
    }
    setSelected(new Set());
  }, [selected, openPath]);

  const collapseAll = useCallback(() => setExpanded(new Set()), []);
  const reload = useCallback(() => {
    setChildren({});
    setErrors({});
    [...expanded].forEach((p) => fetchDir(p));
  }, [expanded, fetchDir]);

  // Create a new empty .sql file in the workspace and open it.
  const newFile = useCallback(async () => {
    const dir = workspacePath.current;
    if (!dir) return;
    const existing = new Set((children[dir] ?? []).map((e) => e.name));
    let name = "untitled.sql";
    while (existing.has(name)) {
      untitledCounter.current += 1;
      name = `untitled-${untitledCounter.current}.sql`;
    }
    const path = `${dir}/${name}`;
    try {
      await ipc.writeTextFile(path, "");
      fetchDir(dir);
      setExpanded((prev) => new Set(prev).add(dir));
      onOpenFile(name, "", path);
    } catch {
      /* ignore */
    }
  }, [children, fetchDir, onOpenFile]);

  const openableSelected = [...selected].filter((p) => {
    const e = entryByPath.current.get(p);
    return e && !e.isDir && OPENABLE.has(extOf(e.name));
  });

  // Flatten the tree into rows.
  const rows: React.ReactNode[] = [];
  const walk = (entries: FsEntry[], depth: number) => {
    for (const entry of entries) {
      if (!showHidden && isHidden(entry.name)) continue;
      const ws = workspacePath.current;
      const deletable = Boolean(ws && !entry.isDir && entry.path.startsWith(`${ws}/`));
      const loadable = !entry.isDir && TABLE_EXT.has(extOf(entry.name));
      rows.push(
        <Row
          key={entry.path}
          entry={entry}
          depth={depth}
          open={expanded.has(entry.path)}
          selected={selected.has(entry.path)}
          onClick={(e) => rowClick(entry, e)}
          onDoubleClick={() => openEntry(entry)}
          onLoad={loadable && onLoadData ? () => onLoadData(entry.name, entry.path) : undefined}
          onDelete={
            deletable
              ? () => {
                  void ipc.fsDelete(entry.path).then(() => {
                    if (ws) fetchDir(ws);
                  });
                }
              : undefined
          }
        />,
      );
      if (entry.isDir && expanded.has(entry.path)) {
        if (loading.has(entry.path)) {
          rows.push(<Hint key={entry.path + ":l"} depth={depth + 1} kind="loading" />);
        } else if (errors[entry.path]) {
          rows.push(<Hint key={entry.path + ":e"} depth={depth + 1} kind="error" text={errors[entry.path]} />);
        } else if (children[entry.path]) {
          const kids = children[entry.path].filter((e) => showHidden || !isHidden(e.name));
          if (kids.length === 0) rows.push(<Hint key={entry.path + ":empty"} depth={depth + 1} kind="empty" />);
          else walk(children[entry.path], depth + 1);
        }
      }
    }
  };
  walk(roots, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Minimal toolbar — no folder pickers */}
      <div className="flex h-8 shrink-0 items-center justify-end gap-0.5 border-b border-border px-1.5">
        <ToolBtn label="New file" onClick={newFile}>
          <Plus className="h-3.5 w-3.5" />
        </ToolBtn>
        <button
          aria-label="Search files"
          title="Search files"
          onClick={() =>
            setShowSearch((s) => {
              if (s) setQuery("");
              return !s;
            })
          }
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-secondary hover:text-foreground",
            showSearch ? "bg-secondary text-primary" : "text-muted-foreground",
          )}
        >
          <Search className="h-3.5 w-3.5" />
        </button>
        <ToolBtn label="Collapse all" onClick={collapseAll}>
          <ChevronsDownUp className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn label="Reload" onClick={reload}>
          <RefreshCcw className="h-3.5 w-3.5" />
        </ToolBtn>
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

      {showSearch ? (
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
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-7 pr-8 pl-8 text-xs"
              placeholder="Search files…"
            />
          </div>
        </div>
      ) : null}

      {openableSelected.length > 1 ? (
        <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-2 py-1.5 text-[11px]">
          <span className="text-muted-foreground">{openableSelected.length} selected</span>
          <button
            onClick={openSelected}
            className="ml-auto rounded-md bg-primary px-2 py-0.5 font-medium text-primary-foreground hover:bg-primary/85"
          >
            Open
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="rounded-md px-2 py-0.5 text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto py-0.5 [scrollbar-width:thin]">
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
                onClick={(e) => rowClick(entry, e)}
                onDoubleClick={() => openEntry(entry)}
              />
            ))
          )
        ) : (
          rows
        )}
      </div>
    </div>
  );
}

function RowIcon({ entry, open }: { entry: FsEntry; open: boolean }) {
  if (entry.isDir) {
    const Icon = open ? FolderOpen : Folder;
    return <Icon className="h-4 w-4 shrink-0 text-warning" />;
  }
  const Icon = fileIcon(entry.ext);
  return <Icon className={cn("h-4 w-4 shrink-0", fileAccent(entry.ext))} />;
}

function Row({
  entry,
  depth,
  open,
  selected,
  onClick,
  onDoubleClick,
  onDelete,
  onLoad,
}: {
  entry: FsEntry;
  depth: number;
  open: boolean;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  /** Present only for workspace files — shows a hover delete. */
  onDelete?: () => void;
  /** Present for tabular files — "Load into Exasol" (hover + right-click). */
  onLoad?: () => void;
}) {
  const dim = !entry.isDir && !OPENABLE.has(entry.ext ?? "");
  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={
        onLoad
          ? (e) => {
              e.preventDefault();
              onLoad();
            }
          : undefined
      }
      style={{ height: ROW_H, paddingLeft: depth * INDENT + 8 }}
      className={cn(
        "group flex cursor-pointer items-center gap-1.5 pr-2 text-[13px] transition-colors",
        selected
          ? "bg-primary/12 text-foreground"
          : "text-foreground/90 hover:bg-secondary/60",
      )}
    >
      <span className="flex w-3.5 shrink-0 items-center justify-center">
        {entry.isDir ? (
          <ChevronRight
            className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-90")}
          />
        ) : null}
      </span>
      <RowIcon entry={entry} open={open} />
      <span className={cn("min-w-0 flex-1 truncate", dim && "text-muted-foreground")}>{entry.name}</span>
      {onLoad ? (
        <button
          title={`Load ${entry.name} into Exasol`}
          onClick={(e) => {
            e.stopPropagation();
            onLoad();
          }}
          className="hidden shrink-0 rounded p-0.5 text-muted-foreground hover:text-primary group-hover:block"
        >
          <Upload className="h-3 w-3" />
        </button>
      ) : null}
      {onDelete ? (
        <button
          title={`Delete ${entry.name}`}
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Delete “${entry.name}”? This cannot be undone.`)) onDelete();
          }}
          className="hidden shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      ) : null}
      {!entry.isDir && entry.size ? (
        <span className={cn("shrink-0 font-mono text-[10px] text-muted-foreground/70", (onDelete || onLoad) && "group-hover:hidden")}>
          {fmtSize(entry.size)}
        </span>
      ) : null}
    </div>
  );
}

function SearchRow({
  entry,
  selected,
  onClick,
  onDoubleClick,
}: {
  entry: FsEntry;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        "flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[12px] transition-colors",
        selected ? "bg-primary/12" : "hover:bg-secondary/60",
      )}
    >
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
    <div className="flex items-center text-[11px]" style={{ height: ROW_H, paddingLeft: depth * INDENT + 26 }}>
      {kind === "loading" ? (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </span>
      ) : kind === "error" ? (
        <span className="truncate text-destructive">{text ?? "Cannot open"}</span>
      ) : (
        <span className="text-muted-foreground/60 italic">empty</span>
      )}
    </div>
  );
}
