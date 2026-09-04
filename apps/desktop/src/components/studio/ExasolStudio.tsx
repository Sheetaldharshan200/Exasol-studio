import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { registerExasolCompletion, buildCatalog, emptyCatalog, setSharedCatalog, type SqlCatalog } from "@/lib/sql-completion";
import { InlineSqlDiff, type InlineDiffState } from "@/features/workbench/InlineSqlDiff";
import { Activity, BarChart3, Blocks, Check, ChevronDown, ChevronLeft, Boxes, ChevronRight, Combine, Database, GitCommitHorizontal, Info, MoreHorizontal, Loader2, PanelRight, Pin, Plus, RotateCcw, Save, SaveAll, Search, Settings2, Sparkles, Square, Trash2, X } from "lucide-react";
import { RunScriptIcon, RunCurrentIcon, RunExplainIcon, RunBufferIcon } from "./run-icons";
import { useTheme } from "@/components/theme/theme-provider";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup, type PanelImperativeHandle } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { ConnectionPropertiesTab } from "@/features/connection/ConnectionPropertiesTab";
import { WelcomeScreen } from "@/features/workbench/WelcomeScreen";
import { DbaDashboard } from "@/features/workbench/DbaDashboard";
import { FilePreviewPanel } from "@/features/workbench/FilePreviewPanel";
import { Visualizer } from "@/features/workbench/Visualizer";
import { Marketplace } from "@/features/marketplace/Marketplace";
import { readMetaSnapshot, resolveCatalog } from "@/features/marketplace/catalog-data";
import { Docs } from "@/features/marketplace/Docs";
import { ArtifactTab } from "@/features/artifact/ArtifactTab";
import { artifacts as artifactClient } from "@/lib/agent-client";
import { dashboards as dashClient, type Dashboard as DashDoc, type DashPanel as DashPanelDoc } from "@/lib/agent-client";
import { AgentCursor, type AgentCursorHandle, type CursorMode } from "@/components/studio/AgentCursor";
import { UiGraph } from "@/lib/ui-graph";
import { addLearnedEdges, initTraceRecorder, recordTransition } from "@/lib/ui-trace";
import { agent as agentClient } from "@/lib/agent-client";
import { ActivityRail, type ActivityId } from "@/features/workbench/ActivityRail";
import { ExaEnginePanel } from "@/features/assistant/ExaEnginePanel";
import { AgentMark } from "@/components/studio/AgentMark";
import { McpConfigTab } from "@/features/marketplace/McpConfigTab";
import { NewVirtualSchema } from "@/features/connection/NewVirtualSchema";
import { BucketFsPanel } from "@/features/connection/BucketFsPanel";
import { LogsPanel } from "@/features/connection/LogsPanel";
import { BackupsPanel } from "@/features/connection/BackupsPanel";
import { startBackupScheduler } from "@/features/connection/backup-scheduler";
import { HealthPanel } from "@/features/connection/HealthPanel";
import { LoadDataDialog } from "@/features/workbench/LoadDataDialog";
import { ObjectContextMenu, ObjectActionDialog, type ObjectAction } from "@/features/workbench/ObjectContextMenu";
import { ObjectDetailPanel, type ObjectRef } from "@/features/workbench/ObjectDetailPanel";
import { GitPanel } from "@/features/workbench/GitPanel";
import { NotebookTab } from "@/features/workbench/NotebookTab";
import { DashboardTab } from "@/features/dashboard/DashboardTab";
import { Icon } from "@/components/ui/icon";
import { SkillsTab } from "@/features/workbench/SkillsTab";
import { addFavorite } from "@/lib/favorites";
import type { TreeNode } from "@/features/workbench/tree-model";
import { openSettingsWindow } from "@/lib/settings-window";
import { askExa } from "@/features/assistant/exa/ask-exa";
import { pinnedPrompt } from "@/features/assistant/exa/context";
import { DocsTab } from "@/features/workbench/DocsTab";
import { DesktopOnly } from "@/features/workbench/DesktopOnly";
import { GlobalSearch, type SearchItem } from "@/components/studio/GlobalSearch";

import { findScriptBlocks, parseSingleTable, pickRunSql, splitStatements, stripSqlComments, tabTitleFromSql } from "@/lib/sql-text";
import { buildPlanBlock, heaviestStatement } from "@/lib/plan-block";
import { IconButton } from "./IconButton";
import { describeTabForContext, readActiveNotebook } from "./tab-context";
import { UdfBuilder } from "@/features/workbench/UdfBuilder";
import { DEFAULT_UDF_LANGS, parseScriptLanguages, type UdfLangOption } from "@/features/workbench/udf-builder";
import { TitleBar } from "./TitleBar";
import { Sidebar } from "./Sidebar";
import { ConnectionSwitcher, Selector } from "./ConnectionSwitcher";
import { defineMonacoThemes, syntaxOverridesFromSettings, type SyntaxOverrides } from "./monaco-theme";
import { EditorStatusBar } from "./EditorStatusBar";
import { installStatementBadges } from "./statement-badges";
import { QueryPlanView } from "./QueryPlanView";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { IQuickInputService } from "monaco-editor/esm/vs/platform/quickinput/common/quickInput";
import { HistoryDock } from "./HistoryDock";
import { ResultsPanel } from "./ResultsPanel";
import { MAX_ROWS_OPTIONS, NO_CONNECTION, TAB_ICON, WELCOME_TAB, newTab, type SqlTab, type TabGroup } from "./tabs";
import { loadWorkspace, saveWorkspace } from "@/lib/workspace-persist";
import { openVsWindow, VS_DONE } from "@/lib/vs-window";
import { normalizeProfileRows, type Plan, type ProfileSource } from "@/lib/plan-model";
import { errorMessage, ipc, isTauri, type ConnectionProfile, type PersonalLocalStatus, type DriverInfo, type ExecuteResponse, type HistoryEntry, type ServerInfo } from "@/lib/ipc";
import type { ActiveConnection } from "@/state/useConnections";

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
    void ipc.personalLocalStatus().then(setLocalStatus).catch(() => undefined);
    if (!isTauri()) {
      // No Tauri events in the browser — poll so a CLI install/start of the
      // shared Personal deployment shows up without a reload.
      const timer = setInterval(() => {
        void ipc.personalLocalStatus().then(setLocalStatus).catch(() => undefined);
      }, 20_000);
      return () => clearInterval(timer);
    }
    let un: (() => void) | undefined;
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      un = await listen<PersonalLocalStatus>("personal-local:status", (e) => setLocalStatus(e.payload));
    });
    return () => un?.();
  }, []);

  // After any schema-changing statement, the backend revalidates every
  // semantic model on that connection and reports here. Silence would leave
  // "the model broke because of this morning's ALTER" to be discovered later,
  // inside someone else's query, as a compiler error with no cause attached.
  useEffect(() => {
    if (!isTauri()) return;
    let un: (() => void) | undefined;
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      un = await listen<{ profileId: string; issueCount: number; issues: string[] }>(
        "semantic:validation",
        (e) => {
          const { issueCount, issues } = e.payload;
          window.dispatchEvent(
            new CustomEvent("studio:notice", {
              detail:
                issueCount > 0
                  ? {
                      kind: "warning",
                      title: `Semantic Views: ${issueCount} issue${issueCount === 1 ? "" : "s"} after schema change`,
                      body: issues.slice(0, 3).join("\n"),
                    }
                  : {
                      kind: "success",
                      title: "Semantic Views revalidated",
                      body: "All models are still consistent with the schema.",
                    },
            }),
          );
        },
      );
    });
    return () => un?.();
  }, []);

  // Query state — tabs and the active tab are kept per connection, so each
  // database keeps its own workspace. A "__none__" bucket covers the
  // not-connected state so there is always a valid active tab.
  const connKey = connection?.profile.id ?? NO_CONNECTION;
  // Hydrate the open workspace from the last session (survives the update
  // relaunch). loadWorkspace() reads once; each map falls back to empty.
  const restoredWorkspace = useRef(loadWorkspace()).current;
  const [tabsByConn, setTabsByConn] = useState<Record<string, SqlTab[]>>(() => restoredWorkspace?.tabsByConn ?? {});
  const [activeIdByConn, setActiveIdByConn] = useState<Record<string, string>>(() => restoredWorkspace?.activeIdByConn ?? {});
  const [groupsByConn, setGroupsByConn] = useState<Record<string, TabGroup[]>>(() => restoredWorkspace?.groupsByConn ?? {});
  // Persist the workspace (debounced) so a restart — especially the update
  // relaunch — reopens the same tabs. Only identity/SQL is stored, not results.
  useEffect(() => {
    const t = window.setTimeout(() => saveWorkspace({ tabsByConn, groupsByConn, activeIdByConn }), 400);
    return () => window.clearTimeout(t);
  }, [tabsByConn, groupsByConn, activeIdByConn]);
  // A `ref` always holding the latest workspace, flushed synchronously when the
  // window is torn down (the update relaunch, or a quit) — so a change made
  // inside the debounce window above is never lost on the way out.
  const workspaceRef = useRef({ tabsByConn, groupsByConn, activeIdByConn });
  workspaceRef.current = { tabsByConn, groupsByConn, activeIdByConn };
  useEffect(() => {
    const flush = () => saveWorkspace(workspaceRef.current);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);
  // Right-click menu on a tab (group operations).
  const [tabMenu, setTabMenu] = useState<{ tabId: string; x: number; y: number } | null>(null);
  const [running, setRunning] = useState(false);
  // Inline tab rename (double-click a tab title).
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
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
  // The visual UDF builder block (opens above the editor).
  const [udfBuilderOpen, setUdfBuilderOpen] = useState(false);
  // Languages the connected DB actually offers for UDFs — read live from its
  // SCRIPT_LANGUAGES parameter so a newly-installed SLC shows up with no code
  // change (Lua is always included by the parser).
  const [udfLangs, setUdfLangs] = useState<UdfLangOption[]>(DEFAULT_UDF_LANGS);
  useEffect(() => {
    const conn = connectionRef.current;
    if (!conn) { setUdfLangs(DEFAULT_UDF_LANGS); return; }
    let alive = true;
    ipc
      .executeSql(conn.profile.id, conn.profile.name, "SELECT SYSTEM_VALUE FROM SYS.EXA_PARAMETERS WHERE PARAMETER_NAME = 'SCRIPT_LANGUAGES'", 1, false, false)
      .then((res) => {
        if (!alive) return;
        const row = res.results.find((r) => r.kind === "resultSet")?.rows?.[0];
        setUdfLangs(parseScriptLanguages(row ? String(row[0] ?? "") : null));
      })
      .catch(() => alive && setUdfLangs(DEFAULT_UDF_LANGS));
    return () => { alive = false; };
  }, [connection]);
  const insertIntoEditor = (text: string) => {
    const editor = editorRef.current;
    if (editor) {
      const sel = editor.getSelection();
      editor.executeEdits("udf-insert", [{ range: sel ?? editor.getModel()!.getFullModelRange(), text: `${text}\n`, forceMoveMarkers: true }]);
      editor.focus();
    } else {
      patchTab(activeTab.id, { sql: activeTab.sql ? `${activeTab.sql.trimEnd()}\n\n${text}\n` : `${text}\n` });
    }
  };
  const [historyIdx, setHistoryIdx] = useState(-1);
  // The editor text the user had typed before stepping into SQL history, so
  // "next" past the newest entry restores it instead of losing it.
  const historyDraft = useRef<string | null>(null);
  const [namePrompt, setNamePrompt] = useState<{ value: string } | null>(null);
  const [vsFor, setVsFor] = useState<string | null>(null);
  const [bucketFsFor, setBucketFsFor] = useState<ConnectionProfile | null>(null);
  const [loadFor, setLoadFor] = useState<{ name: string; path: string } | null>(null);
  const [editTable, setEditTable] = useState<{ schema?: string; table: string; pk: string[]; columns: string[] } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ profileId: string; node: TreeNode; x: number; y: number } | null>(null);
  const [objAction, setObjAction] = useState<{ profileId: string; action: ObjectAction } | null>(null);

  const editorRef = useRef<import("monaco-editor").editor.IStandaloneCodeEditor | null>(null);
  // Mirrors editorRef as state so the status bar re-renders when the editor
  // mounts (a ref assignment alone wouldn't).
  const [statusEditor, setStatusEditor] = useState<import("monaco-editor").editor.IStandaloneCodeEditor | null>(null);
  // The shared monaco instance + the user's per-token syntax colors, so a
  // Settings change can re-define the editor themes live.
  const monacoRef = useRef<import("@monaco-editor/react").Monaco | null>(null);
  const syntaxOverridesRef = useRef<SyntaxOverrides>({});
  const applyMonacoThemes = useCallback((m: import("@monaco-editor/react").Monaco) => {
    monacoRef.current = m;
    defineMonacoThemes(m, syntaxOverridesRef.current);
  }, []);
  // Statement-number badges in the editor margin — Settings toggle, on by default.
  const stmtBadgesRef = useRef<{ setEnabled: (on: boolean) => void } | null>(null);
  const stmtNumbersRef = useRef(true);
  // progressId of the query currently executing (for the Stop button to cancel).
  const runningProgressId = useRef<string | null>(null);
  // Live schema catalog feeding the editor's autocompletion (per connection).
  const sqlCatalogRef = useRef<SqlCatalog>(emptyCatalog());
  // Monotonic token so a slow refresh can never overwrite a newer one, and the
  // two queries build ONE atomic snapshot (the old code let the columns query
  // clobber freshly-set scripts, or vice-versa). A full rebuild each time means
  // a DROPed schema simply isn't in the new snapshot — it disappears at once.
  const catalogReq = useRef(0);
  const refreshSqlCatalog = useCallback(async () => {
    const conn = connectionRef.current;
    if (!conn) return;
    const token = ++catalogReq.current;
    const rowsOf = async (sql: string, cap: number): Promise<unknown[][]> => {
      const res = await ipc.executeSql(conn.profile.id, conn.profile.name, sql, cap, false, false).catch(() => null);
      const t = res?.results.find((r) => r.kind === "resultSet");
      return (t?.rows as unknown[][]) ?? [];
    };
    const [cols, scriptRows] = await Promise.all([
      rowsOf(
        "SELECT COLUMN_SCHEMA, COLUMN_TABLE, COLUMN_NAME, COLUMN_TYPE FROM SYS.EXA_ALL_COLUMNS WHERE COLUMN_SCHEMA NOT IN ('SYS','EXA_STATISTICS') ORDER BY 1, 2 LIMIT 20000",
        20000,
      ),
      rowsOf("SELECT SCRIPT_SCHEMA, SCRIPT_NAME, SCRIPT_LANGUAGE FROM SYS.EXA_ALL_SCRIPTS LIMIT 2000", 2000),
    ]);
    // A newer refresh already started (or won) — drop this stale result.
    if (token !== catalogReq.current || conn.profile.id !== connectionRef.current?.profile.id) return;
    const next = buildCatalog(cols);
    next.scripts = scriptRows.map((r) => ({ schema: String(r[0] ?? ""), name: String(r[1] ?? ""), type: String(r[2] ?? "SCRIPT") }));
    sqlCatalogRef.current = next;
    setSharedCatalog(next); // expose to the dashboard widget query editor
  }, []);
  const connectionRef = useRef(connection);
  connectionRef.current = connection;
  // Fresh on connect, after every statement run, and on a slow freshness tick
  // (catches agent-driven DDL/imports) — so new schemas/tables complete
  // immediately instead of only after reconnecting.
  useEffect(() => {
    sqlCatalogRef.current = emptyCatalog();
    setSharedCatalog(emptyCatalog());
    if (!connection) return;
    void refreshSqlCatalog();
    const onChanged = () => void refreshSqlCatalog();
    window.addEventListener("studio:catalog-changed", onChanged);
    window.addEventListener("studio:git-changed", onChanged); // agent commits often follow DDL
    const timer = window.setInterval(refreshSqlCatalog, 45_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("studio:catalog-changed", onChanged);
      window.removeEventListener("studio:git-changed", onChanged);
    };
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
  // Connection accent (Properties → Color and Border → SQL tabs): tints the
  // top edge of this connection's tab chips — the prod-vs-dev guard.
  const [connAccent, setConnAccent] = useState<string | null>(null);
  useEffect(() => {
    let dead = false;
    if (!connKey || connKey === "none") {
      setConnAccent(null);
      return;
    }
    void ipc
      .connectionSettingsGet(connKey)
      .then((raw) => {
        const c = (raw as { color?: { accent?: string | null; sqlTabs?: boolean } } | null)?.color;
        if (!dead) setConnAccent(c?.accent && c.sqlTabs !== false ? c.accent : null);
      })
      .catch(() => {
        if (!dead) setConnAccent(null);
      });
    const bump = () => {
      void ipc.connectionSettingsGet(connKey).then((raw) => {
        const c = (raw as { color?: { accent?: string | null; sqlTabs?: boolean } } | null)?.color;
        if (!dead) setConnAccent(c?.accent && c.sqlTabs !== false ? c.accent : null);
      }).catch(() => undefined);
    };
    window.addEventListener("studio:conn-settings-changed", bump);
    return () => {
      dead = true;
      window.removeEventListener("studio:conn-settings-changed", bump);
    };
  }, [connKey]);
  const activeTab =
    tabs.find((t) => t.id === activeIdByConn[connKey]) ?? tabs[tabs.length - 1] ?? WELCOME_TAB;

  // Backup schedules tick every minute while Studio runs; the getter reads a
  // ref so the interval survives connection-list changes. Missed occurrences
  // (computer off/asleep) are caught up on launch with a notification.
  const schedulerConnsRef = useRef(connections);
  schedulerConnsRef.current = connections;
  useEffect(
    () => startBackupScheduler(() => schedulerConnsRef.current.map((c) => ({ id: c.profile.id, name: c.profile.name }))),
    [],
  );

  // Focus the editor whenever the ACTIVE TAB becomes a SQL tab (new tab, tab
  // switch), so a fresh query tab is immediately typeable — the caret blinks
  // at line 1 instead of waiting for a click. Double rAF: the model swap for
  // the new tab lands after the render commit.
  const lastFocusedTabId = useRef<string | null>(null);
  useEffect(() => {
    if (activeTab.view !== "sql" || lastFocusedTabId.current === activeTab.id) return;
    lastFocusedTabId.current = activeTab.id;
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const ed = editorRef.current;
        if (!ed) return;
        ed.focus();
        if ((activeTab.sql ?? "").trim() === "") ed.setPosition({ lineNumber: 1, column: 1 });
      }),
    );
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab.id, activeTab.view]);
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

  // One Exa surface at a time: opening the dock closes an active Exa tab
  // (via this ref, current each render), and activating the Exa tab closes
  // the dock (effect below) — the two must never show together.
  const closeActiveExaTabRef = useRef<() => void>(() => {});
  const toggleAi = useCallback(() => {
    setAiOpen((o) => {
      const next = !o;
      if (next) {
        closeActiveExaTabRef.current();
        aiPanelRef.current?.expand();
      } else aiPanelRef.current?.collapse();
      return next;
    });
  }, []);

  closeActiveExaTabRef.current = () => {
    if (activeTab.view === "exaEngine") closeTab(activeTab.id);
  };
  // askExa() (notebook cells, editor AI actions) needs the assistant visible —
  // the full Exa tab counts; otherwise expand the side dock.
  useEffect(() => {
    const onOpen = () => {
      if (activeTab.view === "exaEngine") return;
      setAiOpen(true);
      aiPanelRef.current?.expand();
    };
    window.addEventListener("studio:assistant-open", onOpen);
    return () => window.removeEventListener("studio:assistant-open", onOpen);
  }, [activeTab.view]);
  // Wheel policy, app-wide: VERTICAL always wins while any enclosing vertical
  // scroller still has room in the wheel's direction; only when vertical is
  // exhausted (or absent) does the nearest horizontal scroller take the wheel.
  // Two passes on purpose — a horizontal-only element nested INSIDE a vertical
  // scroller (a wide row in the tables tree) must never steal the wheel from it.
  useEffect(() => {
    const scrollable = (style: string) => /(auto|scroll)/.test(style);
    const onWheel = (e: WheelEvent) => {
      if (e.deltaX !== 0 || e.deltaY === 0 || e.shiftKey) return;
      // Pass 1: any vertical scroller with room left? Native scroll handles it.
      for (let el = e.target as HTMLElement | null; el && el !== document.body; el = el.parentElement) {
        if (el.scrollHeight <= el.clientHeight + 1) continue;
        if (!scrollable(getComputedStyle(el).overflowY)) continue;
        const room = e.deltaY > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0;
        if (room) return;
      }
      // Pass 2: vertical is done — hand the wheel to the nearest horizontal scroller.
      for (let el = e.target as HTMLElement | null; el && el !== document.body; el = el.parentElement) {
        if (el.scrollWidth <= el.clientWidth + 1) continue;
        if (!scrollable(getComputedStyle(el).overflowX)) continue;
        const room = e.deltaY > 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 0;
        if (!room) continue;
        el.scrollLeft += e.deltaY;
        e.preventDefault();
        return;
      }
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  /** Everything the universal search (⌘K) can reach, built fresh on open. */
  const globalSearchItems = useCallback((): SearchItem[] => {
    const items: SearchItem[] = [
      { id: "act-query", kind: "action", label: "New query", keywords: "sql editor", run: () => void openBuiltSql("", false) },
      { id: "act-connect", kind: "action", label: "Connect a database…", keywords: "add connection", run: () => openConnect() },
      { id: "act-notebook", kind: "action", label: "Open the Notebook", keywords: "cells charts dashboards artifact", run: () => openNotebook() },
      { id: "act-dashboard", kind: "action", label: "Open a Dashboard", keywords: "dashboard canvas widgets charts kpi tiles visualize", run: () => openDashboard() },
      { id: "act-market", kind: "action", label: "Open the Marketplace", keywords: "extensions install components", run: () => openMarketplace() },
      { id: "act-skills", kind: "action", label: "Open Skills", keywords: "agent skills claude codex", run: () => openSkills() },
      { id: "act-assistant", kind: "action", label: "Toggle the AI assistant", keywords: "exa chat panel", run: () => toggleAi() },
      { id: "act-settings", kind: "action", label: "Open Settings", keywords: "preferences options", run: () => void openSettingsWindow() },
      { id: "act-ai-settings", kind: "action", label: "AI Personalization", detail: "Persona, depth, tone, custom instructions", keywords: "persona style settings", run: () => void openSettingsWindow("personalization") },
    ];
    for (const t of tabs) {
      items.push({ id: `tab-${t.id}`, kind: "tab", label: t.title, detail: t.view, run: () => setActiveTabId(t.id) });
    }
    for (const prof of profiles) {
      items.push({
        id: `conn-${prof.id}`,
        kind: "connection",
        label: prof.name,
        detail: `${prof.username}@${prof.host}:${prof.port}`,
        run: () => void connectSaved(prof.id),
      });
    }
    const cat = sqlCatalogRef.current;
    for (const [schema, tables] of cat.schemas) {
      items.push({
        id: `schema-${schema}`,
        kind: "schema",
        label: schema,
        run: () => void openBuiltSql(`SELECT TABLE_NAME FROM SYS.EXA_ALL_TABLES WHERE TABLE_SCHEMA = '${schema.replace(/'/g, "''")}' ORDER BY 1;`, true),
      });
      for (const [table] of tables) {
        items.push({
          id: `table-${schema}.${table}`,
          kind: "table",
          label: `${schema}.${table}`,
          run: () => void openBuiltSql(`SELECT * FROM "${schema}"."${table}" LIMIT 100;`, true),
        });
      }
    }
    for (const c of [
      { key: "getting-started", label: "Getting started" },
      { key: "connections", label: "Connections" },
      { key: "workbench/sql-editor", label: "SQL editor" },
      { key: "workbench/notebook", label: "Notebook" },
      { key: "workbench/query-performance", label: "Query performance" },
      { key: "marketplace", label: "Marketplace" },
      { key: "assistant", label: "Assistant" },
      { key: "security", label: "Security" },
    ]) {
      items.push({ id: `docs-${c.key}`, kind: "docs", label: c.label, detail: "Documentation", run: () => openDocsTab(c.key) });
    }
    // Marketplace addons (GitHub-resolved names from the metadata snapshot,
    // instant + offline-safe): picking one opens the marketplace filtered to it.
    for (const m of resolveCatalog(readMetaSnapshot())) {
      items.push({
        id: `market-${m.id}`,
        kind: "marketplace",
        label: m.name,
        detail: m.description || m.kind,
        keywords: `${m.id} ${m.repo ?? ""} ${m.kind} install addon extension`,
        run: () => {
          openMarketplace();
          // After the marketplace mounts — a fresh mount attaches the listener
          // on its first effect pass, which this outlives.
          window.setTimeout(
            () => window.dispatchEvent(new CustomEvent("studio:marketplace-search", { detail: { query: m.name } })),
            150,
          );
        },
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, profiles]);

  // Title bar "Docs" + welcome guides → the in-app docs tab (deep-linkable).
  useEffect(() => {
    const onDocs = (e: Event) => openDocsTab((e as CustomEvent<{ path?: string }>).detail?.path);
    // The chat's "Create notebook" card lands the user in the new notebook.
    const onNotebook = () => openNotebook();
    const onDashboard = (e: Event) => {
      const d = (e as CustomEvent<{ id?: string; title?: string }>).detail;
      openDashboard(d?.id ?? "default", d?.title ?? "Dashboard");
    };
    window.addEventListener("studio:open-docs", onDocs);
    window.addEventListener("studio:open-notebook", onNotebook);
    window.addEventListener("studio:open-dashboard", onDashboard);
    // App-control bridge: the assistant opens views / manages tabs here.
    const openActivity = (id: ActivityId) => { setActivity(id); setSidebarOpen(true); sidebarPanelRef.current?.expand(); };
    const onMkt = () => openMarketplace();
    const onVis = () => { openActivity("visualizer"); openVisualizer(); };
    const onGit = () => openActivity("git");
    const onSkills = () => openSkills();
    const onMcp = () => openActivity("mcp");
    const onSettings = () => void openSettingsWindow();
    const onCloseTab = (e: Event) => {
      const title = (e as CustomEvent<{ title?: string }>).detail?.title;
      const target = title ? tabsFor(connKey).find((t) => t.title === title) : activeTab;
      if (target) closeTab(target.id);
    };
    const onConnectProfile = (e: Event) => {
      const name = (e as CustomEvent<{ name?: string }>).detail?.name;
      const prof = name ? profiles.find((p) => p.name.toLowerCase() === name.toLowerCase()) : profiles[0];
      if (prof) void connectSaved(prof.id);
    };
    const onDisconnectEv = () => onDisconnect(connection?.profile.id);
    window.addEventListener("studio:open-marketplace", onMkt);
    window.addEventListener("studio:open-visualizer", onVis);
    window.addEventListener("studio:open-git", onGit);
    window.addEventListener("studio:open-skills", onSkills);
    window.addEventListener("studio:open-mcp", onMcp);
    window.addEventListener("studio:open-settings", onSettings);
    window.addEventListener("studio:close-tab", onCloseTab);
    window.addEventListener("studio:connect-profile", onConnectProfile);
    window.addEventListener("studio:disconnect", onDisconnectEv);
    // Cross-WINDOW requests (the Settings WebviewWindow can't reach this
    // window's DOM events) arrive over the Tauri event bus.
    let unlistenDocs: (() => void) | undefined;
    if (isTauri()) {
      void import("@tauri-apps/api/event").then(async ({ listen }) => {
        unlistenDocs = await listen<{ path?: string }>("studio:open-docs", (e) => openDocsTab(e.payload?.path));
      });
    }
    return () => {
      window.removeEventListener("studio:open-docs", onDocs);
      window.removeEventListener("studio:open-notebook", onNotebook);
      window.removeEventListener("studio:open-dashboard", onDashboard);
      window.removeEventListener("studio:open-marketplace", onMkt);
      window.removeEventListener("studio:open-visualizer", onVis);
      window.removeEventListener("studio:open-git", onGit);
      window.removeEventListener("studio:open-skills", onSkills);
      window.removeEventListener("studio:open-mcp", onMcp);
      window.removeEventListener("studio:open-settings", onSettings);
      window.removeEventListener("studio:close-tab", onCloseTab);
      window.removeEventListener("studio:connect-profile", onConnectProfile);
      window.removeEventListener("studio:disconnect", onDisconnectEv);
      unlistenDocs?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connKey, tabs]);
  // The Exa tab becoming active closes the dock (the reverse direction).
  useEffect(() => {
    if (activeTab.view === "exaEngine") {
      setAiOpen(false);
      aiPanelRef.current?.collapse();
    }
  }, [activeTab.view]);

  // Stable identity for the notebook's connection list — a fresh array every
  // render would defeat CellView memoization (every keystroke re-rendering
  // every Monaco cell).
  const notebookConns = useMemo(
    () => connections.map((c) => ({ id: c.profile.id, name: c.profile.name, host: `${c.profile.host}:${c.profile.port}` })),
    [connections],
  );

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
      // Per-token editor colors: re-define the themes so open editors recolor
      // live (Monaco re-applies a re-defined theme that is currently active).
      syntaxOverridesRef.current = syntaxOverridesFromSettings(s);
      if (monacoRef.current) defineMonacoThemes(monacoRef.current, syntaxOverridesRef.current);
      if (typeof s.stmtNumbers === "boolean") {
        stmtNumbersRef.current = s.stmtNumbers;
        stmtBadgesRef.current?.setEnabled(s.stmtNumbers);
      }
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
        setEditTable({ schema, table: t.table, pk, columns: d.columns.map((c) => c.name) });
      })
      .catch(() => alive && setEditTable(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab.response, activeTab.sql, activeTab.view, connection]);

  // Apply staged row edits directly ("Confirm & Save"). Exasol returns
  // statement errors INSIDE the result (not as a JS throw), so we inspect each
  // one and stop at the first failure, returning it so the grid shows the
  // inline error and keeps the user's edits.
  async function commitEdits(statements: string[]): Promise<{ ok: boolean; error?: string; failedSql?: string }> {
    if (!connection || !statements.length) return { ok: false, error: "No active connection." };
    try {
      for (const st of statements) {
        const r = await ipc.executeSql(connection.profile.id, connection.profile.name, st, 1, false);
        const errored = r.results.find((x) => x.error);
        if (errored?.error) {
          loadHistory();
          return { ok: false, error: errored.error, failedSql: st };
        }
      }
      const res = await ipc.executeSql(connection.profile.id, connection.profile.name, activeTab.sql, maxRows, false);
      patchTab(activeTab.id, { response: res, execError: null, resultPage: 0 });
      loadHistory();
      void refreshSqlCatalog();
      window.dispatchEvent(new CustomEvent("studio:catalog-changed", { detail: { profileId: connection.profile.id } }));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errorMessage(e) };
    }
  }

  // Run structure-editor DDL directly ("Confirm & Save"). Stops at the first
  // failing statement and reports it so the editor can show it inline; refreshes
  // the tree + catalog on success so the new shape shows up.
  async function commitDdl(statements: string[]): Promise<{ ok: boolean; error?: string; failedSql?: string }> {
    // The Details tab may belong to a connection other than the active one.
    const conn = connections.find((c) => c.profile.id === activeTab.objectProfileId) ?? connection;
    if (!conn || !statements.length) return { ok: false, error: "No active connection." };
    try {
      for (const st of statements) {
        const r = await ipc.executeSql(conn.profile.id, conn.profile.name, st, 1, false);
        const errored = r.results.find((x) => x.error);
        if (errored?.error) {
          loadHistory();
          return { ok: false, error: errored.error, failedSql: st };
        }
      }
      loadHistory();
      void refreshSqlCatalog();
      setTreeKeys((k) => ({ ...k, [conn.profile.id]: (k[conn.profile.id] ?? 0) + 1 }));
      window.dispatchEvent(new CustomEvent("studio:catalog-changed", { detail: { profileId: conn.profile.id } }));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errorMessage(e) };
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
      void refreshSqlCatalog();
      setObjAction(null);
    } catch (e) {
      patchTab(activeTab.id, { execError: errorMessage(e), resultView: "results" });
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

  /** Open generated SQL (DBA actions, row edits, …) in a NEW query tab — the
   *  editor is the single place SQL is reviewed and run, so results and errors
   *  surface natively. Dialogs only confirm; they never execute. */
  // A statement's plan visualizer as its own full-size workbench tab (the
  // Query Performance strip's "Open in tab").
  function openPlanTab(plan: Plan, title: string) {
    tabCounter.current += 1;
    const tab = newTab(tabCounter.current);
    tab.view = "plan";
    tab.title = title;
    tab.planData = [plan];
    updateTabs(connKey, (list) => [...list, tab]);
    setActiveTabId(tab.id);
  }

  function openSqlTab(sql: string, title = "SQL") {
    tabCounter.current += 1;
    const tab = newTab(tabCounter.current);
    tab.title = title;
    tab.sql = sql.trimEnd() + "\n";
    updateTabs(connKey, (list) => [...list, tab]);
    setActiveTabId(tab.id);
  }
  const openSqlTabRef = useRef(openSqlTab);
  openSqlTabRef.current = openSqlTab;
  // Attachment clicks: focus an existing tab for the same file, else open one
  // (ref carries fresh closures into the mount-once event listener).
  const openTextTabRef = useRef((name: string, content: string) => {
    void name;
    void content;
  });
  openTextTabRef.current = (name, content) => {
    const existing = tabsFor(connKey).find((t) => t.title === name && t.view === "sql");
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    openSqlTab(content, name);
  };

  // 2) Tab drag & drop: reorder chips; dropping ON a grouped chip adopts its
  // group; dropping on a group header joins that group.
  // Pointer-drag state for tab reordering (see renderTabChip's onPointerDown).
  const tabDrag = useRef<{ id: string; startX: number; moved: boolean } | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const moveTabRef = useRef<(dragId: string, targetId: string | null) => void>(() => undefined);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = tabDrag.current;
      if (!drag) return;
      if (!drag.moved && Math.abs(e.clientX - drag.startX) < 5) return;
      drag.moved = true;
      setDraggingTabId(drag.id);
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
      setDraggingTabId(null);
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
      const toOrig = targetId ? list.findIndex((x) => x.id === targetId) : -1;
      if (from < 0 || (targetId && toOrig < 0)) return list;
      const next = [...list];
      const [moved] = next.splice(from, 1);
      if (targetId) {
        moved.groupId = list[toOrig].groupId; // adopt target's group (or none)
        let to = next.findIndex((x) => x.id === targetId);
        // Dragging rightward (past the target) drops AFTER it; leftward drops
        // BEFORE it. Without this the tab can only ever move left.
        if (from < toOrig) to += 1;
        next.splice(to, 0, moved);
      } else {
        moved.groupId = undefined;
        next.push(moved);
      }
      return next;
    });
  }
  moveTabRef.current = moveTab;

  // Remove a saved connection entirely (not just disconnect): confirm, drop
  // any live pool, delete the profile from the vault, and refresh the list.
  async function removeConnection(profileId: string) {
    const p = profiles.find((x) => x.id === profileId);
    const name = p?.name ?? "this connection";
    if (!window.confirm(`Remove ${name}? The saved connection and its password are deleted. The database itself is not touched.`)) return;
    if (connections.some((c) => c.profile.id === profileId)) onDisconnect(profileId);
    try {
      await ipc.deleteConnectionProfile(profileId);
    } catch (e) {
      window.dispatchEvent(
        new CustomEvent("studio:notice", { detail: { kind: "warning", title: "Could not remove connection", body: errorMessage(e) } }),
      );
      return;
    }
    await onSaved?.();
  }

  // Connect to a saved profile from the Welcome "Recent" list (or fall back to
  // the connect form if it can't connect straight away).
  async function connectSaved(profileId: string) {
    let p = profiles.find((x) => x.id === profileId);
    if (!p) {
      // `profiles` is fetched at mount; the managed "Exasol Personal (local)"
      // profile is created by the background bootstrap AFTER that, so the list
      // can be stale. Re-fetch from disk before falling back to the blank
      // connect form — otherwise clicking the local card opens "New
      // Connection" instead of the real profile.
      const fresh = await ipc.listConnectionProfiles().catch(() => [] as ConnectionProfile[]);
      p = fresh.find((x) => x.id === profileId);
      if (p) void Promise.resolve(onSaved?.()).catch(() => undefined); // sync the app's profile state
    }
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
      // Landing surface after connecting: a fresh query tab, ready to type —
      // not whatever tab (often the notebook) happened to be open.
      await openBuiltSql("", false);
    } catch {
      // Direct connect couldn't proceed (DB still starting, password cleared,
      // etc.) — open the connect form PRE-FILLED with this profile so the user
      // isn't handed a blank "New Connection" (esp. the bundled Exasol
      // Personal local). Password is never pre-filled.
      openConnect({
        name: p.name,
        host: p.host,
        port: String(p.port),
        username: p.username,
        schema: p.schema ?? "",
        sslMode: p.sslMode,
        compression: p.compression,
        driverId: p.driverId,
        notes: p.notes ?? "",
      });
    }
  }

  // ── Agent UI control (the pet): ui_* tools land here ──
  const cursorRef = useRef<AgentCursorHandle | null>(null);
  useEffect(() => initTraceRecorder(), []);
  // Plain functions (redefined each render) so they always see the CURRENT
  // connection/tabs — a useCallback([]) here froze them at the disconnected
  // first render and opened tabs in the wrong bucket.
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
    await openBuiltSql("", false);
    return { ok: true, detail: profile.id };
  }

  async function handleUiAction(
    action: string,
    params: Record<string, unknown>,
  ): Promise<{ ok: boolean; detail?: string }> {
    // The pet companion is gone — UI actions always show the agent cursor
    // (the ui_* "off"/direct branches read this; keep the wide type).
    const mode = "cursor" as CursorMode;

    const target = String(params.target ?? "");
    const railId = target === "dashboards" ? "notebook" : target;
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
    await cursorRef.current?.flyTo(el, label, mode);

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
            await cursorRef.current?.flyTo(el, lbl, mode);
            return true;
          };
          const fillStep = (id: string, value: string, lbl: string) => async () => {
            await ensureForm();
            const el = anchor(id);
            if (!el) return false;
            await cursorRef.current?.flyTo(el, lbl, mode);
            return fillAnchor(id, value);
          };
          const openTab = (viaAnchor: string) => async () => {
            // Idempotent: if the connect tab is already open, don't click again
            // (a second click could toggle/duplicate it) — just proceed.
            if (anchor("connect.name")) return true;
            const el = anchor(viaAnchor);
            if (!el) return false;
            await cursorRef.current?.flyTo(el, "Opening the connect tab…", mode);
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
              await cursorRef.current?.flyTo(el, lbl, mode);
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
              await cursorRef.current?.flyTo(submit, "Connecting…", mode);
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
            openNotebook();
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
      savedSql: content,
    };
    updateTabs(connKey, (list) => [...list, tab]);
    setActiveTabId(tab.id);
  }

  function openMcpConfig(presetId: string, presetName: string, target: "studio" | "exa" = "studio") {
    const key = connKey;
    const existing = tabsFor(key).find((x) => x.view === "mcpConfig" && x.mcpPreset === presetId && (x.mcpTarget ?? "studio") === target);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    tabCounter.current += 1;
    const tab: SqlTab = {
      id: `tab-mcp-${Date.now()}-${tabCounter.current}`,
      title: target === "exa" ? `Exa MCP · ${presetName}` : `MCP · ${presetName}`,
      view: "mcpConfig",
      mcpPreset: presetId,
      mcpTarget: target,
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
          // Middle-click closes the tab (browser convention).
          if (e.button === 1) {
            e.preventDefault();
            closeTab(tab.id);
            return;
          }
          if (e.button !== 0) return;
          tabDrag.current = { id: tab.id, startX: e.clientX, moved: false };
        }}
        onAuxClick={(e) => e.preventDefault()}
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
        style={connAccent ? { boxShadow: `inset 0 2px 0 0 ${connAccent}` } : undefined}
        className={cn(
          "group relative flex h-9 shrink-0 cursor-pointer items-center gap-1.5 border-r border-border px-3 text-[12px] select-none",
          grouped && "border-r-0",
          tab.id === activeTabId
            ? "bg-editor text-foreground"
            : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground",
          // Green insertion line marks the tab being dragged to its new slot.
          draggingTabId === tab.id &&
            "opacity-70 before:absolute before:inset-y-1 before:-left-px before:z-10 before:w-0.5 before:rounded-full before:bg-primary",
        )}
      >
        {tab.view === "exaEngine" ? (
          <AgentMark className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Icon name={TabIcon} className={cn("h-3.5 w-3.5 shrink-0", tab.id === activeTabId && "text-primary")} />
        )}
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
  async function openBuiltSql(sql: string, runNow: boolean, title?: string) {
    const key = connKey;
    tabCounter.current += 1;
    const tab: SqlTab = {
      id: `tab-q-${Date.now()}-${tabCounter.current}`,
      title: title ?? tabTitleFromSql(sql),
      view: "sql",
      sql,
      response: null,
      execError: null,
    };
    updateTabs(key, (list) => [...list, tab]);
    setActiveIdByConn((a) => ({ ...a, [key]: tab.id }));
    if (runNow && connection) {
      setRunning(true);
      patchTab(tab.id, { resultView: "results", planData: undefined });
      try {
        const result = await ipc.executeSql(connection.profile.id, connection.profile.name, sql, maxRows, true);
        updateTabs(key, (list) =>
          list.map((t) =>
            t.id === tab.id
              ? {
                  ...t,
                  response: result,
                  resultPage: 0,
                  execError: result.success ? null : result.results.find((r) => r.error)?.error ?? "Statement failed.",
                  profileSession: result.profileSession,
                  profileBaseStmt: result.profileBaseStmt,
                }
              : t,
          ),
        );
        loadHistory();
      void refreshSqlCatalog();
      } catch (e) {
        updateTabs(key, (list) => list.map((t) => (t.id === tab.id ? { ...t, execError: errorMessage(e) } : t)));
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
  function openConnect(connectDraft?: SqlTab["connectDraft"]) {
    const list = tabsFor(connKey);
    const existing = list.find((t) => t.view === "connect");
    if (existing) {
      // Re-target an already-open connect tab with the new pre-fill.
      if (connectDraft) patchTab(existing.id, { connectDraft });
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
      connectDraft,
    };
    updateTabs(connKey, (l) => [...l, tab]);
    setActiveTabId(tab.id);
  }

  // Open (or focus) a read-only catalog surface for a connection.
  function openView(
    profileId: string,
    view: "dbInfo" | "dataTypes" | "dba" | "connInfo" | "connProps" | "logs" | "bucketfs" | "backups" | "health",
  ) {
    onFocusConnection(profileId);
    const list = tabsByConn[profileId] ?? tabsFor(profileId);
    // Admin surfaces (issue #45) are singleton tabs per connection.
    if (view === "logs" || view === "bucketfs" || view === "backups" || view === "health") {
      const existing = list.find((t) => t.view === view);
      if (existing) {
        setActiveIdByConn((a) => ({ ...a, [profileId]: existing.id }));
        return;
      }
      const name = connections.find((c) => c.profile.id === profileId)?.profile.name ?? "connection";
      const title =
        view === "logs" ? `Logs · ${name}` : view === "bucketfs" ? `BucketFS · ${name}` : view === "backups" ? `Backups · ${name}` : `Health · ${name}`;
      tabCounter.current += 1;
      const tab: SqlTab = { id: `tab-${Date.now()}-${tabCounter.current}`, title, view, sql: "", response: null, execError: null };
      setTabsByConn((prev) => ({ ...prev, [profileId]: [...(prev[profileId] ?? tabsFor(profileId)), tab] }));
      setActiveIdByConn((a) => ({ ...a, [profileId]: tab.id }));
      return;
    }
    if (view === "dba") {
      const existing = list.find((t) => t.view === "dba");
      if (existing) {
        setActiveIdByConn((a) => ({ ...a, [profileId]: existing.id }));
        return;
      }
      tabCounter.current += 1;
      const tab: SqlTab = { id: `tab-${Date.now()}-${tabCounter.current}`, title: "DBA", view: "dba", sql: "", response: null, execError: null };
      setTabsByConn((prev) => ({ ...prev, [profileId]: [...(prev[profileId] ?? tabsFor(profileId)), tab] }));
      setActiveIdByConn((a) => ({ ...a, [profileId]: tab.id }));
      return;
    }
    // Everything connection-scoped is ONE unified tab (Connection |
    // Properties | Database Info | Data Types | Search) — opening any entry
    // focuses that tab on the right section instead of spawning siblings.
    const section: import("@/features/connection/ConnectionPropertiesTab").ConnectionSection =
      view === "connProps" ? "properties" : view === "dbInfo" ? "dbInfo" : view === "dataTypes" ? "dataTypes" : "connection";
    const existing = list.find((t) => t.view === "connProps");
    if (existing) {
      setTabsByConn((prev) => ({
        ...prev,
        [profileId]: (prev[profileId] ?? []).map((t) =>
          t.id === existing.id ? { ...t, connSection: section, connSectionNonce: (t.connSectionNonce ?? 0) + 1 } : t,
        ),
      }));
      setActiveIdByConn((a) => ({ ...a, [profileId]: existing.id }));
      return;
    }
    tabCounter.current += 1;
    const tab: SqlTab = {
      id: `tab-${Date.now()}-${tabCounter.current}`,
      title: "Connection",
      view: "connProps",
      sql: "",
      response: null,
      execError: null,
      connSection: section,
      connSectionNonce: 1,
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
  function openObjectDetails(
    profileId: string,
    ctx: { type: string; schema?: string; name: string },
    nav?: { tab?: string; edit?: boolean },
  ) {
    const type = ctx.type as ObjectRef["type"];
    if (!["schema", "virtual-schema", "table", "view", "user"].includes(type)) return;
    const list = tabsFor(connKey);
    const id = `obj:${profileId}:${ctx.schema ?? ""}:${ctx.name}:${type}`;
    const nonce = Date.now();
    const existing = list.find((t) => t.view === "object" && t.id === id);
    if (existing) {
      // Re-navigate an already-open details tab to the requested sub-tab.
      if (nav) patchTab(existing.id, { objNavTab: nav.tab, objNavEdit: nav.edit, objNavNonce: nonce });
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
      objNavTab: nav?.tab,
      objNavEdit: nav?.edit,
      objNavNonce: nav ? nonce : undefined,
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

  // The Exa panel's /mcp "Add & configure" opens a connector config tab
  // targeted at the ENGINE's MCP registry (vs Studio's own agent).
  const openMcpConfigRef = useRef(openMcpConfig);
  openMcpConfigRef.current = openMcpConfig;
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ presetId?: string; presetName?: string; target?: "studio" | "exa" }>).detail ?? {};
      openMcpConfigRef.current(d.presetId ?? "custom", d.presetName ?? "Custom", d.target ?? "exa");
    };
    window.addEventListener("studio:open-mcp-config", on);
    return () => window.removeEventListener("studio:open-mcp-config", on);
  }, []);

  // Clicking a file attachment in the Exa chat opens its content as a tab —
  // and clicking the SAME file again focuses the existing tab instead of
  // stacking duplicates.
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ name?: string; content?: string }>).detail ?? {};
      if (typeof d.content !== "string") return;
      openTextTabRef.current(d.name || "Attachment", d.content);
    };
    window.addEventListener("studio:open-text-tab", on);
    return () => window.removeEventListener("studio:open-text-tab", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open (or focus) a full-page tab by a simple single-instance view.
  function openSingletonTab(view: "notebook" | "skills" | "dashboard", title: string, idPrefix: string) {
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
  /** Open (or focus) a dashboard tab for a specific saved dashboard id. */
  function openDashboard(id = "default", title = "Dashboard") {
    const list = tabsFor(connKey);
    const existing = list.find((t) => t.view === "dashboard" && (t.dashboardId ?? "default") === id);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    tabCounter.current += 1;
    const tab: SqlTab = {
      id: `tab-dash-${Date.now()}-${tabCounter.current}`,
      title,
      view: "dashboard",
      dashboardId: id,
      sql: "",
      response: null,
      execError: null,
    };
    updateTabs(connKey, (l) => [...l, tab]);
    setActiveTabId(tab.id);
  }



  // Clicking a notification navigates to what it's about (studio:navigate).
  const navigateRef = useRef<(to: string) => void>(() => undefined);
  navigateRef.current = (to: string) => {
    if (to.startsWith("file:")) {
      void ipc.revealPath(to.slice(5)).catch(() => undefined);
      return;
    }
    if (to === "git") openGit();
    else if (to === "notebook") openNotebook();
    else if (to === "skills") openSkills();
    else if (to === "bi") openNotebook();
    else if (to.startsWith("marketplace")) {
      openMarketplace();
      if (to === "marketplace:updates")
        setTimeout(() => window.dispatchEvent(new CustomEvent("studio:marketplace-nav", { detail: { nav: "updates" } })), 80);
    }
  };
  useEffect(() => {
    const on = (e: Event) => navigateRef.current((e as CustomEvent<{ to?: string }>).detail?.to ?? "");
    window.addEventListener("studio:navigate", on);
    return () => window.removeEventListener("studio:navigate", on);
  }, []);

  /** Documentation INSIDE the app: one docs tab, retargetable to a deep link. */
  function openDocsTab(path?: string) {
    const list = tabsFor(connKey);
    const existing = list.find((t) => t.view === "docs");
    if (existing) {
      updateTabs(connKey, (l) => l.map((t) => (t.id === existing.id ? { ...t, docsPath: path } : t)));
      setActiveTabId(existing.id);
      return;
    }
    tabCounter.current += 1;
    const tab: SqlTab = {
      id: `tab-docsview-${Date.now()}-${tabCounter.current}`,
      title: "Docs",
      view: "docs",
      docsPath: path,
      sql: "",
      response: null,
      execError: null,
    };
    updateTabs(connKey, (l) => [...l, tab]);
    setActiveTabId(tab.id);
  }

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

  // Open the Exa engine (v2) chat as a global tab — not connection-scoped.
  function openExaEngine() {
    const list = tabsFor(connKey);
    const existing = list.find((t) => t.view === "exaEngine");
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    tabCounter.current += 1;
    const tab: SqlTab = {
      id: `tab-exa-${Date.now()}-${tabCounter.current}`,
      title: "Exa",
      view: "exaEngine",
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
      title: n === 1 ? "Schema visualizer" : `Schema visualizer ${n}`,
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
    // "auto" is the primary Execute (DBVisualizer-style): the selected text if
    // there is a selection, otherwise the statement at the cursor. "selection"
    // forces selection-only, "statement" the cursor statement, "script" the
    // whole buffer split into statements, "buffer" the whole buffer as one.
    async (scope: "auto" | "statement" | "selection" | "script" | "buffer") => {
      if (!connection) {
        // Say WHY nothing ran, then open the connect dialog.
        window.dispatchEvent(
          new CustomEvent("studio:notice", {
            detail: {
              kind: "info",
              title: "No database connection",
              body: "Connect to a database to run queries — create or pick a connection to continue.",
            },
          }),
        );
        openConnect();
        return;
      }
      if (running || activeTab.view !== "sql") return;

      const editor = editorRef.current;
      const full = activeTab.sql;
      // What each mode targets is pure (pickRunSql) — the editor only supplies
      // the current selection + cursor offset.
      const sel = editor?.getSelection();
      const selection = sel ? editor?.getModel()?.getValueInRange(sel) ?? "" : "";
      const model = editor?.getModel();
      const pos = editor?.getPosition();
      const cursorOffset = model && pos ? model.getOffsetAt(pos) : 0;
      let sqlToRun = pickRunSql(scope, full, selection, cursorOffset);
      // Cursor after a trailing ";" (common right after opening an object) yields
      // an empty statement — fall back to running the whole tab so Run always acts.
      if (!sqlToRun.trim()) sqlToRun = full;
      if (execSettings.stripComments) sqlToRun = stripSqlComments(sqlToRun);
      if (!sqlToRun.trim()) return;

      // "buffer" runs everything as a single statement; others split.
      const split = scope !== "buffer";

      setRunning(true);
      const startedAt = Date.now();
      const tabId = activeTab.id;
      // Clear the previous result immediately so the panel shows THIS run's
      // progress, not the last statement's rows sitting underneath.
      patchTab(tabId, { response: null, resultPage: 0, execError: null, runMeta: { startedAt, scope, sql: sqlToRun }, queryProgress: undefined, planData: undefined, profileNote: undefined, planIdx: undefined, resultView: "results" });
      // Live engine progress: the backend polls the executing session's
      // ACTIVITY and streams it here; the old result stays pinned until the
      // new one is 100% done.
      const progressId = `qp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // Expose it so the Stop button can cancel THIS run.
      runningProgressId.current = progressId;
      // The listener is set up asynchronously (dynamic import). A fast query
      // can finish before it resolves, so `progressDone` guards both orderings:
      // if the run ends first, the listener disposes itself the moment it
      // attaches; otherwise `finally` disposes it. Either way it never leaks.
      let unlistenProgress: (() => void) | undefined;
      let progressDone = false;
      if (isTauri()) {
        void import("@tauri-apps/api/event").then(async ({ listen }) => {
          const un = await listen<NonNullable<SqlTab["queryProgress"]>>(`query-progress:${progressId}`, (ev) => {
            if (!ev.payload.finished) patchTab(tabId, { queryProgress: ev.payload });
          });
          if (progressDone) un();
          else unlistenProgress = un;
        });
      }
      try {
        const result = await ipc.executeSql(
          connection.profile.id,
          connection.profile.name,
          sqlToRun,
          maxRows,
          split,
          true,
          progressId,
        );
        if (!result.success) {
          const failed = result.results.find((r) => r.error);
          patchTab(activeTab.id, {
            response: result,
                  resultPage: 0,
            execError: failed?.error ?? "Statement failed.",
            runMeta: { startedAt, finishedAt: Date.now(), scope, ok: false },
          });
        } else {
          patchTab(activeTab.id, {
            response: result,
                  resultPage: 0,
            execError: null,
            runMeta: { startedAt, finishedAt: Date.now(), scope, ok: true },
            // Anchor for reading this run's profile without re-executing.
            profileSession: result.profileSession,
            profileBaseStmt: result.profileBaseStmt,
          });
        }
        loadHistory();
      void refreshSqlCatalog();
      } catch (err) {
        patchTab(activeTab.id, {
          execError: errorMessage(err),
          runMeta: { startedAt, finishedAt: Date.now(), scope, ok: false },
        });
      } finally {
        progressDone = true;
        unlistenProgress?.();
        runningProgressId.current = null;
        patchTab(tabId, { queryProgress: undefined });
        setRunning(false);
      }
    },
    [connection, running, activeTab, maxRows, loadHistory, execSettings.stripComments],
  );

  // Stop: cancel the in-flight query (KILL STATEMENT — the session survives).
  const [stopping, setStopping] = useState(false);
  const cancelRunning = useCallback(async () => {
    const pid = runningProgressId.current;
    if (!pid || stopping) return;
    setStopping(true);
    try {
      const killed = await ipc.cancelQuery(pid);
      pushNotification(
        killed ? "info" : "warning",
        killed ? "Stopping query" : "Nothing to stop",
        killed ? "Cancelling the running statement…" : "The query already finished.",
      );
    } catch (e) {
      pushNotification("warning", "Could not stop the query", errorMessage(e));
    } finally {
      setStopping(false);
    }
  }, [stopping]);

  async function saveTab() {
    // A tab opened from an existing file saves back to that same file.
    if (isTauri() && activeTab.filePath) {
      try {
        await ipc.writeTextFile(activeTab.filePath, activeTab.sql);
        // Re-saving recreates a file that may have been deleted — clear the flag.
        updateTabs(connKey, (list) =>
          list.map((t) => (t.id === activeTab.id ? { ...t, fileMissing: false, savedSql: t.sql } : t)),
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
        patchTab(activeTab.id, { title: fileName, savedSql: activeTab.sql, filePath: `${wsPath}/${fileName}` });
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
      patchTab(activeTab.id, { title: file, savedSql: activeTab.sql, filePath: `${wsPath}/${file}` });
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
        `Explain this SQL's measured plan (below) — BRIEFLY. Max 4 short bullets: execution order, joins, where rows/time go, any full scans or redistributions. ` +
        `Cite real numbers; never invent stages. End with ONE plan-backed improvement, or "already efficient".\n\n\`\`\`sql\n${sql}\n\`\`\``,
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
    const p = AI_SQL_PROMPTS[kind](sql);
    if (kind === "explain-plan") {
      void aiExplainPlanWithData(sql, p.text);
      return;
    }
    askExa(p.text, { send: p.send });
  }

  /** AI plan explain, grounded: pull the run's REAL profile rows (same
   *  baseline Query Performance uses) and attach them — the engine has no
   *  profiling tool, so the app supplies the evidence. */
  async function aiExplainPlanWithData(sql: string, promptText: string) {
    const tab = activeTab;
    const conn = connection;
    if (!conn || !tab.profileSession || !tab.profileBaseStmt) {
      window.dispatchEvent(
        new CustomEvent("studio:notice", {
          detail: { kind: "warning", title: "Run the query first", body: "The AI explains the plan of a real run — execute the statement (⌘⏎), then Explain plan again." },
        }),
      );
      return;
    }
    let planBlock = "";
    try {
      await ipc.executeSql(conn.profile.id, conn.profile.name, "FLUSH STATISTICS", 1, false, false).catch(() => null);
      const planSql = `SELECT PART_ID, PART_NAME, PART_INFO, OBJECT_SCHEMA, OBJECT_NAME, OBJECT_ROWS, OUT_ROWS, DURATION, CPU, TEMP_DB_RAM_PEAK FROM EXA_STATISTICS.EXA_USER_PROFILE_LAST_DAY WHERE SESSION_ID = ${tab.profileSession} AND STMT_ID > ${tab.profileBaseStmt} AND COMMAND_NAME NOT IN ('COMMIT', 'ROLLBACK') ORDER BY STMT_ID, PART_ID LIMIT 60`;
      const res = await ipc.executeSql(conn.profile.id, conn.profile.name, planSql, 60, false, false);
      const r = res.results[0];
      if (r && r.kind === "resultSet" && r.rows.length) {
        // The window covers every statement since the baseline, including
        // Studio's own internals — scope to the one that did the real work,
        // and send only the compact table (see lib/plan-block.ts).
        planBlock = buildPlanBlock(heaviestStatement(resultRecords(r)), "EXA_USER_PROFILE_LAST_DAY");
      }
    } catch {
      /* plan fetch failed — send without it rather than not at all */
    }
    if (!planBlock) {
      window.dispatchEvent(
        new CustomEvent("studio:notice", {
          detail: { kind: "warning", title: "No plan captured yet", body: "Statistics haven't landed for this run — try again in a few seconds." },
        }),
      );
      return;
    }
    askExa(
      pinnedPrompt("Explain this query's execution plan.", promptText + planBlock, {
        providerId: "results",
        label: "Measured plan",
      }),
      { send: true, trusted: true },
    );
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



  // "Dashboards" from a result: add this query as a panel to the dashboard for
  // its schema — one dashboard per schema, so every query against WEATHER lands
  // on the WEATHER dashboard (created on first use, appended to after that).
  // Per-query performance ANALYSIS — exact, best-practice Exasol profiling:
  //   1. ONE batch on ONE session: PROFILE ON → statement → SELECT
  //      CURRENT_STATEMENT (a marker, so the profiled statement's id is
  //      DETERMINED, never guessed) → PROFILE OFF → FLUSH STATISTICS.
  //   2. Steps come from EXA_USER_PROFILE_LAST_DAY via SELECT * and are mapped
  //      BY COLUMN NAME (IN_ROWS/OUT_ROWS/REMARKS… — robust across versions).
  //   3. The statement's true wall time comes from EXA_USER_SQL_LAST_DAY —
  //      part durations overlap under parallel execution, so the sum of parts
  //      is NOT the runtime; both are shown, labeled.
  const [profiling, setProfiling] = useState(false);
  const pushNotification = (kind: "info" | "warning" | "success", title: string, body: string) =>
    window.dispatchEvent(new CustomEvent("studio:notice", { detail: { kind, title, body } }));
  // Rows of a result set as column-keyed records (column names upper-cased to
  // match Exasol's profile view columns the normalizer reads).
  function resultRecords(r: { columns: { name: string }[]; rows: unknown[][] }): Record<string, unknown>[] {
    const cols = r.columns.map((c) => c.name.toUpperCase());
    return r.rows.map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
  }

  const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

  // Explain plan (⌘⌥Enter / toolbar): profile the selection, else the statement
  // at the cursor — same target-selection as Execute, shown in Query Performance.
  async function explainRun() {
    if (!connection || running || activeTab.view !== "sql") return;
    const editor = editorRef.current;
    const full = activeTab.sql;
    const sel = editor?.getSelection();
    const selection = sel ? editor?.getModel()?.getValueInRange(sel) ?? "" : "";
    const model = editor?.getModel();
    const pos = editor?.getPosition();
    const cursorOffset = model && pos ? model.getOffsetAt(pos) : 0;
    const sql = pickRunSql("auto", full, selection, cursorOffset);
    await profileQuery(sql.trim() || full, { explain: true });
  }

  // `explain: true` only from the Explain plan action (⌘⌥⏎): merely opening
  // the Query Performance tab must never ping the AI.
  async function profileQuery(sql: string, opts?: { explain?: boolean }) {
    const stmt = sql.trim().replace(/;\s*$/, "");
    if (!connection || profiling) return;
    const cid = connection.profile.id;
    const cname = connection.profile.name;
    // The query was profiled DURING its normal run (profiling is on per
    // session — see connection.rs). We read that profile here without
    // re-executing, using the session + pre-run statement id captured on Run.
    const tab = activeTab;
    const sid = tab.profileSession;
    const base = tab.profileBaseStmt;
    if (!sid || !base) {
      patchTab(tab.id, {
        profileNote:
          "This run did not capture a profiling baseline (restored sessions and bridge drivers cannot). Run the query again, then open Query Performance.",
      });
      return;
    }
    setProfiling(true);
    try {
      // Flush so the just-run profile is queryable immediately (no re-run).
      await ipc.executeSql(cid, cname, "FLUSH STATISTICS", 1, false, false).catch(() => null);

      // The run's statements are the first N distinct non-transaction
      // statements after the baseline on that session (N = executed results).
      // Fetch that whole window and show the HEAVIEST statement — a script's
      // first statement is often trivial DDL whose profile is a lone COMPILE
      // part, which is not what anyone wants to see. Richest source first
      // (per-node IPROC detail for skew), then the user summary view.
      const stmtCount = Math.max(1, tab.response?.results.length ?? 1);
      const detailView = `"$EXA_PROFILE_DETAILS_LAST_DAY"`;
      const userView = `EXA_STATISTICS.EXA_USER_PROFILE_LAST_DAY`;
      const windowSql = (view: string, tail: string) =>
        `SELECT * FROM ${view} WHERE SESSION_ID = ${sid} AND STMT_ID > ${base} AND COMMAND_NAME NOT IN ('COMMIT', 'ROLLBACK') ORDER BY ${tail}`;
      const attempts: { sql: string; source: ProfileSource }[] = [
        { sql: windowSql(detailView, "STMT_ID, PART_ID, IPROC"), source: "DETAILS" },
        { sql: windowSql(userView, "STMT_ID, PART_ID"), source: "USER_SUMMARY" },
      ];

      // Retry: statistics can lag a few seconds even after FLUSH. Bounded
      // (~3s worst case) and it remembers the last DB error for the empty
      // state, so a failure is diagnosable instead of silent.
      let rows: Record<string, unknown>[] = [];
      let source: ProfileSource = "USER_SUMMARY";
      let lastError = "";
      for (let round = 0; round < 8 && rows.length === 0; round++) {
        if (round > 0) await sleep(350);
        for (const attempt of attempts) {
          const res = await ipc.executeSql(cid, cname, attempt.sql, 2000, false, false).catch((e) => {
            lastError = errorMessage(e);
            return null;
          });
          if (res && !res.success) {
            const failed = res.results.find((r) => r.error);
            if (failed?.error) lastError = failed.error;
          }
          const set = res?.results.find((r) => r.kind === "resultSet");
          if (res?.success && set && set.rows.length > 0) {
            rows = resultRecords(set);
            source = attempt.source;
            break;
          }
        }
      }
      if (rows.length === 0) {
        patchTab(tab.id, {
          profileNote:
            `No profile rows for session ${sid}, statements after #${base} (checked $EXA_PROFILE_DETAILS_LAST_DAY and EXA_USER_PROFILE_LAST_DAY, 8 attempts over ~3s).` +
            (lastError ? ` Last database error: ${lastError}` : " The statements may have been too fast to record, or session profiling was off for this run."),
        });
        return;
      }

      // ONE plan PER statement of the run (a script shows them all as tabs);
      // keep the run's statement order.
      const stmtIds: string[] = [];
      const rowsByStmt = new Map<string, Record<string, unknown>[]>();
      for (const r of rows) {
        const id = r.STMT_ID !== undefined && r.STMT_ID !== null ? String(r.STMT_ID) : "";
        if (!id) continue;
        if (!rowsByStmt.has(id)) {
          if (stmtIds.length >= stmtCount) continue; // beyond this run
          stmtIds.push(id);
          rowsByStmt.set(id, []);
        }
        rowsByStmt.get(id)!.push(r);
      }

      // Profile views carry no SQL_TEXT, and no audit view is generally
      // available (EXA_SQL_LAST_DAY has no text; EXA_DBA_AUDIT_SQL needs
      // auditing + DBA). The app RAN these statements itself, in this exact
      // order — label each plan from the run's own results, no query at all.
      const runStatements = (tab.response?.results ?? []).map((r) => r.statement);
      const sqlTexts = new Map<string, string>();
      stmtIds.forEach((id, i) => {
        const text = runStatements[i]?.trim();
        if (text) sqlTexts.set(id, text);
      });

      const plans: Plan[] = stmtIds.map((id) => {
        const group = rowsByStmt.get(id)!;
        // Derive the session key from the rows THEMSELVES: SESSION_ID arrives
        // as a JSON number beyond 2^53 (Exasol session ids are ~1.9e18), so
        // String(row) !== the exact TO_CHAR(CURRENT_SESSION) string, and
        // normalizeProfileRows would filter every row out.
        const ctxSession = group[0].SESSION_ID !== undefined && group[0].SESSION_ID !== null ? String(group[0].SESSION_ID) : sid;
        const plan = normalizeProfileRows(group, { sessionId: ctxSession, stmtId: id, source });
        plan.queryText = sqlTexts.get(id) ?? plan.queryText ?? (stmtIds.length === 1 ? stmt : "");
        return plan;
      });
      if (plans.every((p) => p.nodes.length === 0)) {
        patchTab(tab.id, { profileNote: "The profile rows produced no operators for any statement of this run." });
        return;
      }
      patchTab(tab.id, { planData: plans, resultView: "performance", profileNote: undefined });
      loadHistory();

      // Explain plan means EXPLAIN: alongside the Query Performance view, send
      // the measured rows to the AI so the plan arrives already narrated —
      // grounded in this exact run, never guessed. Scope to the RUN's own
      // statements (rowsByStmt — never the window's internal queries), pick
      // the one that did the real work, and send only the compact table.
      if (opts?.explain) {
        const aiRows = heaviestStatement(stmtIds.flatMap((id) => rowsByStmt.get(id) ?? []));
        const planBlock = buildPlanBlock(aiRows, source === "DETAILS" ? "$EXA_PROFILE_DETAILS_LAST_DAY" : "EXA_USER_PROFILE_LAST_DAY");
        if (planBlock)
          askExa(
            pinnedPrompt(
              "Explain this query's execution plan.",
              AI_SQL_PROMPTS["explain-plan"](plans[0]?.queryText || stmt).text + planBlock,
              { providerId: "results", label: "Measured plan" },
            ),
            { send: true, trusted: true },
          );
      }
    } catch (e) {
      patchTab(tab.id, { profileNote: `Profiling failed: ${errorMessage(e)}` });
    } finally {
      setProfiling(false);
    }
  }

  // Server-side result paging for single-SELECT tabs: page 0 is the plain run
  // (the truncated flag = "has next"); later pages wrap the query with
  // ORDER BY 1 + LIMIT/OFFSET — Exasol requires a deterministic order for
  // OFFSET, so pages beyond the first are ordered by the first column.
  //
  // Pages are PREFETCHED: as soon as a page is on screen the next one loads
  // in the background (and visited pages stay cached), so ▸ is instant. The
  // cache is stamped with the tab's SQL — a re-run or edit invalidates it —
  // and prefetches skip the execution log (addHistory=false).
  const [paging, setPaging] = useState(false);
  const pageCache = useRef<Map<string, { sql: string; pages: Map<number, ExecuteResponse> }>>(new Map());
  const prefetching = useRef<Set<string>>(new Set());

  function pagedSql(base: string, page: number): string {
    return page === 0 ? base : `SELECT * FROM (\n${base}\n) ORDER BY 1 LIMIT ${maxRows + 1} OFFSET ${page * maxRows}`;
  }
  function pageBase(sql: string): string | null {
    const stmts = splitStatements(sql);
    if (stmts.length !== 1) return null;
    const base = stmts[0].text.trim().replace(/;\s*$/, "");
    return /^select|^with/i.test(base) ? base : null;
  }
  async function prefetchPage(tabId: string, base: string, page: number) {
    if (!connection || page < 0) return;
    const key = `${tabId}:${page}`;
    const entry = pageCache.current.get(tabId);
    if (prefetching.current.has(key) || !entry || entry.sql !== base || entry.pages.has(page)) return;
    prefetching.current.add(key);
    try {
      const res = await ipc.executeSql(connection.profile.id, connection.profile.name, pagedSql(base, page), maxRows, false, false);
      const cur = pageCache.current.get(tabId);
      if (res.success && cur && cur.sql === base) {
        cur.pages.set(page, res);
        // Keep memory bounded: hold at most 8 pages, dropping the farthest.
        while (cur.pages.size > 8) {
          const far = [...cur.pages.keys()].reduce((a2, b2) => (Math.abs(a2 - page) >= Math.abs(b2 - page) ? a2 : b2));
          cur.pages.delete(far);
        }
      }
    } catch {
      /* prefetch is best-effort — the click path fetches live on a miss */
    } finally {
      prefetching.current.delete(key);
    }
  }
  // A fresh run (page-0 response we didn't serve from cache) seeds the cache
  // and warms page 1 immediately.
  useEffect(() => {
    const res = activeTab.response;
    if (!res || (activeTab.resultPage ?? 0) !== 0 || !res.success) return;
    const base = pageBase(activeTab.sql);
    if (!base) return;
    const entry = pageCache.current.get(activeTab.id);
    if (entry && entry.sql === base && entry.pages.get(0) === res) return; // cache-served, not a new run
    pageCache.current.set(activeTab.id, { sql: base, pages: new Map([[0, res]]) });
    if (res.results[0]?.truncated) void prefetchPage(activeTab.id, base, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab.id, activeTab.response, activeTab.resultPage]);

  async function loadResultPage(page: number) {
    if (!connection || page < 0) return;
    const base = pageBase(activeTab.sql);
    if (!base) return;
    const entry = pageCache.current.get(activeTab.id);
    const cached = entry && entry.sql === base ? entry.pages.get(page) : undefined;
    if (cached) {
      patchTab(activeTab.id, { response: cached, execError: null, resultPage: page });
      if (cached.results[0]?.truncated) void prefetchPage(activeTab.id, base, page + 1);
      if (page > 0) void prefetchPage(activeTab.id, base, page - 1);
      return;
    }
    if (paging) return;
    setPaging(true);
    try {
      // Page turns are navigation, not new work — keep the LIMIT/OFFSET
      // wrappers out of the execution log (the original run is already there).
      const res = await ipc.executeSql(connection.profile.id, connection.profile.name, pagedSql(base, page), maxRows, false, false);
      const cur = pageCache.current.get(activeTab.id);
      if (res.success && cur && cur.sql === base) cur.pages.set(page, res);
      patchTab(activeTab.id, { response: res, execError: res.success ? null : res.results.find((r) => r.error)?.error ?? null, resultPage: page });
      if (res.success && res.results[0]?.truncated) void prefetchPage(activeTab.id, base, page + 1);
    } catch (e) {
      pushNotification("warning", "Page load failed", errorMessage(e));
    } finally {
      setPaging(false);
    }
  }

  // Step through SQL history into the current editor.
  // Step through executed-SQL history. Index -1 is the user's live draft;
  // 0 is the most recent entry. "prev" (<) goes further back, "next" (>) comes
  // forward toward the draft. Stepping into history stashes the draft so
  // "next" past the newest entry restores exactly what was typed.
  function historyNav(dir: "prev" | "next") {
    if (history.length === 0) return;
    if (dir === "prev") {
      if (historyIdx < 0) historyDraft.current = activeTab.sql ?? "";
      const idx = Math.min(Math.max(historyIdx, -1) + 1, history.length - 1);
      setHistoryIdx(idx);
      const entry = history[idx];
      if (entry) patchTab(activeTab.id, { sql: entry.sql });
      return;
    }
    // next
    if (historyIdx < 0) return; // already at the live draft
    if (historyIdx === 0) {
      setHistoryIdx(-1);
      patchTab(activeTab.id, { sql: historyDraft.current ?? "" });
      return;
    }
    const idx = historyIdx - 1;
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
      void refreshSqlCatalog();
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

  // Live workbench view Exa's `@`-context reads (schema/SQL/results) and the
  // action that lands a reply's SQL block back in the editor. Both are handed
  // to every ExaEnginePanel instance (side dock + full tab).
  const getExaSnapshot = useCallback(
    () => ({
      connectionName: connection ? connection.server.databaseName ?? "Exasol" : undefined,
      schema,
      schemas,
      catalog: sqlCatalogRef.current,
      editorSql: activeTab.view === "sql" ? activeTab.sql : "",
      lastResult,
      history: history.slice(0, 20).map((h) => ({ sql: h.sql })),
      // The Copilot-style "current tab" pin: whatever dev tab is on screen,
      // pre-described for the assistant (query SQL, notebook cells, …).
      activeTab: describeTabForContext(activeTab, activeTab.view === "notebook" ? readActiveNotebook() : null),
    }),
    [connection, schema, schemas, activeTab, lastResult, history],
  );
  // Tell the composer's current-tab pill to refresh when the tab changes.
  useEffect(() => {
    window.dispatchEvent(new Event("studio:tab-context-changed"));
  }, [activeTab.id, activeTab.view, activeTab.title]);
  // Plain function (not memoized): it reads the current connKey/tab closures at
  // call time, so Apply always lands in the active connection's editor — never
  // a stale bucket. It's only invoked from event handlers, so identity churn is
  // harmless.
  const applySqlToEditor = (sql: string) => {
    // A pinned notebook cell owns Apply while the pin stands: the SQL lands
    // in that cell and runs there.
    const pinned = (window as unknown as { __exaPinnedCell?: string | null }).__exaPinnedCell;
    if (pinned) {
      window.dispatchEvent(new CustomEvent("studio:apply-to-cell", { detail: { cellId: pinned, sql } }));
      openNotebook();
      return;
    }
    // A pinned QUERY tab (the composer's "current tab" pill) receives the SQL
    // as its new content — the AI writes INTO the tab, even if the user
    // switched away meanwhile.
    const pinnedTab = (window as unknown as { __exaPinnedTabId?: string | null }).__exaPinnedTabId;
    if (pinnedTab) {
      const target = tabsFor(connKey).find((t) => t.id === pinnedTab && t.view === "sql");
      if (target) {
        patchTab(target.id, { sql: `${sql}\n` });
        setActiveTabId(target.id);
        return;
      }
    }
    if (activeTab.view === "sql") {
      const base = activeTab.sql.trimEnd();
      patchTab(activeTab.id, { sql: base ? `${base}\n\n${sql}\n` : `${sql}\n` });
    } else {
      openSqlTab(sql, "From Exa");
    }
  };

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      <TitleBar
        connection={connection}
        onConnect={() => openConnect()}
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
            if (id === "git" || id === "skills") {
              // Full-page tabs (Source Control, Skills).
              sidebarPanelRef.current?.collapse();
              setSidebarOpen(false);
              if (id === "git") openGit();
              else openSkills();
              return;
            }
            // Notebooks / Dashboards are LIST panels in the sidebar (fall through
            // to the panel branch below); clicking a list item opens the tab.
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
              onConnect={() => openConnect()}
              onConnectProfile={(id) => void connectSaved(id)}
              onInstallLocal={() => void ipc.personalLocalBootstrap().catch(() => undefined)}
              onFocusConnection={onFocusConnection}
              onDisconnect={onDisconnect}
              onRemoveConnection={(id) => void removeConnection(id)}
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
          activeTab.view !== "docs" &&
          activeTab.view !== "welcome" &&
          activeTab.view !== "mcpConfig" &&
          activeTab.view !== "git" &&
          activeTab.view !== "notebook" &&
          activeTab.view !== "skills" &&
          activeTab.view !== "artifact" &&
          // The Exa tab is a full chat surface — no editor toolbar row (its
          // own header carries the brand; the agent works across ALL
          // connected databases via the MCP gateway, so a per-tab connection
          // switcher was misleading anyway).
          activeTab.view !== "exaEngine" &&
          activeTab.view !== "object" ? (
          <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {!isSpecialTab ? (
              <>
                {/* Execute group — DBVisualizer's four run modes, all naked icon
                    buttons. A drag-selection runs instead of the whole buffer for
                    the script + current buttons; onMouseDown preventDefault keeps
                    the selection on click. */}
                <IconButton
                  label="Execute script (⌘⏎)"
                  onClick={() => run("script")}
                  onMouseDown={(e) => e.preventDefault()}
                  disabled={running}
                >
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RunScriptIcon className="h-4 w-4 text-primary" />}
                </IconButton>
                <IconButton
                  label="Execute current (⌘.)"
                  onClick={() => run("auto")}
                  onMouseDown={(e) => e.preventDefault()}
                  disabled={running}
                >
                  <RunCurrentIcon className="h-4 w-4 text-primary" />
                </IconButton>
                <IconButton label="Execute buffer as one statement (⌘⇧⏎)" onClick={() => run("buffer")} disabled={running}>
                  <RunBufferIcon className="h-4 w-4 text-primary" />
                </IconButton>
                <IconButton
                  label="Explain plan (⌘⌥⏎)"
                  onClick={() => void explainRun()}
                  onMouseDown={(e) => e.preventDefault()}
                  disabled={running || !connected}
                >
                  <RunExplainIcon className="h-4 w-4 text-primary" />
                </IconButton>
                <IconButton label="Stop the running query" onClick={() => void cancelRunning()} disabled={!running || stopping}>
                  {stopping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                </IconButton>

                <div className="mx-1 h-5 w-px shrink-0 bg-border" />

                {/* Max rows — in the execute toolbar, next to Run (DBVis-style) */}
                <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
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
                {(() => {
                  // Dirty = the buffer differs from what was last saved/opened.
                  const tabDirty = activeTab.sql !== (activeTab.savedSql ?? "");
                  return (
                    <IconButton
                      label={tabDirty ? "Save to the current file (unsaved changes)" : "Save to the current file — no changes"}
                      onClick={saveTab}
                      disabled={!tabDirty}
                    >
                      <Save className={cn("h-3.5 w-3.5", tabDirty && "text-primary")} />
                    </IconButton>
                  );
                })()}
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
                <IconButton label="Build a UDF script" active={udfBuilderOpen} onClick={() => setUdfBuilderOpen((v) => !v)}>
                  <span className="font-mono text-[13px] font-bold leading-none">ƒ</span>
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
                  return <Icon name={TabIcon} className="h-3.5 w-3.5 text-primary" />;
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
              </>
            ) : null}
          </div>
          ) : null}

          {/* Exa stays MOUNTED while its tab exists — switching tabs must
              not destroy the runtime/composer (attachments, draft text). */}
          {(() => {
            const exaTab = tabsFor(connKey).find((t) => t.view === "exaEngine");
            if (!exaTab) return null;
            return (
              <div className={cn("min-h-0 flex-1 flex-col", activeTab.view === "exaEngine" ? "flex" : "hidden")}>
                <ExaEnginePanel
                  getSnapshot={getExaSnapshot}
                  onApplySql={applySqlToEditor}
                  onCollapse={() => {
                    closeTab(exaTab.id);
                    setAiOpen(true);
                    aiPanelRef.current?.expand();
                  }}
                />
              </div>
            );
          })()}

          {/* Connect flow, catalog surface, file preview, or SQL editor */}
          {activeTab.view === "connect" ? (
            // New connection = the SAME unified Database Connection page in
            // new-profile mode (Test connection / Save & Connect footer).
            <div className="min-h-0 flex-1">
              <ConnectionPropertiesTab
                connection={null}
                profileId={null}
                initialDraft={activeTab.connectDraft}
                onSaved={() => void onSaved?.()}
                onConnected={async (p, srv) => {
                  await onConnected(p, srv);
                  await agentClient.grantConnection(p.id).catch(() => undefined);
                  await openBuiltSql("", false);
                }}
              />
            </div>
          ) : activeTab.view === "mcpConfig" ? (
            <div className="min-h-0 flex-1">
              <McpConfigTab presetId={activeTab.mcpPreset ?? "custom"} target={activeTab.mcpTarget ?? "studio"} />
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
                onConnect={() => openConnect()}
                onMarketplace={openMarketplace}
                onGuides={(path) => openDocsTab(path)}
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
          ) : activeTab.view === "exaEngine" ? null : activeTab.view === "git" ? (
            <div className="flex min-h-0 flex-1 flex-col bg-editor">
              {isTauri() ? (
                <GitPanel full />
              ) : (
                <DesktopOnly
                  feature="Source control"
                  detail="Git works on this machine's repositories and needs the desktop app's filesystem access. Your SQL, notebooks and connections are unaffected here."
                />
              )}
            </div>
          ) : activeTab.view === "plan" ? (
            // A statement's plan visualizer, full-size (its operator sidebar
            // has room here that the results panel lacks).
            <div className="min-h-0 flex-1 bg-editor">
              {activeTab.planData?.[0] ? (
                <QueryPlanView plan={activeTab.planData[0]} onOpenSql={openSqlTab} />
              ) : (
                <div className="flex h-full items-center justify-center text-[12.5px] text-muted-foreground">
                  This plan tab has no data — profile a query from its Query Performance view.
                </div>
              )}
            </div>
          ) : activeTab.view === "dashboard" ? (
            <div className="min-h-0 flex-1">
              <DashboardTab
                key={activeTab.dashboardId ?? "default"}
                dashboardId={activeTab.dashboardId ?? "default"}
                profileId={connection?.profile.id ?? null}
                connectionName={connection?.profile.name ?? ""}
              />
            </div>
          ) : activeTab.view === "notebook" ? (
            <div className="min-h-0 flex-1">
              <NotebookTab
                profileId={connection?.profile.id ?? null}
                connectionName={connection?.profile.name ?? ""}
                connections={notebookConns}
                editorTheme={editorTheme}
                beforeMount={(m) => {
                  applyMonacoThemes(m);
                  // Register Exasol autocompletion on the shared monaco (guarded
                  // internally) so notebook SQL cells get completions too.
                  registerExasolCompletion(m, () => sqlCatalogRef.current);
                }}
                onConnectDb={() => openConnect()}
                onAddVirtualSchema={() => (connection ? openVs(connection.profile.id) : openConnect())}
                onAsk={(text, kind, chart) => {
                  // Cell → exa: the prompt carries the source and, for chart
                  // cells, the current design so exa can modify it directly.
                  const ask = {
                    sql: chart && chart !== "table"
                      ? { text: `This notebook cell renders its result as a "${chart}" chart. Help me improve or redesign the visualization and the SQL behind it — suggest the best chart kind and any query changes.`, lang: "sql" }
                      : { text: "Explain this SQL, spot any issues, and suggest an improvement.", lang: "sql" },
                    markdown: { text: "Improve this note — fix wording, structure it better, and fill any gaps.", lang: "markdown" },
                    mermaid: { text: "Explain this diagram and suggest how to improve or extend it.", lang: "mermaid" },
                  }[kind ?? "sql"];
                  askExa(`${ask.text}\n\n\`\`\`${ask.lang}\n${text || ""}\n\`\`\``, { send: false });
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
          ) : activeTab.view === "docs" ? (
            <div className="min-h-0 flex-1">
              <DocsTab key={activeTab.docsPath ?? ""} path={activeTab.docsPath} />
            </div>
          ) : activeTab.view === "object" && activeTab.objectRef && activeTab.objectProfileId ? (
            <div className="min-h-0 flex-1">
              <ObjectDetailPanel
                profileId={activeTab.objectProfileId}
                connectionName={connections.find((c) => c.profile.id === activeTab.objectProfileId)?.profile.name ?? ""}
                object={activeTab.objectRef}
                onOpenData={(sql) => void openBuiltSql(sql, true)}
                onOpenSql={openSqlTab}
                onApplyDdl={commitDdl}
                navTab={activeTab.objNavTab}
                navEdit={activeTab.objNavEdit}
                navNonce={activeTab.objNavNonce}
              />
            </div>
          ) : isSpecialTab && connection ? (
            <div className="min-h-0 flex-1">
              {activeTab.view === "connProps" ? (
                // ONE unified Database Connection page (Connection | Properties |
                // Database Info | Data Types | Search) — a single tab per
                // connection; menu entries just switch its section.
                <ConnectionPropertiesTab
                  connection={connection}
                  profileId={connection.profile.id}
                  initialSection={activeTab.connSection ?? "connection"}
                  sectionNonce={activeTab.connSectionNonce}
                  onSaved={() => onSaved?.()}
                  onOpenObject={(schema, name) => openObject(connection.profile.id, schema, name)}
                  onDisconnect={() => onDisconnect(connection.profile.id)}
                  onConnect={() => void connectSaved(connection.profile.id)}
                  onRefresh={() => refreshConnection(connection.profile.id)}
                />
              ) : activeTab.view === "dba" ? (
                <DbaDashboard profileId={connection.profile.id} connectionName={connection.profile.name} onOpenSql={openSqlTab} />
              ) : activeTab.view === "logs" ? (
                <LogsPanel profileId={connection.profile.id} connectionName={connection.profile.name} />
              ) : activeTab.view === "backups" ? (
                isTauri() ? (
                  <BackupsPanel profileId={connection.profile.id} connectionName={connection.profile.name} dbHost={connection.profile.host} />
                ) : (
                  <DesktopOnly feature="Backups" detail="Backing up the local database writes archives on this machine, which needs the desktop app." />
                )
              ) : activeTab.view === "health" ? (
                <HealthPanel profileId={connection.profile.id} connectionName={connection.profile.name} dbHost={connection.profile.host} />
              ) : activeTab.view === "bucketfs" ? (
                isTauri() ? (
                  <BucketFsPanel profile={connection.profile} variant="tab" onClose={() => closeTab(activeTab.id)} />
                ) : (
                  <DesktopOnly feature="BucketFS" detail="Uploading and downloading BucketFS files moves data through this machine's filesystem, which needs the desktop app." />
                )
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
              <ResizablePanel defaultSize="55%" minSize="120px" className="relative flex min-h-0 flex-col">
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
                {udfBuilderOpen ? (
                  <div className="shrink-0 border-b border-border p-2">
                    <UdfBuilder
                      langs={udfLangs}
                      onInsert={(sql) => { insertIntoEditor(sql); setUdfBuilderOpen(false); }}
                      onRun={connected ? (sql) => { insertIntoEditor(sql); setUdfBuilderOpen(false); window.setTimeout(() => void run("buffer"), 60); } : undefined}
                      onClose={() => setUdfBuilderOpen(false)}
                    />
                  </div>
                ) : null}
                <div className="min-h-0 flex-1">
                <Editor
                  beforeMount={applyMonacoThemes}
                  defaultLanguage="sql"
                  path={`${connKey}/${activeTab.id}.sql`}
                  height="100%"
                  loading={<BrandLoader size={40} />}
                  value={activeTab.sql}
                  theme={editorTheme}
                  onChange={(value) => {
                    // A genuine user edit leaves history navigation — the typed
                    // text is now the live draft.
                    if (historyIdx >= 0) setHistoryIdx(-1);
                    patchTab(activeTab.id, { sql: value ?? "" });
                  }}
                  onMount={(editor, monaco) => {
                    editorRef.current = editor;
                    setStatusEditor(editor);
                    registerExasolCompletion(monaco, () => sqlCatalogRef.current);
                    stmtBadgesRef.current = installStatementBadges(editor, monaco);
                    stmtBadgesRef.current.setEnabled(stmtNumbersRef.current);
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
                    // DBVisualizer shortcuts as real ACTIONS so they are
                    // searchable in the command palette, not just keybindings:
                    // ⌘↵ script, ⌘. current, ⌘⇧↵ buffer, ⌘⌥↵ explain.
                    const runActs = [
                      { id: "exa.run.script", label: "Execute the buffer as an SQL script", keys: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter], run: () => void run("script") },
                      { id: "exa.run.current", label: "Execute the current statement", keys: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Period], run: () => void run("auto") },
                      { id: "exa.run.buffer", label: "Execute the complete buffer as one statement", keys: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter], run: () => void run("buffer") },
                      { id: "exa.run.explain", label: "Execute the statement(s) as explain plan", keys: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.Enter], run: () => void explainRun() },
                    ];
                    for (const a of runActs) {
                      editor.addAction({ id: a.id, label: a.label, keybindings: a.keys, run: a.run });
                    }
                    // Monaco suppresses trigger characters inside comment
                    // tokens, so "-"/"--"/"--/" never open the dropdown on
                    // their own — force the suggest widget for the dash
                    // suggestions (comment vs UDF block).
                    // onDidType exists on the widget but is absent from the
                    // IStandaloneCodeEditor typings.
                    (editor as unknown as { onDidType: (fn: (text: string) => void) => void }).onDidType((text) => {
                      if (text !== "-" && text !== "/" && text !== "*") return;
                      const pos = editor.getPosition();
                      const mdl = editor.getModel();
                      if (!pos || !mdl) return;
                      const before = mdl.getLineContent(pos.lineNumber).slice(0, pos.column - 1);
                      if (!/^\s*(-{1,2}|--\/|\/\*?)$/.test(before)) return;
                      // A lone "/" that CLOSES an open --/ script block is the
                      // block terminator, not the start of a comment — popping
                      // the dropdown there flashed the UI on every UDF edit.
                      if (/^\s*\/$/.test(before)) {
                        const offset = mdl.getOffsetAt(pos);
                        const inOpenBlock = findScriptBlocks(mdl.getValue()).some((b) => !b.closed && offset > b.start);
                        if (inOpenBlock) return;
                      }
                      editor.trigger("exa-dash", "editor.action.triggerSuggest", {});
                    });
                    // Quick UDF scaffold (also available by typing "udf" in the
                    // editor — the completion list carries per-language templates).
                    editor.addAction({
                      id: "exa.insert.udf",
                      label: "Insert UDF script template (--/ … /)",
                      run: (ed) => {
                        const snippet =
                          "--/\nCREATE OR REPLACE LUA SCALAR SCRIPT ${1:MY_UDF} (${2:a DOUBLE, b DOUBLE})\nRETURNS ${3:DOUBLE} AS\nfunction run(ctx)\n    ${0:-- return ctx.a}\nend\n/\n";
                        const snippets = ed.getContribution("snippetController2") as unknown as { insert?: (s: string) => void } | null;
                        if (snippets?.insert) snippets.insert(snippet);
                        else {
                          const sel = ed.getSelection();
                          if (sel) ed.executeEdits("exa-udf", [{ range: sel, text: snippet.replace(/\$\{\d+:?([^}]*)\}/g, "$1") }]);
                        }
                      },
                    });
                    // Quick Access (the VS Code-style palette): ⌘P opens the
                    // provider list (go to line, symbols, commands), ⌘⇧P goes
                    // straight to Show And Run Commands. F1 stays built in.
                    const openQuickAccess = (prefix: string) => {
                      // invokeWithinContext exists on the widget but is absent
                      // from the IStandaloneCodeEditor typings.
                      const widget = editor as unknown as {
                        invokeWithinContext: (fn: (accessor: { get: (id: unknown) => unknown }) => void) => void;
                      };
                      widget.invokeWithinContext((accessor) => {
                        (accessor.get(IQuickInputService) as { quickAccess: { show: (v: string) => void } }).quickAccess.show(prefix);
                      });
                    };
                    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, () => openQuickAccess(""));
                    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP, () => openQuickAccess(">"));
                  }}
                  options={{
                    automaticLayout: true,
                    lightbulb: { enabled: "on" as never },
                    // Default 10px + the folding zone left a wide gap between
                    // the line number and the first character.
                    lineDecorationsWidth: 0,
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
                </div>
                <EditorStatusBar editor={statusEditor} sql={activeTab.sql} />
              </ResizablePanel>
              <ResizableHandle groupDirection="vertical" />
              <ResizablePanel defaultSize="45%" minSize="80px" className="min-h-0">
                <ResultsPanel
                  view={activeTab.resultView ?? "results"}
                  onViewChange={(v) => patchTab(activeTab.id, { resultView: v })}
                  sql={activeTab.sql}
                  response={activeTab.response}
                  lastResult={lastResult}
                  execError={activeTab.execError}
                  runMeta={activeTab.runMeta}
                  queryProgress={activeTab.queryProgress}
                  resultPage={activeTab.resultPage}
                  maxRows={maxRows}
                  mergeResults={mergeResults}
                  editable={editTable}
                  fontSize={gridFontSize}
                  zebra={gridZebra}
                  paging={paging}
                  onPage={(page) => void loadResultPage(page)}
                  onOpenSql={openSqlTab}
                  onCommitEdits={commitEdits}
                  editBusy={running}
                  planData={activeTab.planData}
                  profileNote={activeTab.profileNote}
                  planIdx={activeTab.planIdx}
                  onPlanIdxChange={(i) => patchTab(activeTab.id, { planIdx: i })}
                  profiling={profiling}
                  onProfile={() => void profileQuery(activeTab.sql)}
                  onOpenPlanTab={openPlanTab}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
          </>
            </div>
          </ResizablePanel>
          <ResizableHandle groupDirection="horizontal" />

          {/* Exa (opencode) assistant — resizable + collapsible. Same panel as
              the full "Exa" tab, so both surfaces are one agent. */}
          <ResizablePanel
            panelRef={aiPanelRef}
            collapsible
            collapsedSize="0px"
            defaultSize="440px"
            minSize="320px"
            maxSize="820px"
            onResize={() => setAiOpen(!(aiPanelRef.current?.isCollapsed() ?? false))}
            className="min-w-0"
          >
            <ExaEnginePanel
              getSnapshot={getExaSnapshot}
              onApplySql={applySqlToEditor}
              onClose={toggleAi}
              onExpand={() => {
                openExaEngine();
                setAiOpen(false);
                aiPanelRef.current?.collapse();
              }}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <GlobalSearch getItems={globalSearchItems} />
      <AgentCursor ref={cursorRef} />
      <div className="shrink-0">
        <HistoryDock
          entries={history}
          open={historyOpen}
          onToggle={() => setHistoryOpen((o) => !o)}
          onPick={(value) => {
            // Focus a tab already holding this SQL; otherwise open a new one —
            // never overwrite whatever the user has in the current editor.
            const norm = (x: string) => x.replace(/\s+/g, " ").trim().toLowerCase();
            const existing = tabs.find((t) => t.view === "sql" && norm(t.sql) === norm(value));
            if (existing) setActiveTabId(existing.id);
            else openSqlTab(value, "From log");
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
          onEditInDetails={(tab, edit) => ctxMenu.node.ctx && openObjectDetails(ctxMenu.profileId, ctxMenu.node.ctx, { tab, edit })}
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
