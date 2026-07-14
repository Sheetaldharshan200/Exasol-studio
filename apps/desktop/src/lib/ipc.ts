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

export type DataType = { typeId: number | string | null; typeName: string };

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
export type ReleaseAsset = { name: string; url: string; size: number };
export type Release = {
  tag: string | null;
  name: string | null;
  publishedAt: string | null;
  htmlUrl: string | null;
  assets: ReleaseAsset[];
} | null;
export type InstalledItem = { id: string; version: string; path: string; filename: string };

export type CatalogEntry = {
  repo: string;
  latest: string | null;
  homepage: string;
  mirrorTag: string;
};
export type MarketCatalog = {
  generatedAt: string | null;
  mirrorRepo: string;
  items: Record<string, CatalogEntry>;
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
};

export type HistoryEntry = {
  id: string;
  executedAt: string;
  profileId: string;
  connectionName: string;
  sql: string;
  statementCount: number;
  elapsedMs: number;
  success: boolean;
  error: string | null;
  rowCount: number;
};

export type AssistantSettings = { apiKey: string; model: string };
export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatReply = { text: string; model: string; stopReason: string | null };

export type AppErrorPayload = { kind: string; message: string };

export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    return invoke<T>(command, args);
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
  listDataTypes: (profileId: string) =>
    call<{ types: DataType[] }>("list_data_types", { profileId }),
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
  biInstalled: () => call<boolean>("bi_installed"),
  biLaunch: () => call<string>("bi_launch"),
  biRegisterDb: (profileId: string, name: string) => call<null>("bi_register_db", { profileId, name }),
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
  driverStatus: (driverId: string) =>
    call<{ driverId: string; runtime: string; ready: boolean; supported: boolean; hint: string }>("driver_status", { driverId }),
  driverSetup: (driverId: string) => call<{ ok: boolean }>("driver_setup", { driverId }),
  marketDocFile: (repo: string, path: string) => call<string | null>("market_doc_file", { repo, path }),
  openExternal: (url: string) => call<null>("open_external", { url }),
  gitStatus: () => call<GitStatus>("git_status"),
  gitInit: () => call<null>("git_init"),
  gitCommit: (message: string) => call<string>("git_commit", { message }),
  gitLog: (limit?: number) => call<GitLogEntry[]>("git_log", { limit }),
  marketDirPath: () => call<string>("market_dir_path"),
  fsWorkspaceDir: () => call<FsEntry>("fs_workspace_dir"),
  fsHomeRoots: () => call<FsEntry[]>("fs_home_roots"),
  writeTextFile: (path: string, contents: string) =>
    call<void>("write_text_file", { path, contents }),
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
  ) => call<ExecuteResponse>("execute_sql", { profileId, connectionName, sql, maxRows, split }),
  sqlHistoryList: () => call<HistoryEntry[]>("sql_history_list"),
  sqlHistoryClear: () => call<void>("sql_history_clear"),
  getAssistantSettings: () => call<AssistantSettings>("get_assistant_settings"),
  setAssistantSettings: (apiKey?: string, model?: string) =>
    call<AssistantSettings>("set_assistant_settings", { apiKey, model }),
  aiChat: (messages: ChatMessage[], context?: string) =>
    call<ChatReply>("ai_chat", { messages, context }),
  getAppSettings: () => call<Record<string, unknown>>("get_app_settings"),
  setAppSettings: (patch: Record<string, unknown>) =>
    call<Record<string, unknown>>("set_app_settings", { patch }),
};
