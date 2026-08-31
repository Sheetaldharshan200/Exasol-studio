/**
 * Workspace-tab model for the studio shell: the tab union, its per-view state,
 * groups, and the constants that go with them.
 *
 * Extracted from ExasolStudio.tsx so the shell and the panels it renders can
 * share one definition instead of the shell owning the type everything else
 * needs.
 */
import { type IconName } from "@/components/ui/icon";
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
  | "skills"
  | "connProps"
  | "plan"
  | "logs"
  | "bucketfs"
  | "backups"
  | "health"
  | "exaEngine";

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
  mcpConfig: "plug",
  marketplace: "marketplace",
  guides: "guides",
  docs: "guides",
  object: "table",
  connProps: "sliders",
  welcome: "home",
  artifact: "file",
  git: "git",
  notebook: "notebook",
  skills: "skills",
  plan: "clock-dashed-half",
  logs: "list",
  bucketfs: "folder-open",
  backups: "database",
  health: "heart",
  exaEngine: "brain-circuit",
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
