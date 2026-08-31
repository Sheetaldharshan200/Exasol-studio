/**
 * Persist the open workspace (tabs, groups, and the active tab per connection)
 * to localStorage so it survives an app restart — most importantly the restart
 * that applies an in-app update. WKWebView localStorage lives on disk and is
 * kept across a relaunch, so restoring is just "read it back on mount".
 *
 * What we keep is a tab's IDENTITY and editor content (its SQL, which object /
 * dashboard it shows, its group). What we drop is everything transient or
 * heavy — query results, execution status, live progress, rendered artifact
 * HTML — because it re-runs on demand and results can be large. The pure
 * serialize/deserialize below is unit-tested; the thin localStorage wrappers
 * are not (they only touch `window`).
 */
import type { SqlTab, TabGroup, TabView } from "@/components/studio/tabs";

export type WorkspaceState = {
  tabsByConn: Record<string, SqlTab[]>;
  groupsByConn: Record<string, TabGroup[]>;
  activeIdByConn: Record<string, string>;
};

const KEY = "exasol-studio-workspace";
const VERSION = 1;

/** Views worth reopening. Ephemeral surfaces (connect form, welcome, the
 *  marketplace/guides/settings panels) and artifact tabs (which need their
 *  dropped HTML) are not restored. */
const PERSISTABLE_VIEWS: ReadonlySet<TabView> = new Set<TabView>([
  "sql",
  "object",
  "bi",
  "dashboard",
  "connProps",
  "filePreview",
  "notebook",
  "git",
  "logs",
  "bucketfs",
  "backups",
  "health",
  "exaEngine",
]);

/** A tab's fields worth carrying across a restart. Anything not listed is
 *  dropped, so a new heavy field can never silently bloat storage. */
const KEEP: readonly (keyof SqlTab)[] = [
  "id",
  "title",
  "view",
  "resultView",
  "dashboardId",
  "connectDraft",
  "sql",
  "pinned",
  "filePath",
  "fileMissing",
  "groupId",
  "mcpPreset",
  "objectRef",
  "objectProfileId",
  "objNavTab",
  "resultPage",
  "connSection",
  "profileSession",
  "profileBaseStmt",
];

/** Strip a tab down to its persistable identity/content fields. */
function lightTab(tab: SqlTab): SqlTab {
  const out: Record<string, unknown> = {};
  for (const k of KEEP) if (tab[k] !== undefined) out[k] = tab[k];
  return out as unknown as SqlTab;
}

/** A restored tab needs the required runtime fields reset to a clean state. */
function reviveTab(raw: unknown): SqlTab | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Partial<SqlTab>;
  if (typeof t.id !== "string" || typeof t.title !== "string" || typeof t.view !== "string") return null;
  if (!PERSISTABLE_VIEWS.has(t.view)) return null;
  // A tab whose view needs identity fields to render must carry them, or it
  // would fall through to the generic Visualizer on restore. Drop it instead.
  if (t.view === "dashboard" && typeof t.dashboardId !== "string") return null;
  if (t.view === "object" && (!t.objectRef || typeof t.objectProfileId !== "string")) return null;
  if (t.view === "filePreview" && typeof t.filePath !== "string") return null;
  return {
    ...lightTab(t as SqlTab),
    id: t.id,
    title: t.title,
    view: t.view,
    sql: typeof t.sql === "string" ? t.sql : "",
    response: null,
    execError: null,
  };
}

export function serializeWorkspace(state: WorkspaceState): string {
  const tabsByConn: Record<string, SqlTab[]> = {};
  for (const [key, list] of Object.entries(state.tabsByConn)) {
    const light = list.filter((t) => PERSISTABLE_VIEWS.has(t.view)).map(lightTab);
    if (light.length) tabsByConn[key] = light;
  }
  // Only keep groups/active entries for connections that still have tabs.
  const groupsByConn: Record<string, TabGroup[]> = {};
  for (const key of Object.keys(tabsByConn)) {
    if (Array.isArray(state.groupsByConn[key]) && state.groupsByConn[key].length) {
      groupsByConn[key] = state.groupsByConn[key];
    }
  }
  const activeIdByConn: Record<string, string> = {};
  for (const key of Object.keys(tabsByConn)) {
    const active = state.activeIdByConn[key];
    if (active && tabsByConn[key].some((t) => t.id === active)) activeIdByConn[key] = active;
  }
  return JSON.stringify({ v: VERSION, tabsByConn, groupsByConn, activeIdByConn });
}

export function deserializeWorkspace(raw: string | null | undefined): WorkspaceState | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as { v?: unknown; tabsByConn?: unknown; groupsByConn?: unknown; activeIdByConn?: unknown };
  if (p.v !== VERSION) return null;

  const tabsByConn: Record<string, SqlTab[]> = {};
  const rawTabs = (p.tabsByConn ?? {}) as Record<string, unknown>;
  for (const [key, list] of Object.entries(rawTabs)) {
    if (!Array.isArray(list)) continue;
    const restored = list.map(reviveTab).filter((t): t is SqlTab => t !== null);
    if (restored.length) tabsByConn[key] = restored;
  }

  const groupsByConn: Record<string, TabGroup[]> = {};
  const rawGroups = (p.groupsByConn ?? {}) as Record<string, unknown>;
  for (const [key, groups] of Object.entries(rawGroups)) {
    if (tabsByConn[key] && Array.isArray(groups)) groupsByConn[key] = groups as TabGroup[];
  }

  const activeIdByConn: Record<string, string> = {};
  const rawActive = (p.activeIdByConn ?? {}) as Record<string, unknown>;
  for (const [key, id] of Object.entries(rawActive)) {
    if (typeof id === "string" && tabsByConn[key]?.some((t) => t.id === id)) activeIdByConn[key] = id;
  }

  return { tabsByConn, groupsByConn, activeIdByConn };
}

/** Read the persisted workspace (null when absent, corrupt, or off-window). */
export function loadWorkspace(): WorkspaceState | null {
  if (typeof window === "undefined") return null;
  try {
    return deserializeWorkspace(window.localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

/** Write the workspace; swallows quota/serialization errors. */
export function saveWorkspace(state: WorkspaceState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, serializeWorkspace(state));
  } catch {
    /* localStorage full or unavailable — persistence is best-effort */
  }
}
