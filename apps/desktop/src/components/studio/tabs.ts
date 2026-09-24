/**
 * Workspace-tab model for the studio shell: the tab union, its per-view state,
 * groups, and the constants that go with them.
 *
 * Extracted from ExasolStudio.tsx so the shell and the panels it renders can
 * share one definition instead of the shell owning the type everything else
 * needs.
 */
import type { IconName } from "@/components/ui/icon";
import type { ObjectRef } from "@/features/workbench/ObjectDetailPanel";
import type { Plan } from "@/lib/plan-model";
import type { ExecuteResponse } from "@/lib/ipc";

export const MAX_ROWS_OPTIONS = [100, 1000, 10000, 50000, 100000];

/** A workspace tab is a SQL editor, a read-only catalog surface, or the
 * connect-to-database flow (so adding a connection doesn't hide your queries). */
export type TabView =
  | "sql"
  | "connect"
  | "visualizer"
  | "filePreview"
  | "marketplace"
  | "guides"
  | "docs"
  | "object"
  | "dba"
  | "welcome"
  | "artifact"
  | "mcpConfig"
  | "git"
  | "notebook"
  | "dashboard"
  | "skills"
  | "connProps"
  | "plan"
  | "logs"
  | "bucketfs"
  | "backups"
  | "health"
  | "exaEngine"
  /** Attach another database or bucket as a virtual schema (the add-data-source flow). */
  | "addSource";

/** Which sub-view the result panel shows for a tab. Per-tab (not global) so an
 *  async profile that finishes after a tab-switch can't flip another tab's
 *  view — and each tab remembers where the user left it. */
export type ResultView = "results" | "performance" | "dashboard";

export type SqlTab = {
  id: string;
  title: string;
  view: TabView;
  /** For "docs" tabs — deep link below /docs/studio (e.g. "connections/drivers"). */
  docsPath?: string;
  /** For "dashboard" tabs — which saved dashboard this tab shows (default "default"). */
  dashboardId?: string;
  /** Result panel sub-view (defaults to "results" when unset). */
  resultView?: ResultView;
  /** For "connect" tabs — pre-fill the new-connection form (e.g. the bundled
   *  Exasol Personal profile when a direct connect fell back to the form). */
  connectDraft?: Partial<{ name: string; notes: string; host: string; port: string; schema: string; username: string; sslMode: string; compression: boolean; driverId: string }>;
  sql: string;
  response: ExecuteResponse | null;
  execError: string | null;
  pinned?: boolean;
  /** For filePreview tabs — the local file path being previewed. */
  filePath?: string;
  /** Buffer content at the last save/open — dirty = sql !== savedSql. */
  savedSql?: string;
  /** True when this tab's backing file was deleted on disk (title struck out). */
  fileMissing?: boolean;
  /** Membership in a collapsible tab group (see TabGroup). */
  groupId?: string;
  /** For mcpConfig tabs — which connector preset to configure. */
  mcpPreset?: string;
  /** For mcpConfig tabs — whose MCP registry: Studio's agent or the Exa engine. */
  mcpTarget?: "studio" | "exa";
  /** For object tabs — the database object being inspected. */
  objectRef?: ObjectRef;
  /** For object tabs — the owning connection. */
  objectProfileId?: string;
  /** For object tabs — deep-link to a sub-tab (info/columns/keys) and edit mode.
   *  Nonce forces the panel to re-apply even when the tab already exists. */
  objNavTab?: string;
  objNavEdit?: boolean;
  objNavNonce?: number;
  /** Execution lifecycle for the status strip (started/running/completed).
   *  `sql` is the exact statement(s) this run executed (may be a selection or
   *  the cursor statement, not the whole buffer) — shown while it runs. */
  runMeta?: { startedAt: number; finishedAt?: number; scope: string; ok?: boolean; sql?: string };
  /** For artifact tabs — the rendered HTML document. */
  artifactHtml?: string;
  /** Query Performance — the normalized execution plan for this tab's query. */
  planData?: Plan[];
  /** Why the last profile attempt produced no plan — shown in the empty state. */
  profileNote?: string;
  /** Selected statement in Query Performance (-1 = All statements overview). */
  planIdx?: number;
  /** Captured on Run: the session + pre-run statement id, so the plan can be
   *  read from the ORIGINAL profiled run without re-executing the query. */
  profileSession?: string;
  profileBaseStmt?: string;
  /** Result pagination (0-based) for single-SELECT tabs. */
  resultPage?: number;
  /** For the unified connection tab — which section to show; nonce re-applies
   *  it when the tab is already open. */
  connSection?: import("@/features/connection/ConnectionPropertiesTab").ConnectionSection;
  connSectionNonce?: number;
  /** Live engine progress for the running batch (issues #19/#20). */
  queryProgress?: {
    statement?: number;
    total?: number;
    activity?: string | null;
    percent?: number | null;
    elapsedMs: number;
    finished: boolean;
  };
};

/** A collapsible group of query/view tabs shown as one chip in the tab strip. */
export type TabGroup = { id: string; name: string; collapsed: boolean };

export function newTab(index: number): SqlTab {
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

export const TAB_ICON: Record<TabView, IconName> = {
  sql: "querytab",
  dba: "shield",
  connect: "plug",
  visualizer: "visualizer",
  filePreview: "table",
  mcpConfig: "mcp",
  marketplace: "extension",
  guides: "guides",
  docs: "guides",
  object: "table",
  connProps: "sliders",
  welcome: "home",
  artifact: "file",
  git: "git",
  notebook: "notebook",
  dashboard: "dashboard-grid",
  skills: "skills",
  plan: "clock-dashed-half",
  logs: "list",
  bucketfs: "folder-open",
  backups: "database",
  health: "heart",
  exaEngine: "brain-circuit",
  addSource: "link",
};

/** Shown when a connection bucket has no open tabs (VS Code-style start page). */
export const WELCOME_TAB: SqlTab = {
  id: "__welcome__",
  title: "Welcome",
  view: "welcome",
  sql: "",
  response: null,
  execError: null,
};

/** Sentinel key for the not-connected tab bucket. */
export const NO_CONNECTION = "__none__";

/** The SQL a fresh first tab is seeded with, so an untouched one is known. */
const STARTER_SQL = newTab(1).sql;

/**
 * Has anything been done in this tab worth carrying to a connection?
 *
 * A tab opened and never touched is not work: adopting it would pile empty
 * Untitled tabs onto every connect. A tab whose SQL was edited, or which is
 * anything other than a plain SQL tab, is.
 */
export function tabHasWork(tab: SqlTab): boolean {
  if (tab.view !== "sql") return true;
  const sql = tab.sql.trim();
  if (!sql) return false;
  return sql !== STARTER_SQL.trim();
}

/**
 * The tabs a connection should show once it opens.
 *
 * Everything written before connecting lives under the not-connected key, and
 * used to simply stop being shown the moment a connection came up — a buffer
 * full of half-written queries, apparently gone. It is carried over instead:
 * the connection's own tabs first, then whatever was drafted while
 * disconnected, minus the untouched ones.
 */
export function adoptPendingTabs(existing: readonly SqlTab[], pending: readonly SqlTab[]): SqlTab[] {
  const byId = new Map(existing.map((t) => [t.id, t]));
  const taken = new Set(byId.keys());
  const carried: SqlTab[] = [];
  for (const tab of pending) {
    if (!tabHasWork(tab)) continue;
    // The connection may already be showing this very tab — same id, same
    // text — and then there is nothing to carry.
    const clash = byId.get(tab.id);
    if (clash && clash.sql === tab.sql) continue;
    // A DIFFERENT tab with the same id is an id collision, not the same tab:
    // ids are clock-derived, so two lists built in the same millisecond can
    // produce one. Dropping it would throw away the SQL this function exists
    // to rescue, so it is given a fresh id instead.
    let id = tab.id;
    for (let n = 2; taken.has(id); n++) id = `${tab.id}-${n}`;
    taken.add(id);
    carried.push(id === tab.id ? tab : { ...tab, id });
  }
  return [...existing, ...carried];
}
