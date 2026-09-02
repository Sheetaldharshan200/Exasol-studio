/**
 * The studio's left sidebar: the per-connection object-tree sections, the
 * visualizer panel, and the sidebar shell that switches between activities
 * (databases, files, favorites, git, marketplace, visualizer, search).
 *
 * Extracted from ExasolStudio.tsx. `ConnectionSection` and `VisualizerPanel`
 * move with `Sidebar` because only it renders them.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  ChevronsDownUp,
  Database,
  HardDriveUpload,
  Info,
  MoreHorizontal,
  PanelLeftClose,
  Plug,
  PlugZap,
  Plus,
  RefreshCcw,
  Search,
  Settings2,
  Shapes,
  Shield,
  Trash2,
  Unplug,
  Waypoints,
  X,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon, type IconName } from "@/components/ui/icon";
import { Marketplace } from "@/features/marketplace/Marketplace";
import { McpMarketplace } from "@/features/marketplace/McpMarketplace";
import type { ActivityId } from "@/features/workbench/ActivityRail";
import { DatabaseTree } from "@/features/workbench/DatabaseTree";
import { FavoritesPanel } from "@/features/workbench/FavoritesPanel";
import { FileExplorer } from "@/features/workbench/FileExplorer";
import { GitPanel } from "@/features/workbench/GitPanel";
import { ObjectSearch } from "@/features/workbench/ObjectSearch";
import { Visualizer } from "@/features/workbench/Visualizer";
import { buildConnectionNodes, type TreeNode } from "@/features/workbench/tree-model";
import type { Favorite } from "@/lib/favorites";
import { ipc, type ConnectionProfile, type PersonalLocalStatus } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import type { ActiveConnection } from "@/state/useConnections";
import { IconButton } from "./IconButton";

// Activities with a simple placeholder panel (databases/files/visualizer have
// their own dedicated panels).
const PLACEHOLDERS: Record<"favorites" | "git" | "marketplace", { icon: IconName; title: string; body: string }> = {
  favorites: { icon: "favorites", title: "Favorites", body: "Star tables, queries, and connections for quick access." },
  git: { icon: "git", title: "Git", body: "Version your saved SQL scripts alongside your project." },
  marketplace: { icon: "marketplace", title: "Marketplace", body: "Browse virtual-schema adapters, drivers, and extensions." },
};

/** A single open connection: header (focus + actions) with its object tree. */
function ConnectionSection({
  connection,
  focused,
  live,
  accent,
  treeKey,
  collapsed,
  onToggleCollapse,
  onFocus,
  onOpenObject,
  onRefresh,
  onDisconnect,
  onRemove,
  onOpenView,
  onNewVs,
  onUploadDriver,
  onContext,
  onOpenDetails,
}: {
  connection: ActiveConnection;
  focused: boolean;
  /** Server reachability: true = up, false = down, undefined = probing. */
  live?: boolean;
  /** Connection accent color (Properties → Color and Border). */
  accent?: string;
  treeKey: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onFocus: () => void;
  onOpenObject: (schema: string, name: string) => void;
  onRefresh: () => void;
  onDisconnect: () => void;
  onRemove: () => void;
  onOpenView: (view: "dbInfo" | "dataTypes" | "dba" | "connInfo" | "connProps" | "logs" | "bucketfs" | "backups" | "health") => void;
  onNewVs: () => void;
  onUploadDriver: () => void;
  onContext?: (node: import("@/features/workbench/tree-model").TreeNode, x: number, y: number) => void;
  onOpenDetails?: (node: import("@/features/workbench/tree-model").TreeNode) => void;
}) {
  // Stable across refreshes: a refresh reloads IN PLACE via refreshSignal, so
  // roots must NOT change identity (that would remount/flicker the tree).
  const roots = useMemo(
    () => buildConnectionNodes(connection.profile.id),
    [connection.profile.id],
  );
  // Bumped to collapse every expanded node in this connection's tree.
  const [collapseSignal, setCollapseSignal] = useState(0);

  return (
    <div className="min-w-0">
      <div
        className={cn(
          "group relative flex h-8 items-center gap-1.5 pr-1 pl-1.5 transition-colors",
          focused ? "bg-secondary/60" : "hover:bg-secondary/30",
        )}
      >
        {accent ? <span className="absolute inset-y-0 left-0 w-0.5" style={{ backgroundColor: accent }} /> : null}
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
          {/* Status dot = liveness, not focus: solid green while the server
              answers, red if a connected server stops responding. */}
          <span
            title={live === false ? "Server not responding" : "Connected — server is up"}
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              live === false
                ? "bg-destructive shadow-[0_0_6px_var(--destructive)]"
                : "bg-emerald-500 shadow-[0_0_6px_#10b981]",
            )}
          />
          <Database className={cn("h-3.5 w-3.5 shrink-0", !accent && (focused ? "text-primary" : "text-muted-foreground"))} style={accent ? { color: accent } : undefined} />
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
              <DropdownMenuItem onClick={() => onOpenView("connProps")}>
                <Settings2 className="h-3.5 w-3.5" /> Properties
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
              {/* Same icons as the tabs they open (TAB_ICON) — never mix marks. */}
              <DropdownMenuItem onClick={() => onOpenView("health")}>
                <Icon name="heart" className="h-3.5 w-3.5" /> Health
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onOpenView("logs")}>
                <Icon name="list" className="h-3.5 w-3.5" /> Logs
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onOpenView("backups")}>
                <Icon name="database" className="h-3.5 w-3.5" /> Backups
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onOpenView("bucketfs")}>
                <Icon name="folder-open" className="h-3.5 w-3.5" /> BucketFS
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onNewVs}>
                <Waypoints className="h-3.5 w-3.5" /> New virtual schema
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onUploadDriver}>
                <HardDriveUpload className="h-3.5 w-3.5" /> Upload driver to BucketFS
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDisconnect()}>
                <Unplug className="h-3.5 w-3.5" /> Disconnect
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onRemove()} className="text-destructive focus:text-destructive">
                <Trash2 className="h-3.5 w-3.5" /> Remove connection
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {!collapsed ? (
        <DatabaseTree
          roots={roots}
          onOpenObject={onOpenObject}
          onOpenDetails={onOpenDetails}
          onContext={onContext}
          initialExpandedItems={["schemas"]}
          collapseSignal={collapseSignal}
          refreshSignal={treeKey}
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
          <Icon name="visualizer" className="h-5 w-5" />
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
              <Icon name="visualizer" className="h-3.5 w-3.5 shrink-0 text-[#a78bfa]" />
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

export function Sidebar({
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
  onRemoveConnection,
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
  onRemoveConnection: (profileId: string) => void;
  onRefreshConnection: (profileId: string) => void;
  onOpenView: (profileId: string, view: "dbInfo" | "dataTypes" | "dba" | "connInfo" | "connProps" | "logs" | "bucketfs" | "backups" | "health") => void;
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
  // Server reachability per profile id (TCP ping, refreshed every 20s):
  // green dot = server up, red = a live connection whose server went away,
  // grey = saved server that is not running. `undefined` = not probed yet.
  const [reachable, setReachable] = useState<Record<string, boolean>>({});
  // Connection accent colors (Properties → Color and Border → show in name).
  const [accents, setAccents] = useState<Record<string, string>>({});
  useEffect(() => {
    let dead = false;
    // One loader, used for the initial read and the settings-changed refresh;
    // profiles are read in parallel (settingsSet awaits its write before the
    // event fires, so no delay is needed before re-reading).
    const load = async () => {
      const pairs = await Promise.all(
        profiles.map(async (p) => {
          const raw = (await ipc.connectionSettingsGet(p.id).catch(() => null)) as
            | { color?: { accent?: string | null; showInName?: boolean } }
            | null;
          return raw?.color?.accent && raw.color.showInName !== false
            ? ([p.id, raw.color.accent] as const)
            : null;
        }),
      );
      if (!dead) setAccents(Object.fromEntries(pairs.filter((x): x is readonly [string, string] => x !== null)));
    };
    void load();
    const bump = () => void load();
    window.addEventListener("studio:conn-settings-changed", bump);
    return () => {
      dead = true;
      window.removeEventListener("studio:conn-settings-changed", bump);
    };
  }, [profiles]);
  const pingTargets = useMemo(
    () =>
      [
        ...connections.map((c) => ({ id: c.profile.id, host: c.profile.host, port: c.profile.port })),
        ...profiles
          .filter((p) => !connections.some((c) => c.profile.id === p.id) && !p.username.startsWith("STUDIO_MCP_"))
          .map((p) => ({ id: p.id, host: p.host, port: p.port })),
      ],
    [connections, profiles],
  );
  useEffect(() => {
    let cancelled = false;
    const probe = () => {
      for (const t of pingTargets) {
        ipc
          .pingServer(t.host, t.port)
          .then((r) => {
            if (!cancelled) setReachable((prev) => (prev[t.id] === r.reachable ? prev : { ...prev, [t.id]: r.reachable }));
          })
          .catch(() => {
            if (!cancelled) setReachable((prev) => (prev[t.id] === false ? prev : { ...prev, [t.id]: false }));
          });
      }
    };
    probe();
    const timer = window.setInterval(probe, 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pingTargets]);
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
          <div key={p.id} className="group relative flex items-center">
          <button
            data-agent-id={`sidebar.saved.${p.id}`}
            onClick={() => onConnectProfile(p.id)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-secondary/60"
            title={`Connect to ${p.name} (${p.host}:${p.port})`}
          >
            <span
              title={reachable[p.id] ? "Server is running — not connected" : "Server not running"}
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                reachable[p.id] ? "bg-emerald-500/80" : "border border-muted-foreground/50 bg-transparent",
              )}
            />
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
          <button
            onClick={(e) => { e.stopPropagation(); onRemoveConnection(p.id); }}
            title={`Remove ${p.name}`}
            aria-label={`Remove ${p.name}`}
            className="absolute right-1 hidden h-6 w-6 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-secondary hover:text-destructive group-hover:flex"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          </div>
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
          ? "Schema visualizer"
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
              return (
                <>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground">
                    <Icon name={P.icon} className="h-5 w-5" />
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
              live={reachable[conn.profile.id]}
              accent={accents[conn.profile.id]}
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
              onRemove={() => onRemoveConnection(conn.profile.id)}
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
