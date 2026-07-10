import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import {
  Activity,
  ChevronRight,
  ChevronsDownUp,
  CircleSlash2,
  Database,
  FileCode2,
  GitBranch,
  History,
  Info,
  ListChecks,
  Loader2,
  PanelLeftClose,
  Play,
  Plug,
  PlugZap,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Shapes,
  Square,
  Star,
  Store,
  Table2,
  Terminal,
  Trash2,
  Unplug,
  X,
  Zap,
} from "lucide-react";
import { ExasolMark } from "@/components/brand/ExasolMark";
import { ThemeToggle } from "@/components/brand/ThemeToggle";
import { useTheme } from "@/components/theme/theme-provider";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  type PanelImperativeHandle,
} from "@/components/ui/resizable";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DatabaseTree } from "@/features/workbench/DatabaseTree";
import { buildConnectionNodes } from "@/features/workbench/tree-model";
import { DatabaseInfoPanel } from "@/features/workbench/DatabaseInfoPanel";
import { DataTypesPanel } from "@/features/workbench/DataTypesPanel";
import { ObjectSearch } from "@/features/workbench/ObjectSearch";
import { ActivityRail, type ActivityId } from "@/features/workbench/ActivityRail";
import { Notifications } from "@/features/workbench/Notifications";
import { ConnectView } from "@/features/connection/ConnectView";
import { AssistantPanel } from "@/features/assistant/AssistantPanel";
import {
  errorMessage,
  ipc,
  isTauri,
  type ConnectionProfile,
  type DriverInfo,
  type ExecuteResponse,
  type HistoryEntry,
  type ServerInfo,
  type StatementResult,
} from "@/lib/ipc";
import type { ActiveConnection } from "@/state/useConnections";

const MAX_ROWS_OPTIONS = [100, 1000, 10000, 50000, 100000];

/** A workspace tab is a SQL editor, a read-only catalog surface, or the
 * connect-to-database flow (so adding a connection doesn't hide your queries). */
type TabView = "sql" | "dbInfo" | "dataTypes" | "connect";

type SqlTab = {
  id: string;
  title: string;
  view: TabView;
  sql: string;
  response: ExecuteResponse | null;
  execError: string | null;
};

function newTab(index: number): SqlTab {
  return {
    id: `tab-${Date.now()}-${index}`,
    title: `Query ${index}`,
    view: "sql",
    sql:
      index === 1
        ? `-- Welcome to Exasol Studio.\n-- Run with the toolbar or Ctrl/Cmd+Enter.\n\nSELECT *\nFROM SYS.EXA_ALL_SCHEMAS\nORDER BY SCHEMA_NAME;\n`
        : "",
    response: null,
    execError: null,
  };
}

const TAB_ICON: Record<TabView, typeof Terminal> = {
  sql: Terminal,
  dbInfo: Info,
  dataTypes: Shapes,
  connect: Plug,
};

/** Sentinel key for the not-connected tab bucket. */
const NO_CONNECTION = "__none__";

/** The initial tab for a bucket: the not-connected bucket opens on the connect
 * flow; a live connection opens on a welcome query. */
function initialTab(key: string): SqlTab {
  if (key === NO_CONNECTION) {
    return {
      id: `tab-connect-${Date.now()}`,
      title: "Connect",
      view: "connect",
      sql: "",
      response: null,
      execError: null,
    };
  }
  return newTab(1);
}

function defineMonacoThemes(monaco: Monaco) {
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

/** Statement under a character offset (split on top-level semicolons). */
function statementAtOffset(sql: string, offset: number): string {
  let start = 0;
  for (let i = 0; i < sql.length; i++) {
    if (sql[i] === ";") {
      if (offset <= i) return sql.slice(start, i).trim();
      start = i + 1;
    }
  }
  return sql.slice(start).trim();
}

function IconButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
            active && "bg-secondary text-primary",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function TitleBar({
  connection,
  onConnect,
  onDisconnect,
  hideConnect,
}: {
  connection: ActiveConnection | null;
  onConnect: () => void;
  onDisconnect: () => void;
  /** Hide the Connect CTA while the connect view is already on screen. */
  hideConnect?: boolean;
}) {
  const connected = Boolean(connection);
  return (
    <header
      className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-titlebar text-xs text-muted-foreground"
      style={{
        paddingLeft: "calc(0.75rem + var(--wc-left, 0px))",
        paddingRight: "calc(0.75rem + var(--wc-right, 0px))",
      }}
      data-tauri-drag-region
    >
      <div className="flex items-center gap-2.5">
        <ExasolMark size={18} className="text-foreground" />
        <span className="font-heading text-[13px] font-bold text-foreground">Exasol Studio</span>
        <span className="text-border">/</span>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              connected ? "bg-primary shadow-[0_0_6px_var(--primary)]" : "bg-muted-foreground/50",
            )}
          />
          <span className={cn("font-medium", connected && "text-foreground")}>
            {connected ? connection!.profile.name : "Not connected"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {connected ? (
          <span className="hidden font-mono text-[11px] md:inline">
            {connection!.server.databaseName ?? "exasol"} {connection!.server.version ?? ""}
          </span>
        ) : null}
        <Notifications />
        <ThemeToggle className="h-6 w-6 rounded-md hover:bg-secondary" />
        {connected ? (
          <button
            onClick={onDisconnect}
            className="flex h-6 items-center gap-1.5 rounded-md border border-border px-2 text-[11px] hover:border-destructive/50 hover:text-foreground"
          >
            <Unplug className="h-3.5 w-3.5" />
            Disconnect
          </button>
        ) : hideConnect ? null : (
          <button
            onClick={onConnect}
            className="cta-glow flex h-6 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/85"
          >
            <PlugZap className="h-3.5 w-3.5" />
            Connect
          </button>
        )}
      </div>
    </header>
  );
}

const PLACEHOLDERS: Record<Exclude<ActivityId, "databases">, { icon: typeof Star; title: string; body: string }> = {
  files: { icon: FileCode2, title: "SQL files", body: "Local .sql scripts you open will appear here." },
  favorites: { icon: Star, title: "Favorites", body: "Star tables, queries, and connections for quick access." },
  git: { icon: GitBranch, title: "Git", body: "Version your saved SQL scripts alongside your project." },
  marketplace: { icon: Store, title: "Marketplace", body: "Browse virtual-schema adapters, drivers, and extensions." },
};

/** A single open connection: header (focus + actions) with its object tree. */
function ConnectionSection({
  connection,
  focused,
  treeKey,
  collapsed,
  onToggleCollapse,
  onFocus,
  onOpenObject,
  onRefresh,
  onDisconnect,
  onOpenView,
}: {
  connection: ActiveConnection;
  focused: boolean;
  treeKey: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onFocus: () => void;
  onOpenObject: (schema: string, name: string) => void;
  onRefresh: () => void;
  onDisconnect: () => void;
  onOpenView: (view: "dbInfo" | "dataTypes") => void;
}) {
  const roots = useMemo(
    () => buildConnectionNodes(connection.profile.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connection.profile.id, treeKey],
  );
  // Bumped to collapse every expanded node in this connection's tree.
  const [collapseSignal, setCollapseSignal] = useState(0);

  return (
    <div className="min-w-0">
      <div
        className={cn(
          "group flex h-8 items-center gap-1.5 pr-1 pl-1.5 transition-colors",
          focused ? "bg-secondary/60" : "hover:bg-secondary/30",
        )}
      >
        <button
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand" : "Collapse"}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", !collapsed && "rotate-90")} />
        </button>
        <button
          onClick={onFocus}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          title={`${connection.profile.host}:${connection.profile.port}`}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              focused ? "bg-primary shadow-[0_0_6px_var(--primary)]" : "bg-primary/50",
            )}
          />
          <Database className={cn("h-3.5 w-3.5 shrink-0", focused ? "text-primary" : "text-muted-foreground")} />
          <span className={cn("truncate text-[13px]", focused ? "font-medium text-foreground" : "text-muted-foreground")}>
            {connection.profile.name}
          </span>
        </button>
        <div
          className={cn(
            "flex shrink-0 items-center transition-opacity focus-within:opacity-100 group-hover:opacity-100",
            focused ? "opacity-100" : "opacity-0",
          )}
        >
          <IconButton label="Database info" onClick={() => onOpenView("dbInfo")}>
            <Info className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Data types" onClick={() => onOpenView("dataTypes")}>
            <Shapes className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Collapse all" onClick={() => setCollapseSignal((n) => n + 1)}>
            <ChevronsDownUp className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Refresh" onClick={onRefresh}>
            <RefreshCcw className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Disconnect" onClick={onDisconnect}>
            <Unplug className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>
      {!collapsed ? (
        <DatabaseTree
          key={treeKey}
          roots={roots}
          onOpenObject={onOpenObject}
          initialExpandedItems={["schemas"]}
          collapseSignal={collapseSignal}
        />
      ) : null}
    </div>
  );
}

function Sidebar({
  activity,
  connections,
  activeProfileId,
  treeKeys,
  onOpenObject,
  onConnect,
  onFocusConnection,
  onDisconnect,
  onRefreshConnection,
  onOpenView,
  onCollapse,
}: {
  activity: ActivityId;
  connections: ActiveConnection[];
  activeProfileId: string | null;
  treeKeys: Record<string, number>;
  onOpenObject: (profileId: string, schema: string, name: string) => void;
  onConnect: () => void;
  onFocusConnection: (profileId: string) => void;
  onDisconnect: (profileId: string) => void;
  onRefreshConnection: (profileId: string) => void;
  onOpenView: (profileId: string, view: "dbInfo" | "dataTypes") => void;
  onCollapse: () => void;
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const hasConnections = connections.length > 0;
  const searchProfileId = activeProfileId ?? connections[0]?.profile.id ?? null;

  const title = activity === "databases" ? "Database" : PLACEHOLDERS[activity].title;

  if (activity !== "databases") {
    return (
      <aside className="flex h-full min-w-0 flex-col bg-panel">
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-border pr-1 pl-3">
          <span className="eyebrow-muted">{title}</span>
          <IconButton label="Collapse sidebar" onClick={onCollapse}>
            <PanelLeftClose className="h-3.5 w-3.5" />
          </IconButton>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          {(() => {
            const P = PLACEHOLDERS[activity];
            const Icon = P.icon;
            return (
              <>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{P.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{P.body}</p>
                </div>
              </>
            );
          })()}
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-w-0 flex-col bg-panel">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border pr-1 pl-3">
        <span className="eyebrow-muted">{title}</span>
        <div className="flex items-center gap-0.5">
          <IconButton label="Add connection" onClick={onConnect}>
            <Plus className="h-3.5 w-3.5" />
          </IconButton>
          {hasConnections ? (
            <IconButton label="Search objects" active={showSearch} onClick={() => setShowSearch((s) => !s)}>
              <Search className="h-3.5 w-3.5" />
            </IconButton>
          ) : null}
          <IconButton label="Collapse sidebar" onClick={onCollapse}>
            <PanelLeftClose className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      {!hasConnections ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">No connections yet</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Use the <span className="font-semibold text-primary">+</span> button above to configure
              a connection and browse schemas, tables, scripts, and virtual schemas.
            </p>
          </div>
        </div>
      ) : showSearch && searchProfileId ? (
        <ObjectSearch
          key={searchProfileId}
          profileId={searchProfileId}
          onOpenObject={(schema, name) => onOpenObject(searchProfileId, schema, name)}
          onClose={() => setShowSearch(false)}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto py-0.5">
          {connections.map((conn) => (
            <ConnectionSection
              key={conn.profile.id}
              connection={conn}
              focused={conn.profile.id === activeProfileId}
              treeKey={treeKeys[conn.profile.id] ?? 0}
              collapsed={collapsed.has(conn.profile.id)}
              onToggleCollapse={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(conn.profile.id)) next.delete(conn.profile.id);
                  else next.add(conn.profile.id);
                  return next;
                })
              }
              onFocus={() => {
                onFocusConnection(conn.profile.id);
                // Clicking a connection reveals its schemas (expand, don't collapse).
                setCollapsed((prev) => {
                  if (!prev.has(conn.profile.id)) return prev;
                  const next = new Set(prev);
                  next.delete(conn.profile.id);
                  return next;
                });
              }}
              onOpenObject={(schema, name) => onOpenObject(conn.profile.id, schema, name)}
              onRefresh={() => onRefreshConnection(conn.profile.id)}
              onDisconnect={() => onDisconnect(conn.profile.id)}
              onOpenView={(view) => onOpenView(conn.profile.id, view)}
            />
          ))}
        </div>
      )}
    </aside>
  );
}

function ResultsGrid({ result, error }: { result: StatementResult | null; error: string | null }) {
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
  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead className="sticky top-0 z-10">
          <tr className="bg-secondary">
            <th className="border-r border-b border-border px-2 py-1.5 text-right font-mono text-[10px] text-muted-foreground">
              #
            </th>
            {result.columns.map((col) => (
              <th
                key={col.name}
                className="border-r border-b border-border px-3 py-1.5 text-left font-medium text-foreground"
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
          {result.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="odd:bg-transparent even:bg-secondary/30 hover:bg-accent/60">
              <td className="border-r border-b border-border px-2 py-1 text-right text-[10px] text-muted-foreground">
                {rowIndex + 1}
              </td>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="max-w-[380px] truncate border-r border-b border-border px-3 py-1 text-foreground"
                >
                  {cell === null ? <span className="text-muted-foreground italic">null</span> : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryDock({
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
  return (
    <section className="flex h-full min-h-0 flex-col border-t border-border bg-panel">
      <div className={cn("flex h-9 shrink-0 items-center justify-between pr-1 pl-2", open && "border-b border-border")}>
        <button
          onClick={onToggle}
          className="flex items-center gap-2 rounded-md px-1 py-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
          <History className="h-3.5 w-3.5" />
          <span className="eyebrow-muted">SQL History</span>
          <span className="rounded-full bg-secondary px-1.5 py-px font-mono text-[10px] text-muted-foreground">
            {entries.length}
          </span>
        </button>
        {open ? (
          <div className="flex items-center gap-0.5">
            <IconButton label="Refresh history" onClick={onRefresh}>
              <RefreshCcw className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label="Clear history" onClick={onClear}>
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        ) : null}
      </div>
      <div className={cn("min-h-0 flex-1 overflow-auto", !open && "hidden")}>
        {entries.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No queries run yet.
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-secondary">
              <tr className="text-left text-muted-foreground">
                {["Time", "Statement", "Rows", "Elapsed", "Status"].map((h) => (
                  <th key={h} className="border-b border-border px-3 py-1.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="cursor-pointer border-b border-border hover:bg-accent/60"
                  onClick={() => onPick(entry.sql)}
                >
                  <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                    {new Date(entry.executedAt).toLocaleTimeString()}
                  </td>
                  <td className="max-w-[520px] truncate px-3 py-1.5 font-mono text-foreground">
                    {entry.sql.replace(/\s+/g, " ").trim()}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">{entry.rowCount}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{entry.elapsedMs} ms</td>
                  <td className="px-3 py-1.5">
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-px text-[10px] font-medium",
                        entry.success ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive",
                      )}
                    >
                      {entry.success ? "ok" : "error"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export function ExasolStudio({
  connection,
  connections,
  drivers,
  profiles,
  onConnected,
  onFocusConnection,
  onDisconnect,
  onSaved,
}: {
  connection: ActiveConnection | null;
  connections: ActiveConnection[];
  drivers: DriverInfo[];
  profiles: ConnectionProfile[];
  onConnected: (profile: ConnectionProfile, server: ServerInfo) => void | Promise<void>;
  onFocusConnection: (profileId: string) => void;
  onDisconnect: (profileId?: string) => void;
  onSaved: () => void | Promise<void>;
}) {
  const connected = Boolean(connection);

  // Layout state
  const [activity, setActivity] = useState<ActivityId>("databases");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(true);
  const [treeKeys, setTreeKeys] = useState<Record<string, number>>({});
  const [historyOpen, setHistoryOpen] = useState(false);

  // Query state — tabs and the active tab are kept per connection, so each
  // database keeps its own workspace. A "__none__" bucket covers the
  // not-connected state so there is always a valid active tab.
  const connKey = connection?.profile.id ?? NO_CONNECTION;
  const [tabsByConn, setTabsByConn] = useState<Record<string, SqlTab[]>>({});
  const [activeIdByConn, setActiveIdByConn] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  // Inline tab rename (double-click a tab title).
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [resultTab, setResultTab] = useState<"results" | "messages">("results");
  const [maxRows, setMaxRows] = useState(1000);
  const [schema, setSchema] = useState<string>("");
  const [schemas, setSchemas] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const editorRef = useRef<import("monaco-editor").editor.IStandaloneCodeEditor | null>(null);
  const tabCounter = useRef(1);
  // Imperative handles for the collapsible side panels.
  const sidebarPanelRef = useRef<PanelImperativeHandle | null>(null);
  const aiPanelRef = useRef<PanelImperativeHandle | null>(null);
  // Stable fallback tab per connection, used for the first render before the
  // bucket is committed to state (avoids identity churn / remounts).
  const fallbackTabs = useRef<Record<string, SqlTab[]>>({});
  const tabsFor = useCallback((key: string): SqlTab[] => {
    const existing = tabsByConn[key];
    if (existing && existing.length) return existing;
    if (!fallbackTabs.current[key]) fallbackTabs.current[key] = [initialTab(key)];
    return fallbackTabs.current[key];
  }, [tabsByConn]);

  // Commit the fallback bucket into state so edits persist.
  useEffect(() => {
    setTabsByConn((prev) => (prev[connKey]?.length ? prev : { ...prev, [connKey]: tabsFor(connKey) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connKey]);

  const tabs = tabsFor(connKey);
  const activeTabId = activeIdByConn[connKey] ?? tabs[0].id;
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const isSpecialTab = activeTab.view !== "sql";
  const { theme } = useTheme();
  const editorTheme = theme === "dark" ? "exasol-dark" : "exasol-light";

  const setActiveTabId = useCallback(
    (id: string) => setActiveIdByConn((a) => ({ ...a, [connKey]: id })),
    [connKey],
  );

  const loadHistory = useCallback(() => {
    ipc.sqlHistoryList().then(setHistory).catch(() => undefined);
  }, []);
  useEffect(() => loadHistory(), [loadHistory]);

  // When a new connection is established, retire any open "Connect" tabs (they
  // served their purpose) so the workspace lands on the new database's queries.
  const prevConnCount = useRef(connections.length);
  useEffect(() => {
    if (connections.length > prevConnCount.current) {
      setTabsByConn((prev) => {
        const next: Record<string, SqlTab[]> = {};
        for (const [key, list] of Object.entries(prev)) {
          const kept = list.filter((t) => t.view !== "connect");
          if (kept.length) next[key] = kept;
        }
        return next;
      });
    }
    prevConnCount.current = connections.length;
  }, [connections.length]);

  useEffect(() => {
    if (!connection) {
      setSchemas([]);
      return;
    }
    ipc
      .getDatabaseOverview(connection.profile.id)
      .then((o) => {
        setSchemas(o.schemas.map((s) => s.name));
        setSchema(connection.server.currentSchema ?? "");
      })
      .catch(() => undefined);
  }, [connection]);

  // Update the tab list for a given connection bucket.
  const updateTabs = useCallback(
    (key: string, updater: (list: SqlTab[]) => SqlTab[]) => {
      setTabsByConn((prev) => ({ ...prev, [key]: updater(prev[key] ?? tabsFor(key)) }));
    },
    [tabsFor],
  );

  function patchTab(id: string, partial: Partial<SqlTab>) {
    updateTabs(connKey, (list) => list.map((t) => (t.id === id ? { ...t, ...partial } : t)));
  }

  function addTab() {
    tabCounter.current += 1;
    const tab = newTab(tabCounter.current);
    updateTabs(connKey, (list) => [...list, tab]);
    setActiveTabId(tab.id);
  }

  function closeTab(id: string) {
    const list = tabsFor(connKey);
    if (list.length <= 1) return;
    const next = list.filter((t) => t.id !== id);
    updateTabs(connKey, () => next);
    if (id === activeTabId) setActiveTabId(next[next.length - 1].id);
  }

  // Open (or focus) the connect-to-database flow as a tab, so adding a
  // connection never hides the current queries — you can switch right back.
  function openConnect() {
    const list = tabsFor(connKey);
    const existing = list.find((t) => t.view === "connect");
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    tabCounter.current += 1;
    const tab: SqlTab = {
      id: `tab-connect-${Date.now()}-${tabCounter.current}`,
      title: "Connect",
      view: "connect",
      sql: "",
      response: null,
      execError: null,
    };
    updateTabs(connKey, (l) => [...l, tab]);
    setActiveTabId(tab.id);
  }

  // Open (or focus) a read-only catalog surface for a connection.
  function openView(profileId: string, view: "dbInfo" | "dataTypes") {
    onFocusConnection(profileId);
    const list = tabsByConn[profileId] ?? tabsFor(profileId);
    const existing = list.find((t) => t.view === view);
    if (existing) {
      setActiveIdByConn((a) => ({ ...a, [profileId]: existing.id }));
      return;
    }
    tabCounter.current += 1;
    const tab: SqlTab = {
      id: `tab-${Date.now()}-${tabCounter.current}`,
      title: view === "dbInfo" ? "Database Info" : "Data Types",
      view,
      sql: "",
      response: null,
      execError: null,
    };
    setTabsByConn((prev) => ({ ...prev, [profileId]: [...(prev[profileId] ?? tabsFor(profileId)), tab] }));
    setActiveIdByConn((a) => ({ ...a, [profileId]: tab.id }));
  }

  function refreshConnection(profileId: string) {
    setTreeKeys((k) => ({ ...k, [profileId]: (k[profileId] ?? 0) + 1 }));
  }

  function startRename(id: string, current: string) {
    setRenaming({ id, value: current });
  }

  function commitRename() {
    setRenaming((r) => {
      if (r) {
        const title = r.value.trim();
        if (title) updateTabs(connKey, (list) => list.map((t) => (t.id === r.id ? { ...t, title } : t)));
      }
      return null;
    });
  }

  const run = useCallback(
    async (scope: "statement" | "selection" | "script") => {
      if (!connection) {
        openConnect();
        return;
      }
      if (running || activeTab.view !== "sql") return;

      const editor = editorRef.current;
      const full = activeTab.sql;
      let sqlToRun = full;
      if (scope === "selection" && editor) {
        const sel = editor.getSelection();
        const selected = sel ? editor.getModel()?.getValueInRange(sel) ?? "" : "";
        sqlToRun = selected.trim() || full;
      } else if (scope === "statement" && editor) {
        const model = editor.getModel();
        const pos = editor.getPosition();
        if (model && pos) sqlToRun = statementAtOffset(full, model.getOffsetAt(pos));
      }
      // Cursor after a trailing ";" (common right after opening an object) yields
      // an empty statement — fall back to running the whole tab so Run always acts.
      if (!sqlToRun.trim()) sqlToRun = full;
      if (!sqlToRun.trim()) return;

      setRunning(true);
      setResultTab("results");
      patchTab(activeTab.id, { execError: null });
      try {
        const result = await ipc.executeSql(connection.profile.id, connection.profile.name, sqlToRun, maxRows);
        if (!result.success) {
          const failed = result.results.find((r) => r.error);
          patchTab(activeTab.id, { response: result, execError: failed?.error ?? "Statement failed." });
          setResultTab("messages");
        } else {
          patchTab(activeTab.id, { response: result, execError: null });
        }
        loadHistory();
      } catch (err) {
        patchTab(activeTab.id, { execError: errorMessage(err) });
        setResultTab("messages");
      } finally {
        setRunning(false);
      }
    },
    [connection, running, activeTab, maxRows, loadHistory],
  );

  async function saveTab() {
    const suggested = `${activeTab.title.replace(/\s+/g, "_").toLowerCase()}.sql`;
    // In the desktop app, use a real native "Save As" dialog and write the
    // file; in the browser preview, fall back to a blob download.
    if (isTauri()) {
      try {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const path = await save({
          defaultPath: suggested,
          filters: [{ name: "SQL", extensions: ["sql"] }],
        });
        if (path) {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("write_text_file", { path, contents: activeTab.sql });
        }
      } catch {
        // Dialog cancelled or unavailable — nothing to do.
      }
      return;
    }
    const blob = new Blob([activeTab.sql], { type: "application/sql" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = suggested;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Opening a database object launches it in its own new query tab, scoped to
  // the connection it belongs to.
  function openObject(profileId: string, sch: string, name: string) {
    onFocusConnection(profileId);
    tabCounter.current += 1;
    const tab: SqlTab = {
      id: `tab-${Date.now()}-${tabCounter.current}`,
      title: name,
      view: "sql",
      sql: `SELECT *\nFROM "${sch}"."${name}"\nLIMIT ${maxRows};`,
      response: null,
      execError: null,
    };
    setTabsByConn((prev) => ({ ...prev, [profileId]: [...(prev[profileId] ?? tabsFor(profileId)), tab] }));
    setActiveIdByConn((a) => ({ ...a, [profileId]: tab.id }));
  }

  const lastResult = activeTab.response?.results.at(-1) ?? null;
  const contextSummary = connection
    ? `Connected to ${connection.server.databaseName ?? "Exasol"} ${connection.server.version ?? ""} as ${connection.server.currentUser}.${schema ? ` Current schema: ${schema}.` : ""}`
    : "Not connected to a database yet.";

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      <TitleBar
        connection={connection}
        onConnect={openConnect}
        onDisconnect={onDisconnect}
        hideConnect={activeTab.view === "connect"}
      />

      <div className="flex min-h-0 flex-1">
        <ActivityRail
          active={activity}
          sidebarOpen={sidebarOpen}
          aiOpen={aiOpen}
          onSelect={(id) => {
            if (id === activity && sidebarOpen) {
              sidebarPanelRef.current?.collapse();
              setSidebarOpen(false);
            } else {
              setActivity(id);
              setSidebarOpen(true);
              sidebarPanelRef.current?.expand();
            }
          }}
          onToggleAi={() =>
            setAiOpen((o) => {
              const next = !o;
              if (next) aiPanelRef.current?.expand();
              else aiPanelRef.current?.collapse();
              return next;
            })
          }
        />

        <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
          {/* Left navigator — resizable + collapsible */}
          <ResizablePanel
            panelRef={sidebarPanelRef}
            collapsible
            collapsedSize="0px"
            defaultSize="256px"
            minSize="184px"
            maxSize="460px"
            onResize={() => setSidebarOpen(!(sidebarPanelRef.current?.isCollapsed() ?? false))}
            className="min-w-0 border-r border-border"
          >
            <Sidebar
              activity={activity}
              connections={connections}
              activeProfileId={connection?.profile.id ?? null}
              treeKeys={treeKeys}
              onOpenObject={openObject}
              onConnect={openConnect}
              onFocusConnection={onFocusConnection}
              onDisconnect={onDisconnect}
              onRefreshConnection={refreshConnection}
              onOpenView={openView}
              onCollapse={() => {
                sidebarPanelRef.current?.collapse();
                setSidebarOpen(false);
              }}
            />
          </ResizablePanel>
          <ResizableHandle groupDirection="horizontal" />

          {/* Editor column */}
          <ResizablePanel minSize="360px" className="min-w-0">
            <div className="relative flex h-full min-w-0 flex-col bg-editor">
          <>
          {/* Tab strip */}
          <div className="flex h-9 shrink-0 items-center border-b border-border bg-titlebar pr-1">
            <div className="flex min-w-0 flex-1 items-center overflow-x-auto">
              {tabs.map((tab) => {
                const TabIcon = TAB_ICON[tab.view];
                const isEditing = renaming?.id === tab.id;
                return (
                  <div
                    key={tab.id}
                    onClick={() => setActiveTabId(tab.id)}
                    onDoubleClick={() => {
                      if (tab.view === "sql") startRename(tab.id, tab.title);
                    }}
                    title={tab.view === "sql" ? "Double-click to rename" : undefined}
                    className={cn(
                      "group flex h-9 shrink-0 cursor-pointer items-center gap-1.5 border-r border-border px-3 text-[12px] select-none",
                      tab.id === activeTabId
                        ? "bg-editor text-foreground"
                        : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground",
                    )}
                  >
                    <TabIcon className={cn("h-3.5 w-3.5 shrink-0", tab.id === activeTabId && "text-primary")} />
                    {isEditing ? (
                      <input
                        autoFocus
                        value={renaming!.value}
                        onChange={(e) => setRenaming((r) => (r ? { ...r, value: e.target.value } : r))}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          else if (e.key === "Escape") setRenaming(null);
                        }}
                        className="h-5 w-28 rounded border border-primary/50 bg-background px-1 text-[12px] text-foreground outline-none"
                      />
                    ) : (
                      <span className="max-w-[140px] truncate">{tab.title}</span>
                    )}
                    {tabs.length > 1 && !isEditing ? (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="Close tab"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeTab(tab.id);
                        }}
                        className="ml-1 rounded p-0.5 opacity-0 hover:bg-secondary group-hover:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </span>
                    ) : null}
                  </div>
                );
              })}
              {/* New-tab button sits directly after the last tab. */}
              <button
                aria-label="New query tab"
                onClick={addTab}
                className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Toolbar — hidden on the connect tab (it has its own header) */}
          {activeTab.view !== "connect" ? (
          <div className="flex h-10 shrink-0 flex-wrap items-center gap-1 border-b border-border px-2">
            {!isSpecialTab ? (
              <>
                <button
                  onClick={() => run("statement")}
                  disabled={running}
                  className="cta-glow flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-50"
                >
                  {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                  Run
                </button>
                <IconButton label="Run selection" onClick={() => run("selection")} disabled={running}>
                  <ListChecks className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton label="Run entire script" onClick={() => run("script")} disabled={running}>
                  <Zap className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton label="Stop" disabled={!running}>
                  <Square className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton label="Save script (.sql)" onClick={saveTab}>
                  <Save className="h-3.5 w-3.5" />
                </IconButton>
                <div className="mx-1 h-5 w-px bg-border" />
              </>
            ) : (
              <span className="flex items-center gap-1.5 px-1 text-[12px] font-medium text-foreground">
                {(() => {
                  const TabIcon = TAB_ICON[activeTab.view];
                  return <TabIcon className="h-3.5 w-3.5 text-primary" />;
                })()}
                {activeTab.title}
              </span>
            )}

            <ConnectionSwitcher
              connections={connections}
              activeProfileId={connection?.profile.id ?? null}
              onFocus={onFocusConnection}
            />

            {!isSpecialTab ? (
              <>
                <Selector
                  value={schema || "schema"}
                  options={schemas}
                  onChange={setSchema}
                  disabled={!connected || schemas.length === 0}
                  label="Schema"
                />
                <div className="flex items-center gap-1.5 pl-1 text-[11px] text-muted-foreground">
                  <span>Max rows</span>
                  <Select value={String(maxRows)} onValueChange={(v) => setMaxRows(Number(v))}>
                    <SelectTrigger className="h-6 w-24 text-xs" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MAX_ROWS_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n.toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}
          </div>
          ) : null}

          {/* Connect flow, catalog surface, or the SQL editor + results */}
          {activeTab.view === "connect" ? (
            <div className="min-h-0 flex-1">
              <ConnectView
                drivers={drivers}
                profiles={profiles}
                onSaved={onSaved}
                onConnected={onConnected}
              />
            </div>
          ) : isSpecialTab && connection ? (
            <div className="min-h-0 flex-1">
              {activeTab.view === "dbInfo" ? (
                <DatabaseInfoPanel
                  profileId={connection.profile.id}
                  connectionName={connection.profile.name}
                />
              ) : (
                <DataTypesPanel
                  profileId={connection.profile.id}
                  connectionName={connection.profile.name}
                />
              )}
            </div>
          ) : (
            <ResizablePanelGroup direction="vertical" className="min-h-0 flex-1">
              <ResizablePanel defaultSize="55%" minSize="120px" className="min-h-0">
                <Editor
                  beforeMount={defineMonacoThemes}
                  defaultLanguage="sql"
                  path={`${connKey}/${activeTab.id}.sql`}
                  height="100%"
                  value={activeTab.sql}
                  theme={editorTheme}
                  onChange={(value) => patchTab(activeTab.id, { sql: value ?? "" })}
                  onMount={(editor, monaco) => {
                    editorRef.current = editor;
                    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => void run("statement"));
                    editor.addCommand(
                      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
                      () => void run("script"),
                    );
                  }}
                  options={{
                    automaticLayout: true,
                    fontFamily: "JetBrains Mono",
                    fontSize: 13,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    padding: { top: 10 },
                    renderLineHighlight: "all",
                    smoothScrolling: true,
                  }}
                />
              </ResizablePanel>
              <ResizableHandle groupDirection="vertical" />
              <ResizablePanel defaultSize="45%" minSize="80px" className="min-h-0">
                <div className="flex h-full min-h-0 flex-col bg-panel">
                  <div className="flex h-8 shrink-0 items-center gap-1 border-y border-border px-2">
                    {(["results", "messages"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setResultTab(t)}
                        className={cn(
                          "h-6 rounded-md px-2.5 text-[12px] font-medium capitalize transition",
                          resultTab === t ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {t}
                      </button>
                    ))}
                    {lastResult ? (
                      <span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                        {lastResult.kind === "resultSet" ? (
                          <>
                            {lastResult.rowCount} rows{lastResult.truncated ? " (truncated)" : ""}
                          </>
                        ) : null}
                        · {activeTab.response?.totalElapsedMs ?? 0} ms
                      </span>
                    ) : null}
                  </div>
                  <div className="min-h-0 flex-1">
                    {resultTab === "results" ? (
                      <ResultsGrid result={lastResult} error={null} />
                    ) : (
                      <ResultsGrid result={null} error={activeTab.execError} />
                    )}
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
          </>
            </div>
          </ResizablePanel>
          <ResizableHandle groupDirection="horizontal" />

          {/* AI assistant — resizable + collapsible */}
          <ResizablePanel
            panelRef={aiPanelRef}
            collapsible
            collapsedSize="0px"
            defaultSize="320px"
            minSize="240px"
            maxSize="520px"
            onResize={() => setAiOpen(!(aiPanelRef.current?.isCollapsed() ?? false))}
            className="min-w-0"
          >
            <AssistantPanel
              contextSummary={contextSummary}
              editorSql={activeTab.sql}
              onCollapse={() => {
                aiPanelRef.current?.collapse();
                setAiOpen(false);
              }}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <div className={cn("shrink-0 transition-all", historyOpen ? "h-[240px]" : "h-9")}>
        <HistoryDock
          entries={history}
          open={historyOpen}
          onToggle={() => setHistoryOpen((o) => !o)}
          onPick={(value) => {
            patchTab(activeTab.id, { sql: value });
            setHistoryOpen(false);
          }}
          onClear={() => ipc.sqlHistoryClear().then(loadHistory)}
          onRefresh={loadHistory}
        />
      </div>

      <footer className="flex h-6 shrink-0 items-center justify-between border-t border-border bg-titlebar px-3 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <Database className={cn("h-3 w-3", connected && "text-primary")} />
          <span className="font-mono">
            {connected ? `session ${connection!.server.sessionId}` : "no active session"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {connections.length > 1 ? (
            <span>{connections.length} connections</span>
          ) : null}
          {connected ? <span>{tabs.length} tab{tabs.length === 1 ? "" : "s"}</span> : null}
          <span className="flex items-center gap-1">
            <Activity className={cn("h-3 w-3", running && "text-primary")} />
            {running ? "running" : connected ? "idle" : "offline"}
          </span>
        </div>
      </footer>
    </div>
  );
}

function Selector({
  icon,
  value,
  options,
  onChange,
  disabled,
  label,
}: {
  icon?: React.ReactNode;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <Select value={options.includes(value) ? value : undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-6 min-w-[120px] gap-1.5 text-xs" size="sm" aria-label={label}>
        {icon}
        <SelectValue placeholder={value} />
      </SelectTrigger>
      <SelectContent>
        {options.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">{value}</div>
        ) : (
          options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

/** Toolbar switcher across all open connections (focus follows selection). */
function ConnectionSwitcher({
  connections,
  activeProfileId,
  onFocus,
}: {
  connections: ActiveConnection[];
  activeProfileId: string | null;
  onFocus: (profileId: string) => void;
}) {
  return (
    <Select
      value={activeProfileId ?? undefined}
      onValueChange={onFocus}
      disabled={connections.length === 0}
    >
      <SelectTrigger className="h-6 min-w-[140px] gap-1.5 text-xs" size="sm" aria-label="Connection">
        <Database className="h-3.5 w-3.5 text-primary" />
        <SelectValue placeholder="not connected" />
      </SelectTrigger>
      <SelectContent>
        {connections.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">not connected</div>
        ) : (
          connections.map((c) => (
            <SelectItem key={c.profile.id} value={c.profile.id}>
              {c.profile.name}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
