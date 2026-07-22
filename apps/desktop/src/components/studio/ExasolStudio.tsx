import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import { registerExasolCompletion, buildCatalog, emptyCatalog, type SqlCatalog } from "@/lib/sql-completion";
import { InlineSqlDiff, type InlineDiffState } from "@/features/workbench/InlineSqlDiff";
import {
  Activity,
  BarChart3,
  Blocks,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  Boxes,
  ChevronRight,
  ChevronsDownUp,
  CircleSlash2,
  Combine,
  Database,
  Eye,
  FileCode2,
  GitBranch,
  NotebookPen,
  GitCommitHorizontal,
  History,
  Info,
  ListChecks,
  MoreHorizontal,
  Loader2,
  PanelLeftClose,
  PanelRight,
  Pin,
  Play,
  Plug,
  PlugZap,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  Pencil,
  SaveAll,
  Search,
  Settings2,
  Shapes,
  Shield,
  Sparkles,
  Square,
  Star,
  Store,
  SquareTerminal,
  Table2,
  Terminal,
  Trash2,
  Unplug,
  HardDriveUpload,
  Waypoints,
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
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ConnectionInfoPanel } from "@/features/workbench/ConnectionInfoPanel";
import { WelcomeScreen } from "@/features/workbench/WelcomeScreen";
import { DataTypesPanel } from "@/features/workbench/DataTypesPanel";
import { DbaDashboard } from "@/features/workbench/DbaDashboard";
import { ObjectSearch } from "@/features/workbench/ObjectSearch";
import { FileExplorer } from "@/features/workbench/FileExplorer";
import { FilePreviewPanel } from "@/features/workbench/FilePreviewPanel";
import { Visualizer } from "@/features/workbench/Visualizer";
import { Marketplace } from "@/features/marketplace/Marketplace";
import { Docs } from "@/features/marketplace/Docs";
import { DashboardsTab } from "@/features/bi/Dashboards";
import { ArtifactTab } from "@/features/artifact/ArtifactTab";
import { artifacts as artifactClient } from "@/lib/agent-client";
import { AgentCursor, type AgentCursorHandle, type CursorMode } from "@/components/studio/AgentCursor";
import { UiGraph } from "@/lib/ui-graph";
import { dashboardBus } from "@/lib/dashboard-bus";
import { addLearnedEdges, initTraceRecorder, recordTransition } from "@/lib/ui-trace";
import { FloatingPet } from "@/components/studio/FloatingPet";
import { TerminalView } from "@/features/workbench/TerminalView";
import { invoke } from "@tauri-apps/api/core";
import { termBusReady } from "@/lib/term-bus";
import { agent as agentClient } from "@/lib/agent-client";
import { ActivityRail, type ActivityId } from "@/features/workbench/ActivityRail";
import { Notifications } from "@/features/workbench/Notifications";
import { ConnectView } from "@/features/connection/ConnectView";
import { McpMarketplace } from "@/features/marketplace/McpMarketplace";
import { McpConfigTab } from "@/features/marketplace/McpConfigTab";
import { NewVirtualSchema } from "@/features/connection/NewVirtualSchema";
import { BucketFsPanel } from "@/features/connection/BucketFsPanel";
import { LoadDataDialog } from "@/features/workbench/LoadDataDialog";
import { EditableResultGrid } from "@/features/workbench/EditableResultGrid";
import { ObjectContextMenu, ObjectActionDialog, type ObjectAction } from "@/features/workbench/ObjectContextMenu";
import { ObjectDetailPanel, type ObjectRef } from "@/features/workbench/ObjectDetailPanel";
import { FavoritesPanel } from "@/features/workbench/FavoritesPanel";
import { GitPanel } from "@/features/workbench/GitPanel";
import { NotebookTab } from "@/features/workbench/NotebookTab";
import { SkillsTab } from "@/features/workbench/SkillsTab";
import { addFavorite, type Favorite } from "@/lib/favorites";
import type { TreeNode } from "@/features/workbench/tree-model";
import { openSettingsWindow } from "@/lib/settings-window";

/** Detect a simple single-table SELECT (safe to edit inline). Null otherwise. */
function parseSingleTable(sql: string): { schema?: string; table: string } | null {
  // Normalize whitespace FIRST: builder/tree SQL is multi-line ("SELECT *\nFROM…")
  // and the single-space " from " probe below never matched it — which is why
  // query-builder results weren't editable while hand-typed one-liners were.
  const s = sql.trim().replace(/;+\s*$/, "").replace(/\s+/g, " ");
  if (!/^select\b/i.test(s)) return null;
  if (/\bjoin\b|\bgroup\s+by\b|\bunion\b|\bhaving\b|\bdistinct\b/i.test(s)) return null;
  const fromIdx = s.toLowerCase().indexOf(" from ");
  if (fromIdx < 0) return null;
  if (/\(/.test(s.slice(6, fromIdx))) return null; // function/aggregate in projection
  const m = s.slice(fromIdx + 6).match(/^\s*("?[\w$]+"?)(?:\s*\.\s*("?[\w$]+"?))?/);
  if (!m) return null;
  const clean = (x: string) => x.replace(/"/g, "");
  return m[2] ? { schema: clean(m[1]), table: clean(m[2]) } : { table: clean(m[1]) };
}
import { openVsWindow, VS_DONE } from "@/lib/vs-window";
import { AssistantPanel } from "@/features/assistant/AssistantPanel";
import {
  errorMessage,
  ipc,
  isTauri,
  type ConnectionProfile,
  type PersonalLocalStatus,
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
type TabView = "sql" | "dbInfo" | "dataTypes" | "connect" | "visualizer" | "filePreview" | "marketplace" | "guides" | "object" | "dba" | "bi" | "connInfo" | "welcome" | "artifact" | "mcpConfig" | "git" | "notebook" | "skills";

type SqlTab = {
  id: string;
  title: string;
  view: TabView;
  sql: string;
  response: ExecuteResponse | null;
  execError: string | null;
  pinned?: boolean;
  /** For filePreview tabs — the local file path being previewed. */
  filePath?: string;
  /** True when this tab's backing file was deleted on disk (title struck out). */
  fileMissing?: boolean;
  /** Membership in a collapsible tab group (see TabGroup). */
  groupId?: string;
  /** For mcpConfig tabs — which connector preset to configure. */
  mcpPreset?: string;
  /** For object tabs — the database object being inspected. */
  objectRef?: ObjectRef;
  /** For object tabs — the owning connection. */
  objectProfileId?: string;
  /** Execution lifecycle for the status strip (started/running/completed). */
  runMeta?: { startedAt: number; finishedAt?: number; scope: string; ok?: boolean };
  /** For artifact tabs — the rendered HTML document. */
  artifactHtml?: string;
};

/** A collapsible group of query/view tabs shown as one chip in the tab strip. */
type TabGroup = { id: string; name: string; collapsed: boolean };

function newTab(index: number): SqlTab {
  return {
    id: `tab-${Date.now()}-${index}`,
    title: `Untitled-${index}`,
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
  dba: Shield,
  dataTypes: Shapes,
  connect: Plug,
  visualizer: Eye,
  filePreview: Table2,
  mcpConfig: PlugZap,
  marketplace: Store,
  guides: BookOpen,
  object: Table2,
  bi: BarChart3,
  connInfo: Plug,
  welcome: Sparkles,
  artifact: FileCode2,
  git: GitBranch,
  notebook: NotebookPen,
  skills: Sparkles,
};

/** Shown when a connection bucket has no open tabs (VS Code-style start page). */
const WELCOME_TAB: SqlTab = {
  id: "__welcome__",
  title: "Welcome",
  view: "welcome",
  sql: "",
  response: null,
  execError: null,
};

/** Sentinel key for the not-connected tab bucket. */
const NO_CONNECTION = "__none__";

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

type Stmt = { text: string; start: number; end: number };

/**
 * Split SQL into statements on top-level semicolons, ignoring semicolons inside
 * single/double quotes, line comments (--), and block comments. Mirrors the
 * backend splitter so "Run" sends exactly what the server will execute.
 */
function splitStatements(sql: string): Stmt[] {
  const out: Stmt[] = [];
  let start = 0;
  let inSingle = false;
  let inDouble = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const n = sql[i + 1];
    if (inLine) {
      if (c === "\n") inLine = false;
      continue;
    }
    if (inBlock) {
      if (c === "*" && n === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inSingle) {
      if (c === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (c === '"') inDouble = false;
      continue;
    }
    if (c === "'") inSingle = true;
    else if (c === '"') inDouble = true;
    else if (c === "-" && n === "-") {
      inLine = true;
      i++;
    } else if (c === "/" && n === "*") {
      inBlock = true;
      i++;
    } else if (c === ";") {
      const text = sql.slice(start, i).trim();
      if (text) out.push({ text, start, end: i });
      start = i + 1;
    }
  }
  const tail = sql.slice(start).trim();
  if (tail) out.push({ text: tail, start, end: sql.length });
  return out;
}

/**
 * The statement the cursor is in — or the nearest one before it (so a cursor
 * resting after a trailing ";" still runs the query you just wrote), or the
 * whole input if it is a single unterminated statement.
 */
function statementAtOffset(sql: string, offset: number): string {
  const stmts = splitStatements(sql);
  if (stmts.length === 0) return sql.trim();
  for (const s of stmts) {
    if (offset <= s.end) return s.text;
  }
  return stmts[stmts.length - 1].text;
}

/** Strip line (--) and block comments, preserving string literals. */
function stripSqlComments(sql: string): string {
  let out = "";
  let inSingle = false;
  let inDouble = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const n = sql[i + 1];
    if (inLine) {
      if (c === "\n") {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === "*" && n === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inSingle) {
      out += c;
      if (c === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      out += c;
      if (c === '"') inDouble = false;
      continue;
    }
    if (c === "'") {
      inSingle = true;
      out += c;
    } else if (c === '"') {
      inDouble = true;
      out += c;
    } else if (c === "-" && n === "-") {
      inLine = true;
      i++;
    } else if (c === "/" && n === "*") {
      inBlock = true;
      i++;
    } else {
      out += c;
    }
  }
  return out;
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
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
            active && "text-primary",
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
            // Never pass the handler directly: onClick's MouseEvent would land
            // in disconnect(profileId?) and be mistaken for a profile id.
            onClick={() => onDisconnect()}
            className="flex h-6 items-center gap-1.5 rounded-md border border-border px-2 text-[11px] hover:border-destructive/50 hover:text-foreground"
          >
            <Unplug className="h-3.5 w-3.5" />
            Disconnect
          </button>
        ) : hideConnect ? null : (
          <button
            onClick={onConnect}
            data-agent-id="titlebar.connect"
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

// Activities with a simple placeholder panel (databases/files/visualizer have
// their own dedicated panels).
const PLACEHOLDERS: Record<"favorites" | "git" | "marketplace", { icon: typeof Star; title: string; body: string }> = {
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
  onNewVs,
  onUploadDriver,
  onContext,
  onOpenDetails,
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
  onOpenView: (view: "dbInfo" | "dataTypes" | "dba" | "connInfo") => void;
  onNewVs: () => void;
  onUploadDriver: () => void;
  onContext?: (node: import("@/features/workbench/tree-model").TreeNode, x: number, y: number) => void;
  onOpenDetails?: (node: import("@/features/workbench/tree-model").TreeNode) => void;
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
          {/* Two most-used actions stay inline; the rest live in an overflow
              menu so a narrow sidebar never collides names with a row of icons. */}
          <IconButton label="Refresh" onClick={onRefresh}>
            <RefreshCcw className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Collapse all" onClick={() => setCollapseSignal((n) => n + 1)}>
            <ChevronsDownUp className="h-3.5 w-3.5" />
          </IconButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="More actions"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[state=open]:text-foreground"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => onOpenView("connInfo")}>
                <Plug className="h-3.5 w-3.5" /> Connection info
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onOpenView("dbInfo")}>
                <Info className="h-3.5 w-3.5" /> Database info
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onOpenView("dataTypes")}>
                <Shapes className="h-3.5 w-3.5" /> Data types
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onOpenView("dba")}>
                <Shield className="h-3.5 w-3.5" /> DBA dashboard
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onNewVs}>
                <Waypoints className="h-3.5 w-3.5" /> New virtual schema
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onUploadDriver}>
                <HardDriveUpload className="h-3.5 w-3.5" /> Upload driver to BucketFS
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDisconnect()} className="text-destructive focus:text-destructive">
                <Unplug className="h-3.5 w-3.5" /> Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {!collapsed ? (
        <DatabaseTree
          key={treeKey}
          roots={roots}
          onOpenObject={onOpenObject}
          onOpenDetails={onOpenDetails}
          onContext={onContext}
          initialExpandedItems={["schemas"]}
          collapseSignal={collapseSignal}
        />
      ) : null}
    </div>
  );
}

/** Sidebar panel for the Visualizer activity: lists open diagram tabs and
 * opens more. */
function VisualizerPanel({
  tabs,
  activeTabId,
  hasConnection,
  onOpenNew,
  onFocus,
  onClose,
  onConnect,
}: {
  tabs: { id: string; title: string }[];
  activeTabId: string;
  hasConnection: boolean;
  onOpenNew: () => void;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onConnect: () => void;
}) {
  if (!hasConnection) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl text-primary">
          <Eye className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Nothing to visualize yet</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Connect to a database, then open a visualizer to see its tables and foreign keys.
          </p>
        </div>
        <button
          onClick={onConnect}
          className="cta-glow flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary/85"
        >
          <PlugZap className="h-3.5 w-3.5" />
          Connect
        </button>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-2">
        <button
          onClick={onOpenNew}
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border text-[12px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          New visualizer
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1">
        {tabs.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No diagrams open yet.
          </p>
        ) : (
          tabs.map((t) => (
            <div
              key={t.id}
              onClick={() => onFocus(t.id)}
              className={cn(
                "group flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] transition-colors",
                t.id === activeTabId
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <Eye className="h-3.5 w-3.5 shrink-0 text-[#a78bfa]" />
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <span
                role="button"
                tabIndex={0}
                aria-label="Close visualizer"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(t.id);
                }}
                className="rounded p-0.5 opacity-0 hover:bg-secondary group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Sidebar({
  activity,
  connections,
  profiles,
  local,
  activeProfileId,
  treeKeys,
  onOpenObject,
  onConnect,
  onConnectProfile,
  onInstallLocal,
  onFocusConnection,
  onDisconnect,
  onRefreshConnection,
  onOpenView,
  onNewVirtualSchema,
  onUploadDriver,
  onContext,
  onOpenDetails,
  onOpenFavorite,
  onOpenMcpConfig,
  onCollapse,
  onOpenFile,
  onOpenData,
  onLoadData,
  onFileDeleted,
  filesRefresh,
  visualizerTabs,
  activeTabId,
  onOpenNewVisualizer,
  onFocusTab,
  onCloseTab,
}: {
  activity: ActivityId;
  connections: ActiveConnection[];
  profiles: ConnectionProfile[];
  local: PersonalLocalStatus | null;
  activeProfileId: string | null;
  treeKeys: Record<string, number>;
  onOpenObject: (profileId: string, schema: string, name: string) => void;
  onConnect: () => void;
  onConnectProfile: (profileId: string) => void;
  onInstallLocal: () => void;
  onFocusConnection: (profileId: string) => void;
  onDisconnect: (profileId: string) => void;
  onRefreshConnection: (profileId: string) => void;
  onOpenView: (profileId: string, view: "dbInfo" | "dataTypes" | "dba" | "connInfo") => void;
  onNewVirtualSchema: (profileId: string) => void;
  onUploadDriver: (profileId: string) => void;
  onContext: (profileId: string, node: import("@/features/workbench/tree-model").TreeNode, x: number, y: number) => void;
  onOpenDetails: (profileId: string, node: import("@/features/workbench/tree-model").TreeNode) => void;
  onOpenFavorite?: (fav: Favorite) => void;
  onOpenMcpConfig?: (presetId: string, presetName: string) => void;
  onCollapse: () => void;
  onOpenFile: (name: string, content: string, path?: string) => void;
  onOpenData: (name: string, path: string) => void;
  onLoadData: (name: string, path: string) => void;
  onFileDeleted: (path: string) => void;
  filesRefresh: number;
  visualizerTabs: { id: string; title: string }[];
  activeTabId: string;
  onOpenNewVisualizer: () => void;
  onFocusTab: (id: string) => void;
  onCloseTab: (id: string) => void;
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const hasConnections = connections.length > 0;
  const searchProfileId = activeProfileId ?? connections[0]?.profile.id ?? null;
  const connectedIds = new Set(connections.map((c) => c.profile.id));
  // Saved profiles not currently connected — shown as one-tap connect rows
  // (the managed local database lands here, so it's always reachable). Hide:
  // the internal AI read-only identity, any profile whose database is already
  // connected (under any profile), and duplicate profiles for the same DB.
  const normHost = (h: string) => (h === "localhost" ? "127.0.0.1" : h);
  const activeEndpoints = new Set(
    connections.map((c) => `${normHost(c.profile.host)}:${c.profile.port}:${c.profile.username.toUpperCase()}`),
  );
  // Permanent "Exasol Personal (local)" entry: connect when ready, set up/
  // retry when not. Always present so clearing saved connections never hides
  // it. Hidden only while the local DB is the active connection (it's in the
  // tree then).
  // The managed local DB's endpoint comes from its profile (Studio's isolated
  // Personal deployment runs on its own port, e.g. 8565; Nano uses 8563). The
  // permanent card represents that endpoint, so fold any duplicate profile
  // (e.g. a hand-made "sys@localhost") into it instead of listing it twice.
  const localProfile = local?.profileId ? profiles.find((p) => p.id === local.profileId) : undefined;
  const LOCAL_ENDPOINT = localProfile
    ? `${normHost(localProfile.host)}:${localProfile.port}:${localProfile.username.toUpperCase()}`
    : "127.0.0.1:8563:SYS";
  const localReady = local?.state === "ready" || local?.localReady;
  // Connected under the managed profile OR any profile at the local endpoint —
  // either way the card is redundant (the live connection is in the tree).
  const localConnected =
    Boolean(local?.profileId && connectedIds.has(local.profileId)) || activeEndpoints.has(LOCAL_ENDPOINT);
  const showLocalCard = activity === "databases" && !localConnected;

  const seenEndpoints = new Set<string>();
  const disconnected = profiles.filter((p) => {
    if (connectedIds.has(p.id) || p.username.startsWith("STUDIO_MCP_")) return false;
    // The managed local database has its own permanent card below.
    if (local?.profileId && p.id === local.profileId) return false;
    const key = `${normHost(p.host)}:${p.port}:${p.username.toUpperCase()}`;
    if (showLocalCard && key === LOCAL_ENDPOINT) return false;
    if (activeEndpoints.has(key) || seenEndpoints.has(key)) return false;
    seenEndpoints.add(key);
    return true;
  });

  const localCard = showLocalCard ? (
      <div className="border-b border-border/60 px-2 py-2">
        <button
          onClick={() => {
            if (localReady && local?.profileId) onConnectProfile(local.profileId);
            else onInstallLocal();
          }}
          disabled={local?.state === "installing"}
          className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-secondary/60 disabled:opacity-70"
          title="Exasol Personal — local database"
        >
          <Database className="h-3.5 w-3.5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium text-foreground">Exasol Personal (local)</div>
            <div className="truncate text-[10.5px] text-muted-foreground">
              {local?.state === "installing"
                ? local.message || "Setting up…"
                : local?.state === "failed"
                  ? "Setup failed — tap to retry"
                  : localReady
                    ? `${localProfile ? `${localProfile.host}:${localProfile.port}` : "127.0.0.1"} · ready`
                    : "Not installed — tap to set up"}
            </div>
          </div>
          <span className="shrink-0 rounded bg-secondary px-1.5 py-px text-[9px] font-medium uppercase text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground">
            {local?.state === "installing" ? "…" : local?.state === "failed" ? "retry" : localReady ? "connect" : "install"}
          </span>
        </button>
      </div>
    ) : null;
  const savedRows = disconnected.length ? (
    <div className="border-t border-border/60 px-2 py-2">
      {hasConnections ? <div className="px-1 pb-1 eyebrow-muted">Saved connections</div> : null}
      {disconnected.map((p) => {
        const isLocal = p.host === "127.0.0.1" || p.host === "localhost";
        return (
          <button
            key={p.id}
            data-agent-id={`sidebar.saved.${p.id}`}
            onClick={() => onConnectProfile(p.id)}
            className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-secondary/60"
            title={`Connect to ${p.name} (${p.host}:${p.port})`}
          >
            <Database className={cn("h-3.5 w-3.5 shrink-0", isLocal ? "text-primary" : "text-muted-foreground")} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] text-foreground">{p.name}</div>
              <div className="truncate text-[10.5px] text-muted-foreground">
                {p.username}@{p.host}:{p.port}
              </div>
            </div>
            <span className="shrink-0 rounded bg-secondary px-1.5 py-px text-[9px] font-medium uppercase text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground">
              connect
            </span>
          </button>
        );
      })}
    </div>
  ) : null;

  const title =
    activity === "databases"
      ? "Database"
      : activity === "files"
        ? "Files"
        : activity === "visualizer"
          ? "Visualizer"
          : activity === "mcp"
            ? "MCP Servers"
            : PLACEHOLDERS[activity as "favorites" | "git" | "marketplace"].title;

  if (activity !== "databases") {
    return (
      <aside className="flex h-full min-w-0 flex-col bg-panel">
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-border pr-1 pl-3">
          <span className="eyebrow-muted">{title}</span>
          <IconButton label="Collapse sidebar" onClick={onCollapse}>
            <PanelLeftClose className="h-3.5 w-3.5" />
          </IconButton>
        </div>
        {activity === "mcp" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <McpMarketplace onOpenConfig={onOpenMcpConfig} />
          </div>
        ) : activity === "files" ? (
          <FileExplorer onOpenFile={onOpenFile} onOpenData={onOpenData} onLoadData={onLoadData} onFileDeleted={onFileDeleted} refreshSignal={filesRefresh} />
        ) : activity === "favorites" ? (
          <FavoritesPanel profileId={activeProfileId} onOpen={(fav) => onOpenFavorite?.(fav)} />
        ) : activity === "git" ? (
          <GitPanel />
        ) : activity === "visualizer" ? (
          <VisualizerPanel
            tabs={visualizerTabs}
            activeTabId={activeTabId}
            hasConnection={hasConnections}
            onOpenNew={onOpenNewVisualizer}
            onFocus={onFocusTab}
            onClose={onCloseTab}
            onConnect={onConnect}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            {(() => {
              const P = PLACEHOLDERS[activity as "favorites" | "git" | "marketplace"];
              const Icon = P.icon;
              return (
                <>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground">
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
        )}
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-w-0 flex-col bg-panel">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border pr-1 pl-3">
        <span className="eyebrow-muted">{title}</span>
        <div data-tour="add-connection" className="flex items-center gap-0.5">
          <IconButton label="Add connection" data-agent-id="sidebar.add-connection" onClick={onConnect}>
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
        localCard || disconnected.length ? (
          <div className="min-h-0 flex-1 overflow-auto">
            {localCard}
            {savedRows}
            {!disconnected.length ? (
              <p className="px-3 py-3 text-xs leading-relaxed text-muted-foreground">
                Use the <span className="font-semibold text-primary">+</span> button above to add another connection.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl text-primary">
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
        )
      ) : showSearch && searchProfileId ? (
        <ObjectSearch
          key={searchProfileId}
          profileId={searchProfileId}
          onOpenObject={(schema, name) => onOpenObject(searchProfileId, schema, name)}
          onClose={() => setShowSearch(false)}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto py-0.5">
          {localCard}
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
              onNewVs={() => onNewVirtualSchema(conn.profile.id)}
              onUploadDriver={() => onUploadDriver(conn.profile.id)}
              onContext={(node, x, y) => onContext?.(conn.profile.id, node, x, y)}
              onOpenDetails={(node) => onOpenDetails?.(conn.profile.id, node)}
            />
          ))}
          {savedRows}
        </div>
      )}
    </aside>
  );
}

function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}

/** Execution lifecycle: Started → Running (live) → Completed/Failed, with timestamps. */
function RunStatusStrip({
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

function ResultsGrid({
  result,
  error,
  onChart,
  editable,
  onCommitEdits,
  editBusy,
  fontSize = 12,
  zebra = true,
}: {
  result: StatementResult | null;
  error: string | null;
  onChart?: () => void;
  /** Present when this result maps to a single updatable table. */
  editable?: { schema?: string; table: string; pk: string[] } | null;
  onCommitEdits?: (statements: string[]) => void;
  editBusy?: boolean;
  fontSize?: number;
  zebra?: boolean;
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
  const canEdit = Boolean(editable && onCommitEdits);
  if (editing && editable && onCommitEdits) {
    return (
      <EditableResultGrid
        columns={result.columns}
        rows={result.rows}
        schema={editable.schema}
        table={editable.table}
        pk={editable.pk}
        busy={Boolean(editBusy)}
        initialFocus={focusCell}
        colWidths={editColWidths}
        onApply={onCommitEdits}
        onExit={() => {
          setEditing(false);
          setFocusCell(null);
        }}
      />
    );
  }
  return (
    <div className="flex h-full flex-col">
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
        {onChart ? (
          <button
            onClick={onChart}
            title="Open Dashboards"
            className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <BarChart3 className="h-3.5 w-3.5" /> Dashboards
          </button>
        ) : null}
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {result.rowCount} row{result.rowCount === 1 ? "" : "s"} · {result.elapsedMs} ms
        </span>
      </div>
      <div className="h-full min-h-0 flex-1 overflow-auto p-px" style={{ fontSize }}>
        <table ref={roTableRef} className="w-full border-collapse border border-border">
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
              <tr
                key={rowIndex}
                title={canEdit ? "Double-click a cell to edit it" : undefined}
                className={cn("hover:bg-accent/60", zebra && "even:bg-secondary/30", canEdit && "cursor-cell")}
              >
                <td className="border-r border-b border-border px-2 py-1 text-right text-[10px] text-muted-foreground">
                  {rowIndex + 1}
                </td>
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    onDoubleClick={
                      canEdit
                        ? () => startEditing({ row: rowIndex, col: cellIndex })
                        : undefined
                    }
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
        ) : entries.length === 0 ? (
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
  // Local Exasol status drives the permanent "Exasol Personal (local)" entry
  // in the Databases panel (connect when ready, install when not).
  const [localStatus, setLocalStatus] = useState<PersonalLocalStatus | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    void ipc.personalLocalStatus().then(setLocalStatus).catch(() => undefined);
    let un: (() => void) | undefined;
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      un = await listen<PersonalLocalStatus>("personal-local:status", (e) => setLocalStatus(e.payload));
    });
    return () => un?.();
  }, []);

  // Query state — tabs and the active tab are kept per connection, so each
  // database keeps its own workspace. A "__none__" bucket covers the
  // not-connected state so there is always a valid active tab.
  const connKey = connection?.profile.id ?? NO_CONNECTION;
  const [tabsByConn, setTabsByConn] = useState<Record<string, SqlTab[]>>({});
  const [activeIdByConn, setActiveIdByConn] = useState<Record<string, string>>({});
  const [groupsByConn, setGroupsByConn] = useState<Record<string, TabGroup[]>>({});
  // Right-click menu on a tab (group operations).
  const [tabMenu, setTabMenu] = useState<{ tabId: string; x: number; y: number } | null>(null);
  const [running, setRunning] = useState(false);
  // Inline tab rename (double-click a tab title).
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [resultTab, setResultTab] = useState<"results" | "messages">("results");
  const [maxRows, setMaxRows] = useState(1000);
  const [schema, setSchema] = useState<string>("");
  const [schemas, setSchemas] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [wsPath, setWsPath] = useState<string | null>(null);
  const [filesRefresh, setFilesRefresh] = useState(0);
  // Query-toolbar options.
  const [execSettings, setExecSettings] = useState({
    stripComments: false,
    stopOnError: true,
    stopOnWarning: false,
    stopOnNoRows: false,
    showErrorPos: true,
    showErrorStmt: true,
  });
  const [autoCommit, setAutoCommit] = useState(true);
  const [mergeResults, setMergeResults] = useState(false);
  const [queryBuilderOpen, setQueryBuilderOpen] = useState(false);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [aiPrompt, setAiPrompt] = useState<{ text: string; nonce: number; send?: boolean } | null>(null);
  const [namePrompt, setNamePrompt] = useState<{ value: string } | null>(null);
  const [vsFor, setVsFor] = useState<string | null>(null);
  const [bucketFsFor, setBucketFsFor] = useState<ConnectionProfile | null>(null);
  const [loadFor, setLoadFor] = useState<{ name: string; path: string } | null>(null);
  const [editTable, setEditTable] = useState<{ schema?: string; table: string; pk: string[] } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ profileId: string; node: TreeNode; x: number; y: number } | null>(null);
  const [objAction, setObjAction] = useState<{ profileId: string; action: ObjectAction } | null>(null);

  const editorRef = useRef<import("monaco-editor").editor.IStandaloneCodeEditor | null>(null);
  // Live schema catalog feeding the editor's autocompletion (per connection).
  const sqlCatalogRef = useRef<SqlCatalog>(emptyCatalog());
  const refreshSqlCatalog = useCallback(() => {
    const conn = connectionRef.current;
    if (!conn) return;
    ipc
      .executeSql(
        conn.profile.id,
        conn.profile.name,
        "SELECT COLUMN_SCHEMA, COLUMN_TABLE, COLUMN_NAME, COLUMN_TYPE FROM SYS.EXA_ALL_COLUMNS WHERE COLUMN_SCHEMA NOT IN ('SYS','EXA_STATISTICS') ORDER BY 1, 2 LIMIT 20000",
        20000,
        false,
      )
      .then((res) => {
        const table = res.results.find((r) => r.kind === "resultSet" && r.rows?.length);
        if (table?.rows) {
          const scripts = sqlCatalogRef.current.scripts;
          sqlCatalogRef.current = buildCatalog(table.rows as unknown[][]);
          sqlCatalogRef.current.scripts = scripts;
        }
      })
      .catch(() => undefined);
    // User UDFs / Lua / adapter scripts → suggested like built-in functions.
    ipc
      .executeSql(
        conn.profile.id,
        conn.profile.name,
        "SELECT SCRIPT_SCHEMA, SCRIPT_NAME, SCRIPT_LANGUAGE FROM SYS.EXA_ALL_SCRIPTS LIMIT 2000",
        2000,
        false,
      )
      .then((res) => {
        const table = res.results.find((r) => r.kind === "resultSet" && r.rows?.length);
        if (table?.rows) {
          sqlCatalogRef.current.scripts = (table.rows as unknown[][]).map((r) => ({
            schema: String(r[0] ?? ""),
            name: String(r[1] ?? ""),
            type: String(r[2] ?? "SCRIPT"),
          }));
        }
      })
      .catch(() => undefined);
  }, []);
  const connectionRef = useRef(connection);
  connectionRef.current = connection;
  // Fresh on connect, after every statement run, and on a slow freshness tick
  // (catches agent-driven DDL/imports) — so new schemas/tables complete
  // immediately instead of only after reconnecting.
  useEffect(() => {
    sqlCatalogRef.current = emptyCatalog();
    if (!connection) return;
    refreshSqlCatalog();
    const timer = window.setInterval(refreshSqlCatalog, 45_000);
    return () => window.clearInterval(timer);
  }, [connection, refreshSqlCatalog]);
  const tabCounter = useRef(1);
  // Imperative handles for the collapsible side panels.
  const sidebarPanelRef = useRef<PanelImperativeHandle | null>(null);
  const aiPanelRef = useRef<PanelImperativeHandle | null>(null);
  // Stable fallback tab per connection, used for the first render before the
  // bucket is committed to state (avoids identity churn / remounts).
  // A bucket may legitimately have zero tabs — the workspace then shows the
  // Welcome start page (VS Code style). No tab is forced open.
  const tabsFor = useCallback((key: string): SqlTab[] => tabsByConn[key] ?? [], [tabsByConn]);

  const tabs = tabsFor(connKey);
  const activeTab =
    tabs.find((t) => t.id === activeIdByConn[connKey]) ?? tabs[tabs.length - 1] ?? WELCOME_TAB;
  const activeTabId = activeTab.id;
  const isSpecialTab = activeTab.view !== "sql";
  const visualizerTabs = tabs
    .filter((t) => t.view === "visualizer")
    .map((t) => ({ id: t.id, title: t.title }));
  const { theme, setTheme } = useTheme();
  const editorTheme = theme === "dark" ? "exasol-dark" : "exasol-light";
  const [editorFontSize, setEditorFontSize] = useState(13);
  const [editorWordWrap, setEditorWordWrap] = useState(false);
  const [gridFontSize, setGridFontSize] = useState(12);
  const [gridZebra, setGridZebra] = useState(true);

  const setActiveTabId = useCallback(
    (id: string) => setActiveIdByConn((a) => ({ ...a, [connKey]: id })),
    [connKey],
  );

  const toggleAi = useCallback(() => {
    setAiOpen((o) => {
      const next = !o;
      if (next) aiPanelRef.current?.expand();
      else aiPanelRef.current?.collapse();
      return next;
    });
  }, []);

  const loadHistory = useCallback(() => {
    ipc.sqlHistoryList().then(setHistory).catch(() => undefined);
  }, []);
  useEffect(() => loadHistory(), [loadHistory]);

  // Resolve the workspace folder where saved scripts land.
  useEffect(() => {
    ipc.fsWorkspaceDir().then((e) => setWsPath(e.path)).catch(() => undefined);
  }, []);

  // The separate virtual-schema window reports success here → refresh its tree.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<{ profileId: string }>(VS_DONE, (e) => {
        setTreeKeys((k) => ({ ...k, [e.payload.profileId]: (k[e.payload.profileId] ?? 0) + 1 }));
      });
    })();
    return () => unlisten?.();
  }, []);

  // Apply persisted app settings live (initial load + when the Settings window
  // saves a change and broadcasts settings:changed).
  useEffect(() => {
    const apply = (s: Record<string, unknown>) => {
      if (s.theme === "light" || s.theme === "dark") setTheme(s.theme);
      else if (s.theme === "system" && typeof window !== "undefined")
        setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      // Only accept a persisted value that's one of the offered options, so the
      // dropdown always reflects a real default (never a blank/invalid value).
      if (typeof s.maxRows === "number" && MAX_ROWS_OPTIONS.includes(s.maxRows)) setMaxRows(s.maxRows);
      if (typeof s.editorFontSize === "number") setEditorFontSize(s.editorFontSize);
      if (typeof s.wordWrap === "boolean") setEditorWordWrap(s.wordWrap);
      if (typeof s.gridFontSize === "number") setGridFontSize(s.gridFontSize);
      if (typeof s.zebraStripes === "boolean") setGridZebra(s.zebraStripes);
      if (typeof s.autoCommit === "boolean") setAutoCommit(s.autoCommit);
      setExecSettings((v) => ({
        ...v,
        stopOnError: typeof s.stopOnError === "boolean" ? s.stopOnError : v.stopOnError,
        stripComments: typeof s.stripComments === "boolean" ? s.stripComments : v.stripComments,
      }));
    };
    ipc.getAppSettings().then(apply).catch(() => undefined);
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<Record<string, unknown>>("settings:changed", (e) => apply(e.payload));
    })();
    return () => unlisten?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detect whether the active tab's result maps to a single, updatable table
  // (with a primary key) → enables inline editing of the grid.
  useEffect(() => {
    const res = activeTab.response;
    if (!connection || !res?.success || activeTab.view !== "sql") {
      setEditTable(null);
      return;
    }
    const t = parseSingleTable(activeTab.sql);
    const schema = t?.schema ?? connection.profile.schema ?? undefined;
    if (!t || !schema) {
      setEditTable(null);
      return;
    }
    let alive = true;
    ipc
      .getTableDetails(connection.profile.id, schema, t.table)
      .then((d) => {
        if (!alive) return;
        const pk =
          d.constraints.find((c) => c.constraintType === "PRIMARY KEY")?.columns.map((c) => c.column) ?? [];
        // Editable even without a PK — most Exasol tables have none. The grid
        // falls back to matching rows on all selected column values.
        setEditTable({ schema, table: t.table, pk });
      })
      .catch(() => alive && setEditTable(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab.response, activeTab.sql, activeTab.view, connection]);

  // Apply reviewed CRUD statements, then re-run the tab's query to refresh.
  async function commitEdits(statements: string[]) {
    if (!connection || !statements.length) return;
    setRunning(true);
    try {
      for (const st of statements) {
        await ipc.executeSql(connection.profile.id, connection.profile.name, st, 1, false);
      }
      const res = await ipc.executeSql(
        connection.profile.id,
        connection.profile.name,
        activeTab.sql,
        maxRows,
        false,
      );
      patchTab(activeTab.id, { response: res, execError: null });
      loadHistory();
      refreshSqlCatalog();
      // Tell live views (Visualizer, tree) the catalog may have changed so they
      // re-read schemas/tables — a CREATE/DROP/import just ran.
      window.dispatchEvent(
        new CustomEvent("studio:catalog-changed", { detail: { profileId: connection.profile.id } }),
      );
    } catch (e) {
      patchTab(activeTab.id, { execError: errorMessage(e) });
      setResultTab("messages");
    } finally {
      setRunning(false);
    }
  }

  // Run a reviewed DDL/DCL statement from the tree context menu, then refresh
  // that connection's object tree.
  async function runDdl(profileId: string, sql: string) {
    const conn = connections.find((c) => c.profile.id === profileId);
    if (!conn) return;
    setRunning(true);
    try {
      await ipc.executeSql(profileId, conn.profile.name, sql, 1, false);
      setTreeKeys((k) => ({ ...k, [profileId]: (k[profileId] ?? 0) + 1 }));
      loadHistory();
      refreshSqlCatalog();
      setObjAction(null);
    } catch (e) {
      patchTab(activeTab.id, { execError: errorMessage(e) });
      setResultTab("messages");
      setObjAction(null);
    } finally {
      setRunning(false);
    }
  }

  // If the user chose a starter pack during setup, open the Marketplace — it
  // reads the pending pack and installs the selected items in a visible queue.
  useEffect(() => {
    const raw = window.localStorage.getItem("exasol-studio-pending-pack");
    if (!raw) return;
    try {
      const ids = JSON.parse(raw) as string[];
      if (Array.isArray(ids) && ids.length) openMarketplace();
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  }, [connections]);

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
    tabCounter.current += 1; // still salts ids for uniqueness
    // Title takes the LOWEST free number among current tabs — after closing
    // everything the next tab is "Query 1" again, never "Query 8".
    const used = new Set(
      tabsFor(connKey)
        .map((x) => /^Untitled-(\d+)$/.exec(x.title)?.[1])
        .filter(Boolean)
        .map(Number),
    );
    let n = 1;
    while (used.has(n)) n++;
    const tab = newTab(tabCounter.current);
    tab.title = `Untitled-${n}`;
    updateTabs(connKey, (list) => [...list, tab]);
    setActiveTabId(tab.id);
  }

  // 2) Tab drag & drop: reorder chips; dropping ON a grouped chip adopts its
  // group; dropping on a group header joins that group.
  // Pointer-drag state for tab reordering (see renderTabChip's onPointerDown).
  const tabDrag = useRef<{ id: string; startX: number; moved: boolean } | null>(null);
  const moveTabRef = useRef<(dragId: string, targetId: string | null) => void>(() => undefined);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = tabDrag.current;
      if (!drag) return;
      if (!drag.moved && Math.abs(e.clientX - drag.startX) < 5) return;
      drag.moved = true;
      // Which tab is the pointer over? Reorder live (VS Code style).
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-tab-id]");
      const overId = el?.dataset.tabId;
      if (overId && overId !== drag.id) moveTabRef.current(drag.id, overId);
    };
    const onUp = () => {
      // Keep `moved` briefly so the click handler can suppress the activate.
      const drag = tabDrag.current;
      if (drag?.moved) window.setTimeout(() => (tabDrag.current = null), 0);
      else tabDrag.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  function moveTab(dragId: string, targetId: string | null) {
    if (dragId === targetId) return;
    updateTabs(connKey, (list) => {
      const from = list.findIndex((x) => x.id === dragId);
      if (from < 0) return list;
      const next = [...list];
      const [moved] = next.splice(from, 1);
      if (targetId) {
        const to = next.findIndex((x) => x.id === targetId);
        if (to < 0) return list;
        moved.groupId = next[to].groupId; // adopt target's group (or none)
        next.splice(to, 0, moved);
      } else {
        moved.groupId = undefined;
        next.push(moved);
      }
      return next;
    });
  }
  moveTabRef.current = moveTab;

  // Connect to a saved profile from the Welcome "Recent" list (or fall back to
  // the connect form if it can't connect straight away).
  async function connectSaved(profileId: string) {
    const p = profiles.find((x) => x.id === profileId);
    if (!p) return openConnect();
    // Already open under this profile → just focus it, never reconnect (a
    // second pool to the same DB is what caused the "opened new then went
    // down" behavior).
    if (connections.some((c) => c.profile.id === profileId)) {
      onFocusConnection(profileId);
      return;
    }
    // Already connected to the SAME endpoint under a different profile (e.g.
    // the managed "Local Exasol" vs a hand-made "sys@localhost") → focus that
    // one. One database = one live connection.
    const norm = (h: string) => (h === "localhost" ? "127.0.0.1" : h);
    const same = connections.find(
      (c) => norm(c.profile.host) === norm(p.host) && c.profile.port === p.port && c.profile.username === p.username,
    );
    if (same) {
      onFocusConnection(same.profile.id);
      return;
    }
    try {
      const server = await ipc.connect(p.id);
      await onConnected(p, server);
    } catch {
      openConnect();
    }
  }

  // ── Agent UI control (the pet): ui_* tools land here ──
  const cursorRef = useRef<AgentCursorHandle | null>(null);
  const [extraPets, setExtraPets] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => initTraceRecorder(), []);
  // Plain functions (redefined each render) so they always see the CURRENT
  // connection/tabs — a useCallback([]) here froze them at the disconnected
  // first render and opened tabs in the wrong bucket.
  function openSavedDashboard(id: string) {
    openBiTab();
    window.setTimeout(() => dashboardBus.open(id), 200);
  }

  async function openArtifact(id: string, title: string) {
      const a = await artifactClient.get(id).catch(() => null);
      if (!a) return;
      // Focus an already-open tab for this artifact; otherwise open a NEW one
      // (no limit — many artifacts can be open at once).
      const existing = tabsFor(connKey).find((t) => t.view === "artifact" && t.id.startsWith(`tab-artifact-${id}-`));
      if (existing) {
        setActiveTabId(existing.id);
        return;
      }
      tabCounter.current += 1;
      const tab: SqlTab = {
        id: `tab-artifact-${id}-${tabCounter.current}`,
        title: title || a.title || "Artifact",
        view: "artifact",
        sql: "",
        response: null,
        execError: null,
        artifactHtml: a.html,
      };
      updateTabs(connKey, (l) => [...l, tab]);
      setActiveTabId(tab.id);
  }

  /** Fill a React-controlled input the way a real keystroke would. */
  function fillAnchor(anchor: string, value: string): boolean {
    const el = document.querySelector(`[data-agent-id="${anchor}"]`) as HTMLInputElement | null;
    if (!el) return false;
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  async function overlayConnectDirect(final: { name: string; host: string; port: number; username: string; password: string; schema?: string; notes?: string }): Promise<{ ok: boolean; detail?: string }> {
    const existing = profiles.find((p) => p.name.toLowerCase() === final.name.toLowerCase());
    const profile = await ipc.saveConnectionProfile({
      ...(existing ?? {}),
      id: existing?.id,
      name: final.name,
      host: final.host,
      port: final.port,
      username: final.username,
      password: final.password,
      schema: final.schema,
      notes: final.notes,
      sslMode: existing?.sslMode ?? "preferred",
      compression: existing?.compression ?? false,
      driverId: existing?.driverId ?? "sqlx-exasol",
    });
    await onSaved?.();
    const server = await ipc.connect(profile.id);
    await onConnected(profile, server);
    await agentClient.grantConnection(profile.id).catch(() => undefined);
    return { ok: true, detail: profile.id };
  }



  async function handleUiAction(
    action: string,
    params: Record<string, unknown>,
  ): Promise<{ ok: boolean; detail?: string }> {
    let mode: CursorMode = "pet";
    let avatar: import("@/components/studio/PetAvatar").PetAvatarId = "exa";
    try {
      const { settings } = await agentClient.getSettings();
      mode = settings.petMode;
      avatar = settings.petAvatar ?? "exa";
    } catch {
      // default to pet
    }

    const target = String(params.target ?? "");
    const railId = target === "dashboards" ? "bi" : target;
    const anchorSel =
      action === "connect"
        ? '[data-agent-id="titlebar.connect"]'
        : action === "open"
          ? railId === "query"
            ? '[data-agent-id="tabs.new"]'
            : `[data-agent-id="rail.${railId}"]`
          : action === "editor_insert"
            ? '[data-agent-id="tabs.new"]'
            : null;
    const el = anchorSel ? (document.querySelector(anchorSel) as HTMLElement | null) : null;
    const label =
      action === "connect"
        ? "Connecting…"
        : action === "open"
          ? `Opening ${target}…`
          : "Preparing SQL…";
    await cursorRef.current?.flyTo(el, label, mode, avatar);

    let result: { ok: boolean; detail?: string };
    try {
      if (action === "connect") {
        const wanted = params.name ? String(params.name).toLowerCase() : null;
        const profile = wanted
          ? profiles.find((p) => p.name.toLowerCase() === wanted) ??
            profiles.find((p) => p.name.toLowerCase().includes(wanted))
          : profiles.length === 1
            ? profiles[0]
            : profiles.find((p) => p.host === "localhost" || p.host === "127.0.0.1") ?? null;
        const ping = !profile && !params.host ? await ipc.pingServer("127.0.0.1", 8565).catch(() => null) : null;
        const draft = {
          name: String(params.name ?? profile?.name ?? "Exasol Personal"),
          // 127.0.0.1 over "localhost" — avoids ::1-first resolution stalls.
          host: String(params.host ?? profile?.host ?? "127.0.0.1"),
          port: Number(params.port ?? profile?.port ?? 8565),
          username: String(params.username ?? profile?.username ?? "sys"),
          password: String(params.password ?? profile?.password ?? (ping?.reachable ? "exasol" : "")),
          notes: params.notes ? String(params.notes) : undefined,
        };
        if (mode === "off") {
          try {
            result = await overlayConnectDirect({ ...draft, schema: undefined });
          } catch (e) {
            result = { ok: false, detail: errorMessage(e) };
          }
        } else {
          // Route-planner navigation over the REAL UI: weighted edges,
          // bidirectional search, and Maps-style rerouting when a step fails.
          const g = new UiGraph();
          const anchor = (id: string) => document.querySelector(`[data-agent-id="${id}"]`) as HTMLElement | null;
          // Self-heal if the user (or a re-render) closes the form mid-flow —
          // reopen a couple of times, but don't fight the user forever.
          let reopens = 0;
          const ensureForm = async (): Promise<void> => {
            if (anchor("connect.name")) return;
            if (reopens >= 2) {
              throw new Error("The connect tab was closed — tell me to connect again whenever you're ready.");
            }
            reopens += 1;
            openConnect();
            for (let i = 0; i < 20 && !anchor("connect.name"); i++) {
              await new Promise((r) => setTimeout(r, 100));
            }
            if (!anchor("connect.name")) {
              throw new Error("Couldn't reopen the connect tab.");
            }
          };
          const hop = (id: string, lbl: string) => async () => {
            const el = anchor(id);
            if (!el) return false;
            await cursorRef.current?.flyTo(el, lbl, mode, avatar);
            return true;
          };
          const fillStep = (id: string, value: string, lbl: string) => async () => {
            await ensureForm();
            const el = anchor(id);
            if (!el) return false;
            await cursorRef.current?.flyTo(el, lbl, mode, avatar);
            return fillAnchor(id, value);
          };
          const openTab = (viaAnchor: string) => async () => {
            // Idempotent: if the connect tab is already open, don't click again
            // (a second click could toggle/duplicate it) — just proceed.
            if (anchor("connect.name")) return true;
            const el = anchor(viaAnchor);
            if (!el) return false;
            await cursorRef.current?.flyTo(el, "Opening the connect tab…", mode, avatar);
            openConnect();
            // Wait until the form is actually mounted (up to ~2s), not a fixed delay.
            for (let i = 0; i < 20 && !anchor("connect.name"); i++) {
              await new Promise((r) => setTimeout(r, 100));
            }
            return Boolean(anchor("connect.name"));
          };
          g.node({ id: "connect.tab", verify: () => Boolean(anchor("connect.name")) });
          // Auto-permutations: everything users have ever done becomes a road.
          const curatedNodes = new Set([
            "start", "connect.tab", "name.filled", "host.filled", "user.filled", "pass.filled", "connected",
          ]);
          addLearnedEdges(
            g,
            (id, lbl) => async () => {
              const el = anchor(id);
              if (!el) return false;
              await cursorRef.current?.flyTo(el, lbl, mode, avatar);
              el.click();
              return true;
            },
            (from, to) => curatedNodes.has(from) || curatedNodes.has(to),
          );
          // Two roads into the connect tab — the title bar, or the sidebar (+).
          g.edge({ from: "start", to: "connect.tab", weight: 1, label: "via Connect button", action: openTab("titlebar.connect") });
          g.edge({ from: "start", to: "connect.tab", weight: 2, label: "via sidebar +", action: openTab("sidebar.add-connection") });
          g.edge({ from: "connect.tab", to: "name.filled", weight: 1, label: "name", action: fillStep("connect.name", draft.name, "Naming the connection…") });
          g.edge({ from: "name.filled", to: "host.filled", weight: 1, label: "host", action: fillStep("connect.host", draft.host, "Host…") });
          g.edge({ from: "host.filled", to: "user.filled", weight: 1, label: "username", action: fillStep("connect.username", draft.username, "Username…") });
          g.edge({ from: "user.filled", to: "pass.filled", weight: 1, label: "password", action: fillStep("connect.password", draft.password, "Password…") });
          g.edge({
            from: "pass.filled",
            to: "connected",
            weight: 2,
            label: "connect",
            action: async () => {
              await ensureForm();
              const submit = anchor("connect.submit");
              await cursorRef.current?.flyTo(submit, "Connecting…", mode, avatar);
              // Do the REAL connect via IPC so we get the true outcome — a
              // domain failure (bad password, DB down) throws with the actual
              // message instead of a silent 45s timeout that looks like a
              // blocked road.
              await overlayConnectDirect({ ...draft, schema: undefined });
              return true;
            },
          });
          const nav = await g.navigate("start", "connected", (e) => recordTransition(e.from, e.to));
          result = nav.ok
            ? { ok: true, detail: "connected" }
            : {
                ok: false,
                detail: `Stopped at "${nav.at}" — ${nav.detail ?? "the Connect tab shows the current state; the user can adjust and retry there."}`,
              };
        }
      } else if (action === "open") {
        switch (railId) {
          case "marketplace":
            sidebarPanelRef.current?.collapse();
            setSidebarOpen(false);
            openMarketplace();
            break;
          case "guides":
            sidebarPanelRef.current?.collapse();
            setSidebarOpen(false);
            openGuides();
            break;
          case "bi":
            void openBi();
            break;
          case "settings":
            void openSettingsWindow();
            break;
          case "query":
            await openBuiltSql("", false);
            break;
          default:
            setActivity(railId as ActivityId);
            setSidebarOpen(true);
            sidebarPanelRef.current?.expand();
        }
        result = { ok: true };
      } else if (action === "editor_insert") {
        await openBuiltSql(String(params.sql ?? ""), false);
        result = { ok: true, detail: "SQL opened in a new query tab" };
      } else {
        result = { ok: false, detail: `unknown ui action ${action}` };
      }
    } catch (e) {
      result = { ok: false, detail: errorMessage(e) };
    }
    await cursorRef.current?.finish(result.ok);
    return result;
  }

  // Open a .sql file from disk into a new editor tab (Welcome / VS Code style).
  async function openSqlFile() {
    if (!isTauri()) {
      openFile("scratch.sql", "-- new query\n");
      return;
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ multiple: false, filters: [{ name: "SQL", extensions: ["sql", "txt"] }] });
    if (typeof picked !== "string") return;
    try {
      const text = await ipc.fsReadText(picked);
      openFile(picked.split("/").pop() ?? "query.sql", text, picked);
    } catch {
      /* unreadable */
    }
  }

  // Open a local file's contents as a new query tab in the current workspace.
  function openFile(name: string, content: string, path?: string) {
    tabCounter.current += 1;
    const tab: SqlTab = {
      id: `tab-file-${Date.now()}-${tabCounter.current}`,
      title: name,
      view: "sql",
      sql: content,
      response: null,
      execError: null,
      filePath: path,
    };
    updateTabs(connKey, (list) => [...list, tab]);
    setActiveTabId(tab.id);
  }

  function openMcpConfig(presetId: string, presetName: string) {
    const key = connKey;
    const existing = tabsFor(key).find((x) => x.view === "mcpConfig" && x.mcpPreset === presetId);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    tabCounter.current += 1;
    const tab: SqlTab = {
      id: `tab-mcp-${Date.now()}-${tabCounter.current}`,
      title: `MCP · ${presetName}`,
      view: "mcpConfig",
      mcpPreset: presetId,
      sql: "",
      response: null,
      execError: null,
    };
    updateTabs(key, (list) => [...list, tab]);
    setActiveTabId(tab.id);
  }

  function closeTab(id: string) {
    const list = tabsFor(connKey);
    const next = list.filter((t) => t.id !== id);
    updateTabs(connKey, () => next);
    // Closing the last tab is allowed — the workspace falls back to Welcome.
    if (id === activeTabId) setActiveTabId(next[next.length - 1]?.id ?? "");
    // Drop any group left with no members.
    const live = new Set(next.map((t) => t.groupId).filter(Boolean) as string[]);
    setGroupsByConn((prev) => ({ ...prev, [connKey]: (prev[connKey] ?? []).filter((x) => live.has(x.id)) }));
  }

  function togglePin(id: string) {
    updateTabs(connKey, (list) => list.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)));
  }

  // Bulk tab actions for the tab-bar overflow menu. Pinned tabs are always kept.
  function closeAllTabs() {
    const kept = tabsFor(connKey).filter((t) => t.pinned);
    updateTabs(connKey, () => kept);
    setActiveTabId(kept[kept.length - 1]?.id ?? "");
    const live = new Set(kept.map((t) => t.groupId).filter(Boolean) as string[]);
    setGroupsByConn((prev) => ({ ...prev, [connKey]: (prev[connKey] ?? []).filter((x) => live.has(x.id)) }));
  }
  function closeOtherTabs(keepId: string) {
    const kept = tabsFor(connKey).filter((t) => t.id === keepId || t.pinned);
    updateTabs(connKey, () => kept);
    setActiveTabId(keepId);
    const live = new Set(kept.map((t) => t.groupId).filter(Boolean) as string[]);
    setGroupsByConn((prev) => ({ ...prev, [connKey]: (prev[connKey] ?? []).filter((x) => live.has(x.id)) }));
  }

  // ── Tab groups ────────────────────────────────────────────────────────────
  const groups = groupsByConn[connKey] ?? [];
  const setGroups = useCallback(
    (updater: (g: TabGroup[]) => TabGroup[]) =>
      setGroupsByConn((prev) => ({ ...prev, [connKey]: updater(prev[connKey] ?? []) })),
    [connKey],
  );

  function createGroupFromTab(tabId: string) {
    tabCounter.current += 1;
    const gid = `grp-${Date.now()}-${tabCounter.current}`;
    const n = (groupsByConn[connKey] ?? []).length + 1;
    setGroups((g) => [...g, { id: gid, name: `Group ${n}`, collapsed: false }]);
    updateTabs(connKey, (list) => list.map((t) => (t.id === tabId ? { ...t, groupId: gid } : t)));
  }
  function addTabToGroup(tabId: string, gid: string) {
    updateTabs(connKey, (list) => list.map((t) => (t.id === tabId ? { ...t, groupId: gid } : t)));
  }
  function removeTabFromGroup(tabId: string) {
    const next = (tabsFor(connKey) ?? []).map((t) => (t.id === tabId ? { ...t, groupId: undefined } : t));
    updateTabs(connKey, () => next);
    const live = new Set(next.map((t) => t.groupId).filter(Boolean) as string[]);
    setGroupsByConn((prev) => ({ ...prev, [connKey]: (prev[connKey] ?? []).filter((x) => live.has(x.id)) }));
  }
  function toggleGroup(gid: string) {
    setGroups((g) => g.map((x) => (x.id === gid ? { ...x, collapsed: !x.collapsed } : x)));
  }
  function renameGroup(gid: string, name: string) {
    setGroups((g) => g.map((x) => (x.id === gid ? { ...x, name } : x)));
  }

  // One tab chip in the strip (reused for grouped and ungrouped tabs).
  function renderTabChip(tab: SqlTab, grouped = false) {
    const TabIcon = TAB_ICON[tab.view];
    const isEditing = renaming?.id === tab.id;
    return (
      <div
        key={tab.id}
        data-tab-id={tab.id}
        // Pointer-based drag reorder — HTML5 DnD is unreliable inside the
        // WKWebView titlebar region, so we track the pointer ourselves.
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          tabDrag.current = { id: tab.id, startX: e.clientX, moved: false };
        }}
        onClick={() => {
          // A drag just happened → the pointerup already handled it; don't
          // also treat it as a plain activate-click.
          if (tabDrag.current?.moved) return;
          setActiveTabId(tab.id);
        }}
        onDoubleClick={() => {
          if (tab.view === "sql" || tab.view === "visualizer") startRename(tab.id, tab.title);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setTabMenu({ tabId: tab.id, x: e.clientX, y: e.clientY });
        }}
        title={tab.view === "sql" || tab.view === "visualizer" ? "Double-click to rename · right-click to group" : "Right-click to group"}
        className={cn(
          "group flex h-9 shrink-0 cursor-pointer items-center gap-1.5 border-r border-border px-3 text-[12px] select-none",
          grouped && "border-r-0",
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
          <span
            className={cn(
              "max-w-[140px] truncate",
              tab.fileMissing && "text-destructive line-through decoration-destructive",
            )}
            title={tab.fileMissing ? "The file backing this tab was deleted" : undefined}
          >
            {tab.title}
          </span>
        )}
        {!isEditing ? (
          <span className="ml-1 flex items-center">
            {tab.pinned ? (
              <span
                role="button"
                tabIndex={0}
                aria-label="Unpin tab"
                title="Unpin tab"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePin(tab.id);
                }}
                className="rounded p-0.5 text-primary hover:bg-secondary"
              >
                <Pin className="h-3 w-3 fill-current" />
              </span>
            ) : (
              <>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Pin tab"
                  title="Pin tab"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePin(tab.id);
                  }}
                  className="rounded p-0.5 opacity-0 hover:bg-secondary group-hover:opacity-100"
                >
                  <Pin className="h-3 w-3" />
                </span>
                {(
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Close tab"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    className="rounded p-0.5 opacity-0 hover:bg-secondary group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </>
            )}
          </span>
        ) : null}
      </div>
    );
  }

  // A file was deleted on disk — flag every open tab backed by it (or by a file
  // under it, if a folder was removed) so their titles show struck-out in red.
  const markFileDeleted = useCallback((path: string) => {
    setTabsByConn((prev) => {
      let changed = false;
      const next: Record<string, SqlTab[]> = {};
      for (const [key, list] of Object.entries(prev)) {
        next[key] = list.map((t) => {
          if (t.filePath && (t.filePath === path || t.filePath.startsWith(`${path}/`))) {
            changed = true;
            return { ...t, fileMissing: true };
          }
          return t;
        });
      }
      return changed ? next : prev;
    });
  }, []);

  // Open (and optionally run) a query built in the visual query builder.
  async function openBuiltSql(sql: string, runNow: boolean) {
    const key = connKey;
    tabCounter.current += 1;
    const tab: SqlTab = {
      id: `tab-q-${Date.now()}-${tabCounter.current}`,
      title: "Untitled",
      view: "sql",
      sql,
      response: null,
      execError: null,
    };
    updateTabs(key, (list) => [...list, tab]);
    setActiveIdByConn((a) => ({ ...a, [key]: tab.id }));
    if (runNow && connection) {
      setRunning(true);
      setResultTab("results");
      try {
        const result = await ipc.executeSql(connection.profile.id, connection.profile.name, sql, maxRows, true);
        updateTabs(key, (list) =>
          list.map((t) =>
            t.id === tab.id
              ? {
                  ...t,
                  response: result,
                  execError: result.success ? null : result.results.find((r) => r.error)?.error ?? "Statement failed.",
                }
              : t,
          ),
        );
        if (!result.success) setResultTab("messages");
        loadHistory();
      refreshSqlCatalog();
      } catch (e) {
        updateTabs(key, (list) => list.map((t) => (t.id === tab.id ? { ...t, execError: errorMessage(e) } : t)));
        setResultTab("messages");
      } finally {
        setRunning(false);
      }
    }
  }

  // Open a chat attachment in the workbench: tabular data (CSV/TSV/Parquet)
  // gets the interactive preview tab, other text opens as an editor tab, and
  // images open in the system viewer.
  async function openChatAttachment(f: { name: string; mime: string; kind: string; data: string }) {
    try {
      if (/\.(csv|tsv|parquet)$/i.test(f.name)) {
        let b64: string;
        if (f.kind === "binary") {
          b64 = f.data;
        } else {
          // Chunked encode — a spread would overflow the stack on big files.
          const bytes = new TextEncoder().encode(f.data);
          let bin = "";
          for (let i = 0; i < bytes.length; i += 0x8000) {
            bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          }
          b64 = btoa(bin);
        }
        const path = await ipc.saveAttachment(f.name, b64);
        openData(f.name, path);
      } else if (f.kind === "image") {
        const b64 = f.data.slice(f.data.indexOf(",") + 1);
        const path = await ipc.saveAttachment(f.name, b64);
        const { openPath } = await import("@tauri-apps/plugin-opener");
        await openPath(path);
      } else {
        openFile(f.name, f.data);
      }
    } catch (e) {
      console.error("open attachment failed", e);
    }
  }

  // Open a tabular file (CSV / TSV / Parquet) as a read-only preview tab.
  function openData(name: string, path: string) {
    tabCounter.current += 1;
    const tab: SqlTab = {
      id: `tab-data-${Date.now()}-${tabCounter.current}`,
      title: name,
      view: "filePreview",
      sql: "",
      response: null,
      execError: null,
      filePath: path,
    };
    updateTabs(connKey, (list) => [...list, tab]);
    setActiveTabId(tab.id);
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
  function openView(profileId: string, view: "dbInfo" | "dataTypes" | "dba" | "connInfo") {
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
      title:
        view === "dbInfo"
          ? "Database Info"
          : view === "dataTypes"
            ? "Data Types"
            : view === "connInfo"
              ? "Connection Info"
              : "DBA",
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

  // Open (or focus) the Marketplace as a full tab.
  function openMarketplace() {
    const list = tabsFor(connKey);
    const existing = list.find((t) => t.view === "marketplace");
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    tabCounter.current += 1;
    const tab: SqlTab = {
      id: `tab-mkt-${Date.now()}-${tabCounter.current}`,
      title: "Marketplace",
      view: "marketplace",
      sql: "",
      response: null,
      execError: null,
    };
    updateTabs(connKey, (l) => [...l, tab]);
    setActiveTabId(tab.id);
  }

  // Open (or focus) an object-detail tab for a schema/table/view.
  function openObjectDetails(profileId: string, ctx: { type: string; schema?: string; name: string }) {
    const type = ctx.type as ObjectRef["type"];
    if (!["schema", "virtual-schema", "table", "view", "user"].includes(type)) return;
    const list = tabsFor(connKey);
    const id = `obj:${profileId}:${ctx.schema ?? ""}:${ctx.name}:${type}`;
    const existing = list.find((t) => t.view === "object" && t.id === id);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    const tab: SqlTab = {
      id,
      title: ctx.name,
      view: "object",
      sql: "",
      response: null,
      execError: null,
      objectRef: { type, schema: ctx.schema, name: ctx.name },
      objectProfileId: profileId,
    };
    updateTabs(connKey, (l) => [...l, tab]);
    setActiveTabId(tab.id);
  }

  // Open (or focus) the full-page Source Control (git) tab.
  function openGit() {
    const list = tabsFor(connKey);
    const existing = list.find((t) => t.view === "git");
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    tabCounter.current += 1;
    const tab: SqlTab = {
      id: `tab-git-${Date.now()}-${tabCounter.current}`,
      title: "Source Control",
      view: "git",
      sql: "",
      response: null,
      execError: null,
    };
    updateTabs(connKey, (l) => [...l, tab]);
    setActiveTabId(tab.id);
  }
  const openGitRef = useRef(openGit);
  openGitRef.current = openGit;
  useEffect(() => {
    const on = () => openGitRef.current();
    window.addEventListener("studio:open-git", on);
    return () => window.removeEventListener("studio:open-git", on);
  }, []);

  // Open (or focus) a full-page tab by a simple single-instance view.
  function openSingletonTab(view: "notebook" | "skills", title: string, idPrefix: string) {
    const list = tabsFor(connKey);
    const existing = list.find((t) => t.view === view);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    tabCounter.current += 1;
    const tab: SqlTab = {
      id: `tab-${idPrefix}-${Date.now()}-${tabCounter.current}`,
      title,
      view,
      sql: "",
      response: null,
      execError: null,
    };
    updateTabs(connKey, (l) => [...l, tab]);
    setActiveTabId(tab.id);
  }
  const openNotebook = () => openSingletonTab("notebook", "Notebook", "nb");
  const openSkills = () => openSingletonTab("skills", "Skills", "sk");

  // Open (or focus) the Guides & Docs tab.
  function openGuides() {
    const list = tabsFor(connKey);
    const existing = list.find((t) => t.view === "guides");
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    tabCounter.current += 1;
    const tab: SqlTab = {
      id: `tab-docs-${Date.now()}-${tabCounter.current}`,
      title: "Guides & Docs",
      view: "guides",
      sql: "",
      response: null,
      execError: null,
    };
    updateTabs(connKey, (l) => [...l, tab]);
    setActiveTabId(tab.id);
  }

  // Open the New Virtual Schema flow in a separate native window (falls back to
  // an in-app modal in the browser preview).
  async function openVs(profileId: string) {
    const name = connections.find((c) => c.profile.id === profileId)?.profile.name ?? "Exasol";
    const opened = await openVsWindow({ profileId, connectionName: name });
    if (!opened) setVsFor(profileId);
  }

  // Open a brand-new Visualizer tab (multiple diagrams are allowed).
  function newVisualizer() {
    if (!connection) {
      openConnect();
      return;
    }
    const key = connection.profile.id;
    const list = tabsByConn[key] ?? tabsFor(key);
    const n = list.filter((t) => t.view === "visualizer").length + 1;
    tabCounter.current += 1;
    const tab: SqlTab = {
      id: `tab-viz-${Date.now()}-${tabCounter.current}`,
      title: n === 1 ? "Visualizer" : `Visualizer ${n}`,
      view: "visualizer",
      sql: "",
      response: null,
      execError: null,
    };
    setTabsByConn((prev) => ({ ...prev, [key]: [...(prev[key] ?? tabsFor(key)), tab] }));
    setActiveIdByConn((a) => ({ ...a, [key]: tab.id }));
  }

  // Focus an existing Visualizer tab, or open one if none exist yet.
  function openVisualizer() {
    if (!connection) {
      openConnect();
      return;
    }
    const key = connection.profile.id;
    const list = tabsByConn[key] ?? tabsFor(key);
    const existing = [...list].reverse().find((t) => t.view === "visualizer");
    if (existing) {
      setActiveIdByConn((a) => ({ ...a, [key]: existing.id }));
      return;
    }
    newVisualizer();
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
    async (scope: "statement" | "selection" | "script" | "buffer") => {
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
      if (execSettings.stripComments) sqlToRun = stripSqlComments(sqlToRun);
      if (!sqlToRun.trim()) return;

      // "buffer" runs everything as a single statement; others split.
      const split = scope !== "buffer";

      setRunning(true);
      setResultTab("results");
      const startedAt = Date.now();
      patchTab(activeTab.id, { execError: null, runMeta: { startedAt, scope } });
      try {
        const result = await ipc.executeSql(
          connection.profile.id,
          connection.profile.name,
          sqlToRun,
          maxRows,
          split,
        );
        if (!result.success) {
          const failed = result.results.find((r) => r.error);
          patchTab(activeTab.id, {
            response: result,
            execError: failed?.error ?? "Statement failed.",
            runMeta: { startedAt, finishedAt: Date.now(), scope, ok: false },
          });
          setResultTab("messages");
        } else {
          patchTab(activeTab.id, {
            response: result,
            execError: null,
            runMeta: { startedAt, finishedAt: Date.now(), scope, ok: true },
          });
        }
        loadHistory();
      refreshSqlCatalog();
      } catch (err) {
        patchTab(activeTab.id, {
          execError: errorMessage(err),
          runMeta: { startedAt, finishedAt: Date.now(), scope, ok: false },
        });
        setResultTab("messages");
      } finally {
        setRunning(false);
      }
    },
    [connection, running, activeTab, maxRows, loadHistory, execSettings.stripComments],
  );

  async function saveTab() {
    // A tab opened from an existing file saves back to that same file.
    if (isTauri() && activeTab.filePath) {
      try {
        await ipc.writeTextFile(activeTab.filePath, activeTab.sql);
        // Re-saving recreates a file that may have been deleted — clear the flag.
        updateTabs(connKey, (list) =>
          list.map((t) => (t.id === activeTab.id && t.fileMissing ? { ...t, fileMissing: false } : t)),
        );
        setFilesRefresh((n) => n + 1);
      } catch {
        /* ignore write error */
      }
      return;
    }
    const base = activeTab.title.replace(/\s+/g, "_").toLowerCase().replace(/\.sql$/, "");
    const fileName = `${base}.sql`;
    // Save straight into the workspace folder (shown in the Files panel) —
    // no separate save window. Fall back to a download in the browser preview.
    if (isTauri() && wsPath) {
      try {
        await ipc.writeTextFile(`${wsPath}/${fileName}`, activeTab.sql);
        patchTab(activeTab.id, { title: fileName });
        setFilesRefresh((n) => n + 1);
      } catch {
        /* ignore write error */
      }
      return;
    }
    const blob = new Blob([activeTab.sql], { type: "application/sql" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Save As — prompt for a new name, then write into the workspace.
  async function commitSaveAs() {
    const raw = namePrompt?.value.trim();
    setNamePrompt(null);
    if (!raw || !wsPath) return;
    const file = raw.endsWith(".sql") ? raw : `${raw}.sql`;
    try {
      await ipc.writeTextFile(`${wsPath}/${file}`, activeTab.sql);
      patchTab(activeTab.id, { title: file });
      setFilesRefresh((n) => n + 1);
    } catch {
      /* ignore */
    }
  }

  // Send the current selection (or whole buffer) to the AI for a plan explainer.
  // Professional, KISS prompt library for editor AI actions — every prompt
  // demands evidence (profile_query) and forbids invented plan stages.
  const AI_SQL_PROMPTS: Record<string, (sql: string) => { text: string; send: boolean }> = {
    "explain-plan": (sql) => ({
      send: true,
      text:
        `Explain the execution plan of this SQL in plain language.\n\n` +
        `1) Run profile_query on the statement to get the REAL plan — never guess stages.\n` +
        `2) Explain in at most 6 short bullets: what runs first, join order and join types, where most rows/time go, and any full scans or network redistributions.\n` +
        `3) Finish with exactly ONE improvement backed by the profile (filter, join order, projection, rewrite) — or state plainly that the plan is already efficient.\n\n` +
        `Rules: short sentences; define any jargon in brackets; cite real numbers from the profile; no speculation.\n\n\`\`\`sql\n${sql}\n\`\`\``,
    }),
    explain: (sql) => ({
      send: true,
      text:
        `Explain what this SQL does, for a colleague who didn't write it.\n\n` +
        `At most 5 short bullets: the question it answers, the tables it touches (check the knowledge graph if a name is unclear), how they connect, any filters/grouping that change the meaning. One-line plain-English summary at the end. No jargon without a bracketed definition.\n\n\`\`\`sql\n${sql}\n\`\`\``,
    }),
    optimize: (sql) => ({
      send: true,
      text:
        `Optimize this SQL. First run profile_query to find the REAL bottleneck; then propose ONE optimized rewrite in a sql block with at most 3 bullets on why it is faster. Only claim what the profile supports; if it is already efficient, say so and stop.\n\n\`\`\`sql\n${sql}\n\`\`\``,
    }),
    edit: (sql) => ({
      send: false, // prefill the composer — the user types the instruction
      text: `Edit this SQL: `.concat("\n\n```sql\n", sql, "\n```\n\nInstruction: "),
    }),
  };

  function aiAskSql(kind: keyof typeof AI_SQL_PROMPTS) {
    const editor = editorRef.current;
    const sel = editor?.getSelection();
    const selected = sel ? editor?.getModel()?.getValueInRange(sel) ?? "" : "";
    const sql = (selected.trim() || activeTab.sql).trim();
    if (!sql) return;
    setAiOpen(true);
    aiPanelRef.current?.expand();
    const p = AI_SQL_PROMPTS[kind](sql);
    setAiPrompt({ text: p.text, nonce: Date.now(), send: p.send });
  }

  // Inline AI edits (optimize / fix / edit) → a review diff in the editor with
  // Accept/Decline, instead of routing to the chat. The reviewed range is the
  // current selection, or the whole buffer when nothing is selected.
  const [inlineDiff, setInlineDiff] = useState<InlineDiffState | null>(null);
  const inlineRangeRef = useRef<import("monaco-editor").IRange | null>(null);

  function applyInlineEdit(next: string) {
    const editor = editorRef.current;
    const range = inlineRangeRef.current;
    if (!editor || !range) return;
    editor.executeEdits("ai-inline-edit", [{ range, text: next, forceMoveMarkers: true }]);
    editor.focus();
  }

  async function aiInlineEdit(action: "optimize" | "fix" | "edit") {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;
    const sel = editor.getSelection();
    const hasSel = sel && !sel.isEmpty();
    const range = hasSel ? sel : model.getFullModelRange();
    const sql = model.getValueInRange(range).trim();
    if (!sql) return;
    let instruction: string | undefined;
    if (action === "edit") {
      instruction = window.prompt("Describe the change to make to this SQL:")?.trim();
      if (!instruction) return;
    }
    inlineRangeRef.current = range;
    setInlineDiff({ action, before: sql, after: null, error: null });
    try {
      const out = await agentClient.rewriteSql(sql, action, instruction);
      setInlineDiff((cur) => (cur ? { ...cur, after: out } : cur));
    } catch (e) {
      setInlineDiff((cur) => (cur ? { ...cur, error: errorMessage(e) } : cur));
    }
  }

  const aiAskSqlRef = useRef<(k: string) => void>(() => undefined);
  aiAskSqlRef.current = (k: string) => {
    if (k === "optimize" || k === "fix" || k === "edit") void aiInlineEdit(k);
    else aiAskSql(k as keyof typeof AI_SQL_PROMPTS);
  };

  function aiExplain() {
    aiAskSql("explain-plan");
  }

  // Open (or focus) the Dashboards tab — agent-built dashboards rendered
  // waits for it to come up.
  function openBiTab() {
    const list = tabsFor(connKey);
    const existing = list.find((t) => t.view === "bi");
    if (existing) {
      setActiveTabId(existing.id);
    } else {
      tabCounter.current += 1;
      const tab: SqlTab = {
        id: `tab-bi-${Date.now()}-${tabCounter.current}`,
        title: "Dashboards",
        view: "bi",
        sql: "",
        response: null,
        execError: null,
      };
      updateTabs(connKey, (l) => [...l, tab]);
      setActiveTabId(tab.id);
    }
    // Full-tab view — collapse the side panel like Marketplace/Guides.
    sidebarPanelRef.current?.collapse();
    setSidebarOpen(false);
  }

  async function openBi() {
    openBiTab();
  }

  // Step through SQL history into the current editor.
  function historyNav(dir: "prev" | "next") {
    if (history.length === 0) return;
    const idx =
      dir === "prev"
        ? Math.min((historyIdx < 0 ? -1 : historyIdx) + 1, history.length - 1)
        : Math.max(historyIdx - 1, 0);
    setHistoryIdx(idx);
    const entry = history[idx];
    if (entry) patchTab(activeTab.id, { sql: entry.sql });
  }

  // Commit / rollback the connection's pending work (runs the SQL command).
  async function txn(action: "COMMIT" | "ROLLBACK") {
    if (!connection) return;
    try {
      await ipc.executeSql(connection.profile.id, connection.profile.name, action, maxRows, false);
      loadHistory();
      refreshSqlCatalog();
    } catch {
      /* ignore */
    }
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
          activeView={activeTab.view}
          visualizerCount={visualizerTabs.length}
          onOpenSettings={() => void openSettingsWindow()}
          onSelect={(id) => {
            // Full-tab views take the whole workspace — collapse the side panel
            // so they aren't cramped next to a navigator the user isn't using.
            if (id === "marketplace") {
              sidebarPanelRef.current?.collapse();
              setSidebarOpen(false);
              openMarketplace();
              return;
            }
            if (id === "guides") {
              sidebarPanelRef.current?.collapse();
              setSidebarOpen(false);
              openGuides();
              return;
            }
            if (id === "git" || id === "notebook" || id === "skills") {
              // Full-page tabs (Source Control, Notebook, Skills).
              sidebarPanelRef.current?.collapse();
              setSidebarOpen(false);
              if (id === "git") openGit();
              else if (id === "notebook") openNotebook();
              else openSkills();
              return;
            }
            if (id === "bi") {
              void openBi();
              return;
            }
            if (id === activity && sidebarOpen) {
              sidebarPanelRef.current?.collapse();
              setSidebarOpen(false);
            } else {
              setActivity(id);
              setSidebarOpen(true);
              sidebarPanelRef.current?.expand();
              if (id === "visualizer" && connection) {
                const list = tabsByConn[connection.profile.id] ?? tabsFor(connection.profile.id);
                if (!list.some((t) => t.view === "visualizer")) openVisualizer();
              }
            }
          }}
          onToggleAi={toggleAi}
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
              profiles={profiles}
              local={localStatus}
              activeProfileId={connection?.profile.id ?? null}
              treeKeys={treeKeys}
              onOpenObject={openObject}
              onConnect={openConnect}
              onConnectProfile={(id) => void connectSaved(id)}
              onInstallLocal={() => void ipc.personalLocalBootstrap().catch(() => undefined)}
              onFocusConnection={onFocusConnection}
              onDisconnect={onDisconnect}
              onRefreshConnection={refreshConnection}
              onOpenView={openView}
              onNewVirtualSchema={openVs}
              onUploadDriver={(pid) => {
                const c = connections.find((x) => x.profile.id === pid);
                if (c) setBucketFsFor(c.profile);
              }}
              onContext={(pid, node, x, y) => node.ctx && setCtxMenu({ profileId: pid, node, x, y })}
              onOpenDetails={(pid, node) => node.ctx && openObjectDetails(pid, node.ctx)}
              onOpenFavorite={(fav) => {
                if (["schema", "virtual-schema", "table", "view", "user"].includes(fav.type)) {
                  openObjectDetails(fav.profileId, { type: fav.type, schema: fav.schema, name: fav.name });
                }
              }}
              onOpenMcpConfig={openMcpConfig}
              onCollapse={() => {
                sidebarPanelRef.current?.collapse();
                setSidebarOpen(false);
              }}
              onOpenFile={openFile}
              onFileDeleted={markFileDeleted}
              onOpenData={openData}
              onLoadData={(name, path) => {
                if (connection) setLoadFor({ name, path });
              }}
              filesRefresh={filesRefresh}
              visualizerTabs={visualizerTabs}
              activeTabId={activeTabId}
              onOpenNewVisualizer={newVisualizer}
              onFocusTab={setActiveTabId}
              onCloseTab={closeTab}
            />
          </ResizablePanel>
          <ResizableHandle groupDirection="horizontal" />

          {/* Editor column */}
          <ResizablePanel minSize="360px" className="min-w-0">
            <div className="relative flex h-full min-w-0 flex-col bg-editor">
          <>
          {/* Tab strip */}
          <div data-tour="tabbar" className="flex h-9 shrink-0 items-center border-b border-border bg-titlebar pr-1">
            <div
              className="flex min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onDoubleClick={(e) => {
                // Double-click empty tab-bar space opens a new query (VS Code style).
                if (e.target === e.currentTarget) addTab();
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("text/exa-tab")) e.preventDefault();
              }}
              onDrop={(e) => {
                const dragId = e.dataTransfer.getData("text/exa-tab");
                if (dragId && e.target === e.currentTarget) {
                  e.preventDefault();
                  moveTab(dragId, null);
                }
              }}
              title="Double-click to open a new query"
            >
              {(() => {
                const sorted = [...tabs].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
                const emitted = new Set<string>();
                const els: React.ReactNode[] = [];
                for (const tab of sorted) {
                  const g = tab.groupId ? groups.find((x) => x.id === tab.groupId) : undefined;
                  if (!g) {
                    els.push(renderTabChip(tab));
                    continue;
                  }
                  if (emitted.has(g.id)) continue; // members rendered with the group
                  emitted.add(g.id);
                  const members = sorted.filter((t) => t.groupId === g.id);
                  const hasActive = members.some((m) => m.id === activeTabId);
                  els.push(
                    <div key={g.id} className="flex h-9 shrink-0 items-center border-r border-border">
                      <button
                        onClick={() => toggleGroup(g.id)}
                        onDragOver={(e) => {
                          if (e.dataTransfer.types.includes("text/exa-tab")) e.preventDefault();
                        }}
                        onDrop={(e) => {
                          const dragId = e.dataTransfer.getData("text/exa-tab");
                          if (dragId) {
                            e.preventDefault();
                            e.stopPropagation();
                            addTabToGroup(dragId, g.id);
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          const name = window.prompt("Rename group", g.name);
                          if (name != null && name.trim()) renameGroup(g.id, name.trim());
                        }}
                        title={`${g.collapsed ? "Expand" : "Collapse"} group · right-click to rename`}
                        className={cn(
                          "flex h-9 items-center gap-1.5 px-2.5 text-[12px] font-medium",
                          hasActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Boxes className="h-3.5 w-3.5" />
                        <span className="max-w-[120px] truncate">{g.name}</span>
                        <span className="rounded-full bg-secondary px-1.5 text-[9.5px] text-muted-foreground">{members.length}</span>
                        <ChevronRight className={cn("h-3 w-3 transition-transform", !g.collapsed && "rotate-90")} />
                      </button>
                      {!g.collapsed ? (
                        <div className="flex h-9 items-center rounded-md bg-secondary/25">{members.map((m) => renderTabChip(m, true))}</div>
                      ) : null}
                    </div>,
                  );
                }
                return els;
              })()}
              {/* New-tab button sits directly after the last tab. */}
              <button
                aria-label="New query tab"
                data-agent-id="tabs.new"
                onClick={addTab}
                className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {/* Fixed tab-actions menu, always visible at the right of the strip */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Tab actions"
                  title="Tab actions"
                  className="mr-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={addTab}>
                  <Plus className="h-3.5 w-3.5" /> New query tab
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => togglePin(activeTabId)} disabled={!activeTabId}>
                  <Pin className="h-3.5 w-3.5" /> {tabs.find((t) => t.id === activeTabId)?.pinned ? "Unpin tab" : "Pin tab"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => closeTab(activeTabId)} disabled={!activeTabId}>
                  <X className="h-3.5 w-3.5" /> Close tab
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => closeOtherTabs(activeTabId)} disabled={tabs.length <= 1}>
                  <X className="h-3.5 w-3.5" /> Close other tabs
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={closeAllTabs}
                  disabled={tabs.every((t) => t.pinned)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Close all tabs
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Right (AI) sidebar toggle, pinned to the end of the tab bar */}
            <button
              data-tour="ai-toggle"
              onClick={toggleAi}
              aria-label={aiOpen ? "Hide AI panel" : "Show AI panel"}
              title={aiOpen ? "Hide AI panel" : "Show AI panel"}
              className={cn(
                "mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
                aiOpen ? "text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <PanelRight className="h-4 w-4" />
            </button>
          </div>

          {/* Toolbar — hidden on tabs that carry their own header */}
          {activeTab.view !== "connect" &&
          activeTab.view !== "visualizer" &&
          activeTab.view !== "filePreview" &&
          activeTab.view !== "marketplace" &&
          activeTab.view !== "guides" &&
          activeTab.view !== "bi" &&
          activeTab.view !== "welcome" &&
          activeTab.view !== "mcpConfig" &&
          activeTab.view !== "git" &&
          activeTab.view !== "notebook" &&
          activeTab.view !== "skills" &&
          activeTab.view !== "artifact" &&
          activeTab.view !== "object" ? (
          <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {!isSpecialTab ? (
              <>
                {/* Execute group */}
                <button
                  onClick={() => run("statement")}
                  disabled={running}
                  title="Execute current statement (Ctrl/Cmd+Enter)"
                  className="cta-glow flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-50"
                >
                  {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                  Run
                </button>
                <IconButton label="Execute buffer as a SQL script" onClick={() => run("script")} disabled={running}>
                  <FileCode2 className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton label="Execute complete buffer as one statement" onClick={() => run("buffer")} disabled={running}>
                  <Zap className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton label="Run selection" onClick={() => run("selection")} disabled={running}>
                  <ListChecks className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton label="AI: explain the plan for the selection" onClick={aiExplain} disabled={!connected}>
                  <Sparkles className="h-3.5 w-3.5 text-syntax-function" />
                </IconButton>
                <IconButton label="Open Dashboards" onClick={openBi}>
                  <BarChart3 className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton label="Stop" disabled={!running}>
                  <Square className="h-3.5 w-3.5" />
                </IconButton>

                <div className="mx-1 h-5 w-px shrink-0 bg-border" />

                {/* Transactions */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      title="Transactions"
                      disabled={!connected}
                      className="flex h-7 shrink-0 items-center gap-0.5 rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
                    >
                      <GitCommitHorizontal className="h-3.5 w-3.5" />
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuCheckboxItem
                      checked={autoCommit}
                      onCheckedChange={(v) => setAutoCommit(v === true)}
                    >
                      Auto-commit
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => txn("COMMIT")}>
                      <Check className="h-3.5 w-3.5" /> Commit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => txn("ROLLBACK")}>
                      <RotateCcw className="h-3.5 w-3.5" /> Rollback
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="mx-1 h-5 w-px shrink-0 bg-border" />

                {/* Save + history */}
                <IconButton label="Save to the current file" onClick={saveTab}>
                  <Save className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton label="Save as a new file…" onClick={() => setNamePrompt({ value: activeTab.title.replace(/\.sql$/, "") })}>
                  <SaveAll className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton label="Previous SQL from history" onClick={() => historyNav("prev")} disabled={history.length === 0}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton label="Next SQL from history" onClick={() => historyNav("next")} disabled={history.length === 0}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </IconButton>

                <div className="mx-1 h-5 w-px shrink-0 bg-border" />

                {/* Views */}
                <IconButton label="Merge result sets from the last execution" active={mergeResults} onClick={() => setMergeResults((m) => !m)}>
                  <Combine className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton label="Show the query builder pane" active={queryBuilderOpen} onClick={() => setQueryBuilderOpen((q) => !q)}>
                  <Blocks className="h-3.5 w-3.5" />
                </IconButton>

                {/* Execution settings */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      title="Execution settings"
                      className="flex h-7 shrink-0 items-center gap-0.5 rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-60">
                    <DropdownMenuLabel>SQL processing</DropdownMenuLabel>
                    <DropdownMenuItem disabled>Preprocess Script</DropdownMenuItem>
                    <DropdownMenuItem disabled>Parameterized SQL</DropdownMenuItem>
                    <DropdownMenuCheckboxItem
                      checked={execSettings.stripComments}
                      onCheckedChange={(v) => setExecSettings((s) => ({ ...s, stripComments: v === true }))}
                    >
                      Strip Comments when Executing
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      checked={execSettings.stopOnError}
                      onCheckedChange={(v) => setExecSettings((s) => ({ ...s, stopOnError: v === true }))}
                    >
                      Stop on Error
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={execSettings.stopOnWarning}
                      onCheckedChange={(v) => setExecSettings((s) => ({ ...s, stopOnWarning: v === true }))}
                    >
                      Stop on SQL Warning
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={execSettings.stopOnNoRows}
                      onCheckedChange={(v) => setExecSettings((s) => ({ ...s, stopOnNoRows: v === true }))}
                    >
                      Stop on No Row(s)
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      checked={execSettings.showErrorPos}
                      onCheckedChange={(v) => setExecSettings((s) => ({ ...s, showErrorPos: v === true }))}
                    >
                      Show Error Position Markers
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={execSettings.showErrorStmt}
                      onCheckedChange={(v) => setExecSettings((s) => ({ ...s, showErrorStmt: v === true }))}
                    >
                      Show Error Statement Markers
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="mx-1 h-5 w-px shrink-0 bg-border" />
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
                <div className="flex shrink-0 items-center gap-1.5 pl-1 text-[11px] text-muted-foreground">
                  <span>Max rows</span>
                  <Select value={String(maxRows)} onValueChange={(v) => setMaxRows(Number(v))}>
                    <SelectTrigger className="h-6 w-24 shrink-0 text-xs" size="sm">
                      <SelectValue placeholder="1,000" />
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

          {/* Connect flow, catalog surface, file preview, or SQL editor */}
          {activeTab.view === "connect" ? (
            <div className="min-h-0 flex-1">
              <ConnectView
                drivers={drivers}
                profiles={profiles}
                onSaved={onSaved}
                onConnected={async (p, srv) => {
                  await onConnected(p, srv);
                  await agentClient.grantConnection(p.id).catch(() => undefined);
                }}
              />
            </div>
          ) : activeTab.view === "mcpConfig" ? (
            <div className="min-h-0 flex-1">
              <McpConfigTab presetId={activeTab.mcpPreset ?? "custom"} />
            </div>
          ) : activeTab.view === "filePreview" ? (
            <div className="min-h-0 flex-1">
              <FilePreviewPanel
                name={activeTab.title}
                path={activeTab.filePath ?? ""}
                onEdit={async () => {
                  const p = activeTab.filePath;
                  if (!p) return;
                  try {
                    const text = await ipc.fsReadText(p);
                    openFile(activeTab.title, text, p);
                  } catch {
                    /* unreadable as text */
                  }
                }}
                onDelete={async () => {
                  const p = activeTab.filePath;
                  if (!p) return;
                  try {
                    await ipc.fsDelete(p);
                    markFileDeleted(p);
                    setFilesRefresh((n) => n + 1);
                    closeTab(activeTab.id);
                  } catch {
                    /* delete failed */
                  }
                }}
              />
            </div>
          ) : activeTab.view === "welcome" ? (
            <div className="min-h-0 flex-1">
              <WelcomeScreen
                connected={!!connection}
                recents={(() => {
                  // Hide the internal AI read-only identity, and collapse
                  // profiles that point at the same database (host/port/user)
                  // to a single entry so one DB shows once.
                  const norm = (h: string) => (h === "localhost" ? "127.0.0.1" : h);
                  const seen = new Set<string>();
                  return profiles
                    .filter((p) => !p.username.startsWith("STUDIO_MCP_"))
                    .filter((p) => {
                      const key = `${norm(p.host)}:${p.port}:${p.username.toUpperCase()}`;
                      if (seen.has(key)) return false;
                      seen.add(key);
                      return true;
                    })
                    .map((p) => ({ id: p.id, label: p.name, sub: `${p.host}:${p.port}` }));
                })()}
                onNewQuery={addTab}
                onOpenFile={() => void openSqlFile()}
                onConnect={openConnect}
                onMarketplace={openMarketplace}
                onGuides={openGuides}
                onOpenRecent={(id) => void connectSaved(id)}
              />
            </div>
          ) : activeTab.view === "marketplace" ? (
            <div className="min-h-0 flex-1">
              <Marketplace />
            </div>
          ) : activeTab.view === "guides" ? (
            <div className="min-h-0 flex-1">
              <Docs />
            </div>
          ) : activeTab.view === "git" ? (
            <div className="flex min-h-0 flex-1 flex-col bg-editor">
              <GitPanel full />
            </div>
          ) : activeTab.view === "notebook" ? (
            <div className="min-h-0 flex-1">
              <NotebookTab
                profileId={connection?.profile.id ?? null}
                connectionName={connection?.profile.name ?? ""}
                connections={connections.map((c) => ({ id: c.profile.id, name: c.profile.name, host: `${c.profile.host}:${c.profile.port}` }))}
                editorTheme={editorTheme}
                beforeMount={(m) => {
                  defineMonacoThemes(m);
                  // Register Exasol autocompletion on the shared monaco (guarded
                  // internally) so notebook SQL cells get completions too.
                  registerExasolCompletion(m, () => sqlCatalogRef.current);
                }}
                onConnectDb={openConnect}
                onAddVirtualSchema={() => (connection ? openVs(connection.profile.id) : openConnect())}
                onAsk={(text) => {
                  setAiOpen(true);
                  aiPanelRef.current?.expand();
                  setAiPrompt({
                    text: `About this SQL — explain it, spot issues, and suggest an improvement:\n\n\`\`\`sql\n${text || "(empty)"}\n\`\`\``,
                    nonce: Date.now(),
                    send: false,
                  });
                }}
              />
            </div>
          ) : activeTab.view === "skills" ? (
            <div className="min-h-0 flex-1">
              <SkillsTab />
            </div>
          ) : activeTab.view === "artifact" ? (
            <div className="min-h-0 flex-1">
              <ArtifactTab title={activeTab.title} html={activeTab.artifactHtml ?? ""} onOpen={openArtifact} />
            </div>
          ) : activeTab.view === "bi" ? (
            <div className="min-h-0 flex-1">
              <DashboardsTab
                profileId={connection?.profile.id ?? null}
                connectionName={connection?.profile.name ?? ""}
              />
            </div>
          ) : activeTab.view === "object" && activeTab.objectRef && activeTab.objectProfileId ? (
            <div className="min-h-0 flex-1">
              <ObjectDetailPanel
                profileId={activeTab.objectProfileId}
                connectionName={connections.find((c) => c.profile.id === activeTab.objectProfileId)?.profile.name ?? ""}
                object={activeTab.objectRef}
                onOpenData={(sql) => void openBuiltSql(sql, true)}
              />
            </div>
          ) : isSpecialTab && connection ? (
            <div className="min-h-0 flex-1">
              {activeTab.view === "connInfo" ? (
                <ConnectionInfoPanel connection={connection} />
              ) : activeTab.view === "dbInfo" ? (
                <DatabaseInfoPanel
                  profileId={connection.profile.id}
                  connectionName={connection.profile.name}
                />
              ) : activeTab.view === "dataTypes" ? (
                <DataTypesPanel
                  profileId={connection.profile.id}
                  connectionName={connection.profile.name}
                />
              ) : activeTab.view === "dba" ? (
                <DbaDashboard profileId={connection.profile.id} connectionName={connection.profile.name} />
              ) : (
                // Key by tab id so every Visualizer tab is its OWN independent
                // instance — a new tab starts fresh and never inherits the
                // previous tab's schema, selection, or query-builder state.
                <Visualizer
                  key={activeTab.id}
                  instanceId={activeTab.id}
                  profileId={connection.profile.id}
                  connectionName={connection.profile.name}
                  onOpenSql={openBuiltSql}
                  onNewVs={() => openVs(connection.profile.id)}
                />
              )}
            </div>
          ) : (
            <ResizablePanelGroup direction="vertical" className="min-h-0 flex-1">
              <ResizablePanel defaultSize="55%" minSize="120px" className="relative min-h-0">
                {inlineDiff ? (
                  <InlineSqlDiff
                    state={inlineDiff}
                    onAccept={(next) => {
                      applyInlineEdit(next);
                      setInlineDiff(null);
                    }}
                    onDecline={() => setInlineDiff(null)}
                  />
                ) : null}
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
                    registerExasolCompletion(monaco, () => sqlCatalogRef.current);
                    // Lightbulb AI actions on the current line/selection.
                    if (!(window as unknown as Record<string, unknown>).__exaSqlAiActions) {
                      (window as unknown as Record<string, unknown>).__exaSqlAiActions = true;
                      const acts = [
                        { id: "exasol.ai.explainPlan", title: "AI: Explain the plan", kind: "explain-plan" },
                        { id: "exasol.ai.explain", title: "AI: Explain what this does", kind: "explain" },
                        { id: "exasol.ai.optimize", title: "AI: Optimize (review diff)", kind: "optimize" },
                        { id: "exasol.ai.fix", title: "AI: Fix errors (review diff)", kind: "fix" },
                        { id: "exasol.ai.edit", title: "AI: Edit with instruction… (review diff)", kind: "edit" },
                      ] as const;
                      for (const a of acts) {
                        monaco.editor.registerCommand(a.id, () => aiAskSqlRef.current(a.kind));
                      }
                      monaco.languages.registerCodeActionProvider("sql", {
                        provideCodeActions: () => ({
                          actions: acts.map((a) => ({
                            title: a.title,
                            kind: "quickfix",
                            command: { id: a.id, title: a.title },
                          })),
                          dispose: () => undefined,
                        }),
                      });
                    }
                    // Right-click context menu (reliable everywhere, unlike the
                    // lightbulb's display heuristics) + keybinding for the most
                    // used one.
                    const menuActs = [
                      { id: "exa.ctx.explainPlan", label: "AI: Explain the plan", kind: "explain-plan" as const, order: 1.1, keys: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyE] },
                      { id: "exa.ctx.explain", label: "AI: Explain what this does", kind: "explain" as const, order: 1.2 },
                      { id: "exa.ctx.optimize", label: "AI: Optimize (review diff)", kind: "optimize" as const, order: 1.3 },
                      { id: "exa.ctx.fix", label: "AI: Fix errors (review diff)", kind: "fix" as const, order: 1.4 },
                      { id: "exa.ctx.edit", label: "AI: Edit with instruction… (review diff)", kind: "edit" as const, order: 1.5 },
                    ];
                    for (const a of menuActs) {
                      editor.addAction({
                        id: a.id,
                        label: a.label,
                        contextMenuGroupId: "0_exa_ai",
                        contextMenuOrder: a.order,
                        keybindings: a.keys,
                        run: () => aiAskSqlRef.current(a.kind),
                      });
                    }
                    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => void run("statement"));
                    editor.addCommand(
                      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
                      () => void run("script"),
                    );
                  }}
                  options={{
                    automaticLayout: true,
                    lightbulb: { enabled: "on" as never },
                    fontFamily: "JetBrains Mono",
                    fontSize: editorFontSize,
                    wordWrap: editorWordWrap ? "on" : "off",
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
                  <RunStatusStrip meta={activeTab.runMeta} response={activeTab.response} />
                  <div className="min-h-0 flex-1 overflow-auto">
                    {resultTab === "messages" ? (
                      <ResultsGrid result={null} error={activeTab.execError} />
                    ) : mergeResults && (activeTab.response?.results.length ?? 0) > 1 ? (
                      // Merged view — every result set from the last execution.
                      <div className="flex flex-col">
                        {activeTab.response!.results.map((r, i) => (
                          <div key={i} className="border-b border-border">
                            <div className="bg-secondary/50 px-3 py-1 font-mono text-[10px] text-muted-foreground">
                              #{i + 1} · {r.rowCount} rows{r.truncated ? " (truncated)" : ""} · {r.elapsedMs} ms
                            </div>
                            <div className="h-[280px]">
                              <ResultsGrid result={r} error={r.error} onChart={() => void openBi()} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <ResultsGrid
                        result={lastResult}
                        error={lastResult?.error ?? null}
                        onChart={() => void openBi()}
                        editable={editTable}
                        onCommitEdits={(stmts) => void commitEdits(stmts)}
                        editBusy={running}
                        fontSize={gridFontSize}
                        zebra={gridZebra}
                      />
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
              pendingPrompt={aiPrompt}
              connectionId={connection?.profile.id ?? null}
              connections={connections.map((c) => ({ id: c.profile.id, name: c.profile.name }))}
              onClose={toggleAi}
              onUiAction={handleUiAction}
              onOpenAttachment={openChatAttachment}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <AgentCursor ref={cursorRef} />
      <FloatingPet
        connectionId={connection?.profile.id ?? null}
        onUiAction={handleUiAction}
        onDashboardSaved={openSavedDashboard}
        onArtifact={openArtifact}
        onSpawn={() => setExtraPets((p) => [...p, { id: `${Date.now()}`, name: `task ${p.length + 1}` }])}
        tag={extraPets.length ? "main" : undefined}
      />
      {extraPets.map((p, i) => (
        <FloatingPet
          key={p.id}
          standalone
          offset={i + 1}
          connectionId={connection?.profile.id ?? null}
          onUiAction={handleUiAction}
          onDashboardSaved={openSavedDashboard}
          onArtifact={openArtifact}
          onClose={() => setExtraPets((list) => list.filter((x) => x.id !== p.id))}
          tag={p.name}
          onRename={(name) => setExtraPets((list) => list.map((x) => (x.id === p.id ? { ...x, name } : x)))}
        />
      ))}
      <div className="shrink-0">
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

      {namePrompt ? (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setNamePrompt(null)}
        >
          <div
            className="w-[360px] rounded-xl border border-border bg-popover p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 text-[13px] font-semibold text-foreground">Save as</p>
            <div className="flex items-center gap-1.5">
              <Input
                autoFocus
                value={namePrompt.value}
                onChange={(e) => setNamePrompt({ value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitSaveAs();
                  else if (e.key === "Escape") setNamePrompt(null);
                }}
                placeholder="file name"
                className="h-8 text-sm"
              />
              <span className="font-mono text-xs text-muted-foreground">.sql</span>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">Saved into My&nbsp;Workspace.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setNamePrompt(null)}
                className="h-8 rounded-md border border-border px-3 text-[13px] text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => void commitSaveAs()}
                className="cta-glow h-8 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary/85"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {vsFor ? (
        <NewVirtualSchema
          profileId={vsFor}
          connectionName={connections.find((c) => c.profile.id === vsFor)?.profile.name ?? "Exasol"}
          onClose={() => setVsFor(null)}
          onCreated={() => refreshConnection(vsFor)}
        />
      ) : null}

      {bucketFsFor ? <BucketFsPanel profile={bucketFsFor} onClose={() => setBucketFsFor(null)} /> : null}

      {ctxMenu && ctxMenu.node.ctx ? (
        <ObjectContextMenu
          ctx={ctxMenu.node.ctx}
          x={ctxMenu.x}
          y={ctxMenu.y}
          defaultSchema={connections.find((c) => c.profile.id === ctxMenu.profileId)?.profile.schema ?? undefined}
          onClose={() => setCtxMenu(null)}
          onEditorSql={(sql, runNow) => void openBuiltSql(sql, runNow)}
          onAction={(action) => setObjAction({ profileId: ctxMenu.profileId, action })}
          onDetails={() => ctxMenu.node.ctx && openObjectDetails(ctxMenu.profileId, ctxMenu.node.ctx)}
          onFavorite={
            ctxMenu.node.ctx && !ctxMenu.node.ctx.type.startsWith("new-")
              ? () =>
                  ctxMenu.node.ctx &&
                  addFavorite({
                    profileId: ctxMenu.profileId,
                    type: ctxMenu.node.ctx.type,
                    schema: ctxMenu.node.ctx.schema,
                    name: ctxMenu.node.ctx.name,
                  })
              : undefined
          }
        />
      ) : null}

      {objAction ? (
        <ObjectActionDialog
          action={objAction.action}
          busy={running}
          onSubmit={(sql) => void runDdl(objAction.profileId, sql)}
          onClose={() => setObjAction(null)}
        />
      ) : null}

      {tabMenu ? (
        (() => {
          const menuTab = tabs.find((t) => t.id === tabMenu.tabId);
          if (!menuTab) return null;
          const close = () => setTabMenu(null);
          const otherGroups = groups.filter((g) => g.id !== menuTab.groupId);
          return (
            <>
              <div className="fixed inset-0 z-[60]" onClick={close} onContextMenu={(e) => { e.preventDefault(); close(); }} />
              <div
                style={{ left: Math.min(tabMenu.x, window.innerWidth - 230), top: Math.min(tabMenu.y, window.innerHeight - 200) }}
                className="fixed z-[61] min-w-[210px] rounded-lg border border-border bg-popover py-1 shadow-2xl"
              >
                <div className="truncate px-3 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{menuTab.title}</div>
                {menuTab.groupId ? (
                  <button
                    onClick={() => { removeTabFromGroup(menuTab.id); close(); }}
                    className="flex w-full items-center px-3 py-1.5 text-left text-[12.5px] text-foreground hover:bg-secondary"
                  >
                    Remove from group
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => { createGroupFromTab(menuTab.id); close(); }}
                      className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[12.5px] text-foreground hover:bg-secondary"
                    >
                      <Boxes className="h-3.5 w-3.5" /> New group from tab
                    </button>
                    {otherGroups.length ? (
                      <>
                        <div className="my-1 h-px bg-border" />
                        <div className="px-3 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Add to group</div>
                        {otherGroups.map((g) => (
                          <button
                            key={g.id}
                            onClick={() => { addTabToGroup(menuTab.id, g.id); close(); }}
                            className="flex w-full items-center px-3 py-1.5 text-left text-[12.5px] text-foreground hover:bg-secondary"
                          >
                            {g.name}
                          </button>
                        ))}
                      </>
                    ) : null}
                  </>
                )}
                {tabs.length > 1 ? (
                  <>
                    <div className="my-1 h-px bg-border" />
                    <button
                      onClick={() => { closeTab(menuTab.id); close(); }}
                      className="flex w-full items-center px-3 py-1.5 text-left text-[12.5px] text-destructive hover:bg-destructive/10"
                    >
                      Close tab
                    </button>
                  </>
                ) : null}
              </div>
            </>
          );
        })()
      ) : null}

      {loadFor && connection ? (
        <LoadDataDialog
          profile={connection.profile}
          filePath={loadFor.path}
          fileName={loadFor.name}
          onClose={() => setLoadFor(null)}
        />
      ) : null}

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
      <SelectTrigger className="h-6 min-w-[120px] shrink-0 gap-1.5 text-xs" size="sm" aria-label={label}>
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
      <SelectTrigger className="h-6 min-w-[140px] shrink-0 gap-1.5 text-xs" size="sm" aria-label="Connection">
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
