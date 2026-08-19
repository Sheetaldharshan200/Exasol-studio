/**
 * Typed IPC layer between the React frontend and the Tauri/Rust backend.
 * When running in a plain browser (design preview via `pnpm dev`), a mock
 * backend with representative Exasol data is used instead.
 */
import { invoke } from "@tauri-apps/api/core";
import { mockInvoke } from "@/lib/ipc-mock";

export type DriverInfo = {
  id: string;
  name: string;
  protocol: string;
  description: string;
  defaultPort: number;
  kind: "native" | "external";
  isDefault: boolean;
  docsUrl: string;
};

export type ConnectionProfile = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  schema?: string | null;
  notes?: string | null;
  sslMode: string;
  compression: boolean;
  driverId: string;
  createdAt?: string | null;
  lastUsedAt?: string | null;
};

export type PingResult = {
  reachable: boolean;
  latencyMs: number;
  error: string | null;
};

export type ServerInfo = {
  databaseName: string | null;
  version: string | null;
  currentUser: string;
  currentSchema: string | null;
  sessionId: string;
  nodes: number | null;
};

export type SchemaSummary = {
  name: string;
  owner: string | null;
  comment: string | null;
  isVirtual: boolean;
  adapterScript: string | null;
};

export type DatabaseOverview = {
  schemas: SchemaSummary[];
  systemSchemas: string[];
};

export type GitFile = {
  code: string;
  path: string;
  label: string;
  staged: boolean;
};

export type GitStatus = {
  hasGit: boolean;
  isRepo: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  files: GitFile[];
  dir: string;
};

export type GitLogEntry = {
  hash: string;
  subject: string;
  author: string;
  relative: string;
};

export type GitBranches = {
  current: string;
  local: string[];
  remote: string[];
};

export type GitCommit = {
  hash: string;
  short: string;
  parents: string[];
  refs: string;
  subject: string;
  author: string;
  relative: string;
};

export type ScriptInfo = {
  name: string;
  scriptType: "UDF" | "SCRIPTING" | "ADAPTER" | "PREPROCESSOR" | string;
  language: string | null;
  inputType: string | null;
  resultType: string | null;
  comment: string | null;
};

export type SchemaObjects = {
  tables: { name: string; owner: string | null; rowCount: number | null; comment: string | null }[];
  views: { name: string; owner: string | null; comment: string | null }[];
  functions: { name: string; owner: string | null; comment: string | null }[];
  scripts: ScriptInfo[];
};

export type ColumnInfo = {
  name: string;
  dataType: string;
  nullable?: boolean | null;
  default?: string | null;
  identity?: string | number | null;
  isDistributionKey?: boolean | null;
  comment: string | null;
};

export type ConstraintInfo = {
  name: string;
  constraintType: "PRIMARY KEY" | "FOREIGN KEY" | "NOT NULL" | string;
  enabled: boolean | string | null;
  columns: {
    column: string;
    referencedSchema: string | null;
    referencedTable: string | null;
    referencedColumn: string | null;
  }[];
};

export type TableDetails = {
  columns: ColumnInfo[];
  constraints: ConstraintInfo[];
};

export type SystemObjects = {
  objects: { name: string; objectType: string | null; comment: string | null }[];
};

export type DbaOverview = {
  users: { name: string; created: string | null; consumerGroup: string | null; comment: string | null }[];
  roles: { name: string; created: string | null; consumerGroup: string | null; comment: string | null }[];
  consumerGroups: {
    name: string;
    cpuWeight: number | null;
    precedence: number | null;
    queryTimeout: number | null;
    idleTimeout: number | null;
  }[];
  connections: {
    name: string;
    connectionString: string | null;
    userName: string | null;
    created: string | null;
    comment: string | null;
  }[];
  sessions: {
    sessionId: string;
    userName: string | null;
    status: string | null;
    command: string | null;
    duration: string | null;
    loginTime: string | null;
    client: string | null;
    driver: string | null;
    host: string | null;
    osUser: string | null;
  }[];
  dbSize: {
    measureTime: string | null;
    rawObjectSize: number | string | null;
    memObjectSize: number | string | null;
    auxiliarySize: number | string | null;
    statisticsSize: number | string | null;
    recommendedDbRamSize: number | string | null;
  } | null;
};

export type UserDetails = {
  info: { name: string; value: string | null }[];
  roles: (string | null)[];
  systemPrivileges: (string | null)[];
  objectPrivileges: { schema: string | null; object: string | null; privilege: string | null }[];
  ownedSchemas: (string | null)[];
};

export type ObjectGrant = { grantor: string | null; grantee: string | null; privilege: string | null; object: string | null };
export type ObjectSize = {
  rawSize: number | string | null;
  memSize: number | string | null;
  created: string | null;
  lastCommit: string | null;
  rowCount: number | string | null;
};

export type DatabaseInfo = {
  metadata: { name: string; value: string | null }[];
  parameters: { name: string; sessionValue: string | null; systemValue: string | null }[];
};


export type SearchHitKind = "SCHEMA" | "TABLE" | "VIEW" | "COLUMN" | "SCRIPT" | "FUNCTION";

export type SearchHit = {
  objectType: SearchHitKind | string;
  schema: string | null;
  /** Object name (or column name for COLUMN hits). */
  name: string;
  /** For a COLUMN hit, the owning table/view. */
  container: string | null;
  /** Extra context — data type, row count, script type, … */
  detail: string | null;
  /** True when double-clicking should build a SELECT (tables/views). */
  selectable: boolean;
};

export type MarketEnv = { os: string; arch: string; docker: boolean; podman: boolean };
export type PersonalLocalStatus = {
  state: "idle" | "installing" | "ready" | "failed" | "stopped";
  step: string;
  message: string;
  localReady: boolean;
  profileId: string | null;
  components: Record<string, {
    state: "unavailable" | "waiting" | "installing" | "ready" | "failed";
    version: string | null;
    error: string | null;
    connectionId: string | null;
  }>;
  semanticViews: {
    state: "unavailable" | "waiting" | "installing" | "ready" | "failed";
    version: string | null;
    error: string | null;
    connectionId: string | null;
  };
  updatedAt: string;
};
/** A managed component and whether an independent update overrides the verified pin. */
export type ComponentInfo = {
  id: string;
  name: string;
  /** GitHub repo (owner/name) — the UI reads its latest release for "available". */
  repo: string;
  /** Currently-running version (own-env install if present, else verified). */
  installed: string | null;
  /** Studio's pinned, known-good baseline. */
  verified: string;
  /** True when an independent install currently overrides the verified stack. */
  onOwnEnv: boolean;
  /** A maintenance operation (backup / engine update) is in flight. */
  busy: boolean;
  /** Whether one-click independent update/revert is available for it yet. */
  updatable: boolean;
  /** pip/uv-managed (index-hash-verified) → can update to any upstream version.
   *  False = binary (verify-or-refuse: only the SHA-pinned verified build). */
  pipManaged: boolean;
  /** Version is an opaque revision (not orderable semver) — compare by
   *  inequality; "update" reconciles to the verified revision (Semantic Views). */
  opaqueVersion: boolean;
};

/** A provider Studio can push the Exasol skills into (Skills Marketplace). */
export type SkillTarget = {
  id: string;
  name: string;
  /** The provider's own install tooling is available on this machine. */
  installed: boolean;
  /** Where to get the provider when it isn't installed. */
  installUrl: string;
};

export type ReleaseAsset = { name: string; url: string; size: number };
export type Release = {
  tag: string | null;
  name: string | null;
  publishedAt: string | null;
  htmlUrl: string | null;
  assets: ReleaseAsset[];
} | null;
export type InstalledItem = { id: string; version: string; path: string; filename: string; note?: string };

export type CatalogEntry = {
  repo: string;
  latest: string | null;
  homepage: string;
};
export type MarketCatalog = {
  generatedAt: string | null;
  mirrorRepo: string;
  items: Record<string, CatalogEntry>;
};

export type AiClientStatus = {
  id: string;
  name: string;
  detected: boolean;
  connected: boolean;
  configPath: string;
  auto: boolean;
};

export type VsPrereqs = {
  adapters: { schema: string; name: string }[];
  connections: string[];
};

export type GraphColumn = { name: string; dataType: string; pk: boolean };
export type GraphTable = { name: string; columns: GraphColumn[] };
export type GraphLink = {
  source: string;
  sourceColumn: string;
  target: string;
  targetColumn: string;
};
export type SchemaGraph = { tables: GraphTable[]; links: GraphLink[] };

export type FsEntry = {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: string | null;
  ext: string | null;
};

export type TablePreview = {
  columns: string[];
  rows: string[][];
  truncated: boolean;
  format: string;
};

export type ColumnMeta = { name: string; typeName: string };

export type StatementResult = {
  statement: string;
  kind: "resultSet" | "rowCount";
  columns: ColumnMeta[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  elapsedMs: number;
  error: string | null;
};

export type ExecuteResponse = {
  results: StatementResult[];
  totalElapsedMs: number;
  success: boolean;
  /** Session that ran this batch + the statement id just before it — lets Query
   *  Performance read the profile of this original run without re-executing.
   *  Absent for bridge-driver connections. */
  profileSession?: string;
  profileBaseStmt?: string;
};

export type HistoryEntry = {
  id: string;
  executedAt: string;
  profileId: string;
  connectionName: string;
  sql: string;
  statementCount: number;
  elapsedMs: number;
  /** Query execution time (until the server answered); null on old entries. */
  execMs?: number | null;
  /** Row-streaming time after execution; null on old entries. */
  fetchMs?: number | null;
  /** True when the row cap was hit (the query matched MORE than rowCount). */
  truncated?: boolean | null;
  success: boolean;
  error: string | null;
  rowCount: number;
};


export type AppErrorPayload = { kind: string; message: string };

/** Result of a Studio logical backup (backup_now). */
export type BackupRunResult = { dir: string; tables: number; rows: number; skipped: string[]; elapsedMs: number };

/** Admin API (ConfD) session state — deliberately password-free. */
export type AdminApiStatus = { connected: boolean; host?: string | null; port?: number | null; user?: string | null };

/** Exa engine install state (opencode component). */
export type EngineInstallStatus = { installed: boolean; version?: string | null; binaryPath?: string | null };

export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ── One codebase, every platform ────────────────────────────────────────────
// The SAME build runs as the desktop app (Tauri), on the web, and — via Tauri
// Mobile — on phones later. Only the transport differs, resolved here in ONE
// place, in order:
//   1. Tauri IPC        — desktop/mobile shells (native Rust backend)
//   2. Hosted backend   — the server that served this page, or an explicit
//                         VITE_BACKEND_URL: POST /ipc/<command>
//   3. Built-in mock    — demo only, and only when asked for
//
// Same-origin is the default because the usual case is a backend that serves
// this bundle itself (`exa web`). Defaulting to the mock instead meant a build
// hosted by a working backend still showed invented data, which is
// indistinguishable from the real thing until someone trusts a number.
const EXPLICIT_BACKEND = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.replace(/\/$/, "");
const USE_MOCK = import.meta.env.VITE_USE_MOCK_BACKEND === "true";
const BACKEND_URL = USE_MOCK ? undefined : (EXPLICIT_BACKEND ?? "");

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    return invoke<T>(command, args);
  }
  if (BACKEND_URL !== undefined) {
    const res = await fetch(`${BACKEND_URL}/ipc/${command}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(args ?? {}),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(detail || `backend ${res.status}`);
    }
    return (await res.json()) as T;
  }
  return mockInvoke(command, args) as Promise<T>;
}

export function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as AppErrorPayload).message);
  }
  return "Something went wrong.";
}

export const ipc = {
  listDrivers: () => call<DriverInfo[]>("list_drivers"),
  listConnectionProfiles: () => call<ConnectionProfile[]>("list_connection_profiles"),
  saveConnectionProfile: (profile: Omit<ConnectionProfile, "id"> & { id?: string }) =>
    call<ConnectionProfile>("save_connection_profile", { profile: { id: "", ...profile } }),
  deleteConnectionProfile: (profileId: string) =>
    call<void>("delete_connection_profile", { profileId }),
  pingServer: (host: string, port: number) =>
    call<PingResult>("ping_server", { host, port }),
  testConnection: (profile: Omit<ConnectionProfile, "id"> & { id?: string }) =>
    call<ServerInfo>("test_connection", { profile: { id: "", ...profile } }),
  connect: (profileId: string) => call<ServerInfo>("connect", { profileId }),
  disconnect: (profileId: string) => call<void>("disconnect", { profileId }),
  listOpenConnections: () => call<string[]>("list_open_connections"),
  getDatabaseOverview: (profileId: string) =>
    call<DatabaseOverview>("get_database_overview", { profileId }),
  listSchemaObjects: (profileId: string, schema: string) =>
    call<SchemaObjects>("list_schema_objects", { profileId, schema }),
  getTableDetails: (profileId: string, schema: string, table: string) =>
    call<TableDetails>("get_table_details", { profileId, schema, table }),
  listSystemObjects: (profileId: string, schema: string) =>
    call<SystemObjects>("list_system_objects", { profileId, schema }),
  listSystemColumns: (profileId: string, schema: string, object: string) =>
    call<{ columns: ColumnInfo[] }>("list_system_columns", { profileId, schema, object }),
  getDbaOverview: (profileId: string) => call<DbaOverview>("get_dba_overview", { profileId }),
  getUserDetails: (profileId: string, user: string) =>
    call<UserDetails>("get_user_details", { profileId, user }),
  getObjectGrants: (profileId: string, schema: string, object?: string) =>
    call<ObjectGrant[]>("get_object_grants", { profileId, schema, object }),
  getObjectSize: (profileId: string, schema: string, object?: string) =>
    call<ObjectSize>("get_object_size", { profileId, schema, object }),
  getDatabaseInfo: (profileId: string) => call<DatabaseInfo>("get_database_info", { profileId }),
  searchObjects: (profileId: string, query: string, limit?: number) =>
    call<{ results: SearchHit[] }>("search_objects", { profileId, query, limit }),
  getSchemaGraph: (profileId: string, schema: string) =>
    call<SchemaGraph>("get_schema_graph", { profileId, schema }),
  listVsPrereqs: (profileId: string) => call<VsPrereqs>("list_vs_prereqs", { profileId }),
  marketEnv: () => call<MarketEnv>("market_env"),
  marketCatalog: () => call<MarketCatalog | null>("market_catalog"),
  marketDoc: (repo: string) => call<string | null>("market_doc", { repo }),
  marketDocSave: (id: string, content: string) => call<void>("market_doc_save", { id, content }),
  marketDocLoad: (id: string) => call<string | null>("market_doc_load", { id }),
  marketDocForget: (id: string) => call<void>("market_doc_forget", { id }),
  marketRelease: (repo: string) => call<Release>("market_release", { repo }),
  marketInstalled: () => call<InstalledItem[]>("market_installed"),
  marketDetect: () => call<Record<string, boolean>>("market_detect"),
  marketInstall: (id: string, version: string, url: string, filename: string) =>
    call<{ ok: boolean; path: string }>("market_install", { id, version, url, filename }),
  marketInstallRun: (
    id: string,
    version?: string,
    url?: string,
    filename?: string,
  ) => call<{ ok: boolean }>("market_install_run", { id, version, url, filename }),
  marketUninstall: (id: string) => call<void>("market_uninstall", { id }),
  personalLocalBootstrap: () => call<{ started: boolean; reason?: string }>("personal_local_bootstrap"),
  personalLocalStatus: () => call<PersonalLocalStatus>("personal_local_status"),
  // Independent, isolated component management.
  listComponents: () => call<ComponentInfo[]>("list_components"),
  /** Latest OFFICIAL release tag per managed component (best-effort). */
  componentsUpstream: () => call<{ id: string; tag: string }[]>("components_upstream"),
  updateComponent: (id: string, version?: string) => call<void>("update_component", { id, version }),
  revertComponent: (id: string) => call<void>("revert_component", { id }),
  backupLocalDatabase: () => call<string>("backup_local_database"),
  skillsListTargets: () => call<SkillTarget[]>("skills_list_targets"),
  skillsInstallTarget: (target: string) => call<void>("skills_install_target", { target }),
  skillsInstallPersona: (target: string, skills: { id: string; name: string; description: string; body: string }[]) =>
    call<void>("skills_install_persona", { target, skills }),
  skillsInstallOfficial: (target: string, skills: string[]) =>
    call<void>("skills_install_official", { target, skills }),
  skillsFetchOfficial: (skill: string) =>
    call<{ id: string; name: string; description: string; body: string }>("skills_fetch_official", { skill }),
  skillsInstalledOfficial: () => call<Record<string, string[]>>("skills_installed_official"),
  bucketfsList: (host: string, port: number, tls: boolean, bucket: string, readPassword?: string) =>
    call<string[]>("bucketfs_list", { host, port, tls, bucket, readPassword }),
  bucketfsUpload: (args: {
    host: string;
    port: number;
    tls: boolean;
    bucket: string;
    remotePath: string;
    localPath: string;
    writePassword: string;
  }) => call<string>("bucketfs_upload", args),
  bucketfsDownload: (args: {
    host: string;
    port: number;
    tls: boolean;
    bucket: string;
    remotePath: string;
    destPath: string;
    readPassword?: string;
  }) => call<string>("bucketfs_download", args),
  exasolLocalCtl: (action: "status" | "info" | "start" | "stop" | "destroy") =>
    call<{ ok: boolean; code: number }>("exasol_local_ctl", { action }),
  vaultStatus: () =>
    call<{ configured: boolean; unlocked: boolean; recoveryRemaining: number }>("vault_status"),
  vaultSetup: (password: string) => call<string[]>("vault_setup", { password }),
  vaultUnlock: (password: string) => call<boolean>("vault_unlock", { password }),
  vaultLock: () => call<null>("vault_lock"),
  vaultRecover: (code: string, newPassword: string) => call<number>("vault_recover", { code, newPassword }),
  vaultChangePassword: (oldPassword: string, newPassword: string) =>
    call<null>("vault_change_password", { oldPassword, newPassword }),
  vaultRegenerateRecovery: () => call<string[]>("vault_regenerate_recovery"),
  driverOverridesGet: () => call<Record<string, string>>("driver_overrides_get"),
  driverOverrideSet: (driverId: string, path: string | null) =>
    call<Record<string, string>>("driver_override_set", { driverId, path }),
  driverStatus: (driverId: string) =>
    call<{ driverId: string; runtime: string; ready: boolean; supported: boolean; hint: string }>("driver_status", { driverId }),
  driverSetup: (driverId: string) => call<{ ok: boolean }>("driver_setup", { driverId }),

  // External AI clients ↔ the bundled read-only Exasol MCP server.
  listAiClients: () => call<AiClientStatus[]>("list_ai_clients"),
  connectAiClient: (clientId: string) => call<AiClientStatus>("connect_ai_client", { clientId }),
  disconnectAiClient: (clientId: string) => call<AiClientStatus>("disconnect_ai_client", { clientId }),
  aiClientSnippet: (clientId: string) => call<string>("ai_client_snippet", { clientId }),
  aiClientsReady: () => call<{ ready: boolean; reason?: string | null }>("ai_clients_ready"),
  marketDocFile: (repo: string, path: string) => call<string | null>("market_doc_file", { repo, path }),
  openExternal: (url: string) => call<null>("open_external", { url }),
  gitStatus: () => call<GitStatus>("git_status"),
  gitInit: () => call<null>("git_init"),
  gitCommit: (message: string, stageAll?: boolean) => call<string>("git_commit", { message, stageAll }),
  gitLog: (limit?: number) => call<GitLogEntry[]>("git_log", { limit }),
  gitBranches: () => call<GitBranches>("git_branches"),
  gitCheckout: (branch: string) => call<null>("git_checkout", { branch }),
  gitCreateBranch: (name: string) => call<null>("git_create_branch", { name }),
  gitStage: (paths: string[]) => call<null>("git_stage", { paths }),
  gitStageAll: () => call<null>("git_stage_all"),
  gitUnstage: (paths: string[]) => call<null>("git_unstage", { paths }),
  gitDiscard: (paths: string[]) => call<null>("git_discard", { paths }),
  gitDiff: (path: string, staged: boolean) => call<string>("git_diff", { path, staged }),
  gitSetRemote: (url: string) => call<string>("git_set_remote", { url }),
  gitFetch: () => call<string>("git_fetch"),
  gitPull: () => call<string>("git_pull"),
  gitPush: () => call<string>("git_push"),
  gitGraph: (limit?: number) => call<GitCommit[]>("git_graph", { limit }),
  marketDirPath: () => call<string>("market_dir_path"),
  fsWorkspaceDir: () => call<FsEntry>("fs_workspace_dir"),
  fsHomeRoots: () => call<FsEntry[]>("fs_home_roots"),
  revealPath: (path: string) => call<void>("reveal_path", { path }),
  writeTextFile: (path: string, contents: string) =>
    call<void>("write_text_file", { path, contents }),
  saveAttachment: (name: string, base64Data: string) =>
    call<string>("save_attachment", { name, base64Data }),
  installCli: () => call<string>("install_cli"),
  fsListDir: (path: string) => call<FsEntry[]>("fs_list_dir", { path }),
  fsReadText: (path: string) => call<string>("fs_read_text", { path }),
  fsReadTable: (path: string, limit?: number) =>
    call<TablePreview>("fs_read_table", { path, limit }),
  fsSearch: (root: string, query: string, limit?: number) =>
    call<FsEntry[]>("fs_search", { root, query, limit }),
  fsDelete: (path: string) => call<void>("fs_delete", { path }),
  exapumpAvailable: () => call<boolean>("exapump_available"),
  exapumpUpload: (args: {
    host: string;
    port: number;
    user: string;
    password: string;
    schema?: string;
    tls: boolean;
    file: string;
    table: string;
    delimiter?: string;
    dryRun: boolean;
  }) => call<{ ok: boolean }>("exapump_upload", args),
  executeSql: (
    profileId: string,
    connectionName: string,
    sql: string,
    maxRows: number,
    split = true,
    addHistory = true,
    progressId?: string,
  ) => call<ExecuteResponse>("execute_sql", { profileId, connectionName, sql, maxRows, split, addHistory, progressId }),
  /** Cancel the running query registered under `progressId` (Stop). Returns
   *  true when a kill was issued, false when nothing was running. */
  cancelQuery: (progressId: string) => call<boolean>("cancel_query", { progressId }),
  connectionSettingsGet: (profileId: string) => call<unknown>("connection_settings_get", { profileId }),
  connectionSettingsSet: (profileId: string, settings: unknown) =>
    call<unknown>("connection_settings_set", { profileId, settings }),
  sqlHistoryList: () => call<HistoryEntry[]>("sql_history_list"),
  sqlHistoryClear: () => call<void>("sql_history_clear"),
  /** Logical backup (DDL + per-table CSV) of every user schema; progress via
   *  the `backup-progress:<profileId>` event. */
  backupNow: (profileId: string, connectionName: string) =>
    call<BackupRunResult>("backup_now", { profileId, connectionName }),
  // ── Admin API (ConfD) — admin-api-parity spec. Credentials go IN only;
  //    status never carries the password back. ──────────────────────────────
  confdStatus: (profileId: string) => call<AdminApiStatus>("confd_status", { profileId }),
  confdConnect: (profileId: string, host: string, port: number, user: string, password: string) =>
    call<AdminApiStatus>("confd_connect", { profileId, host, port, user, password }),
  confdDisconnect: (profileId: string) => call<void>("confd_disconnect", { profileId }),
  /** Run an allowlisted ConfD job; returns the job's result structure. */
  confdJob: (profileId: string, job: string, params: Record<string, unknown>) =>
    call<unknown>("confd_job", { profileId, job, params }),
  // ── Exa engine (opencode binary from GitHub Releases) ─────────────────────
  engineStatus: () => call<EngineInstallStatus>("engine_status"),
  /** Download + install the engine for `tag` (e.g. "v1.18.12"). */
  engineInstall: (tag: string) => call<EngineInstallStatus>("engine_install", { tag }),
  /** exa CLI shim state / install-to-PATH / uninstall. */
  engineCliStatus: () => call<{ installed: boolean; path?: string | null }>("engine_cli_status"),
  engineInstallCli: () => call<{ installed: boolean; path?: string | null }>("engine_install_cli"),
  engineUninstallCli: () => call<void>("engine_uninstall_cli"),
  getAppSettings: () => call<Record<string, unknown>>("get_app_settings"),
  setAppSettings: (patch: Record<string, unknown>) =>
    call<Record<string, unknown>>("set_app_settings", { patch }),
};
