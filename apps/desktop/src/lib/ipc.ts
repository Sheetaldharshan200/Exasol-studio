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
  getDatabaseInfo: (profileId: string) => call<DatabaseInfo>("get_database_info", { profileId }),
  listDataTypes: (profileId: string) =>
    call<{ types: DataType[] }>("list_data_types", { profileId }),
  searchObjects: (profileId: string, query: string, limit?: number) =>
    call<{ results: SearchHit[] }>("search_objects", { profileId, query, limit }),
  executeSql: (profileId: string, connectionName: string, sql: string, maxRows: number) =>
    call<ExecuteResponse>("execute_sql", { profileId, connectionName, sql, maxRows }),
  sqlHistoryList: () => call<HistoryEntry[]>("sql_history_list"),
  sqlHistoryClear: () => call<void>("sql_history_clear"),
  getAssistantSettings: () => call<AssistantSettings>("get_assistant_settings"),
  setAssistantSettings: (apiKey?: string, model?: string) =>
    call<AssistantSettings>("set_assistant_settings", { apiKey, model }),
  aiChat: (messages: ChatMessage[], context?: string) =>
    call<ChatReply>("ai_chat", { messages, context }),
};
