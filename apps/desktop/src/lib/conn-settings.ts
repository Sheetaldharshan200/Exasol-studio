// Per-connection settings (Properties tab), stored as JSON per profile id by
// connection_settings.rs. Every leaf has a reader — settings-inventory.test
// checks that. Keys that are not in the model (retired settings) are dropped
// on load, so the next save no longer writes them.

export type ConnSettings = {
  auth: { passwordPolicy: "save" | "session" | "clear" };
  driver: { connectionPoolSize: number; queryTimeoutSeconds: number };
  physical: { singleConnection: boolean; validationSql: string; keepAlive: boolean; idleSeconds: number };
  transaction: { autoCommit: boolean };
  hooks: { connectEnabled: boolean; connectSql: string; disconnectEnabled: boolean; disconnectSql: string };
  color: { accent: string | null; sqlTabs: boolean; showInName: boolean };
  sqlEditor: { initialSchema: "default" | "none" | "recent"; lossHandling: "none" | "reconnect" | "reexecute" };
  /** Production safety: the environment tag, a read-only guard, and
   *  confirmation of statements that destroy data (always on Prod). */
  safety: { env: Environment; readOnly: boolean; confirmDangerous: boolean };
};

export type Environment = "none" | "dev" | "test" | "prod";

export const ENVIRONMENTS: { value: Environment; label: string; color: string }[] = [
  { value: "none", label: "No tag", color: "" },
  { value: "dev", label: "Dev", color: "#10b981" },
  { value: "test", label: "Test", color: "#eab308" },
  { value: "prod", label: "Prod", color: "#e11d48" },
];

/** Whether a statement that destroys data asks first: always on Prod. */
export function confirmsDanger(safety: ConnSettings["safety"]): boolean {
  return safety.env === "prod" || safety.confirmDangerous;
}

export const DEFAULT_CONN_SETTINGS: ConnSettings = {
  auth: { passwordPolicy: "save" },
  driver: { connectionPoolSize: 4, queryTimeoutSeconds: 0 },
  physical: { singleConnection: false, validationSql: "", keepAlive: false, idleSeconds: 120 },
  transaction: { autoCommit: true },
  hooks: { connectEnabled: false, connectSql: "", disconnectEnabled: false, disconnectSql: "" },
  color: { accent: null, sqlTabs: true, showInName: true },
  sqlEditor: { initialSchema: "default", lossHandling: "reexecute" },
  safety: { env: "none", readOnly: false, confirmDangerous: false },
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** `patch` over `base`, keeping only keys `base` has. */
function mergeKnown<T>(base: T, patch: unknown): T {
  if (!isObj(patch)) return base;
  const out = { ...(base as Record<string, unknown>) };
  for (const [k, cur] of Object.entries(out)) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (isObj(cur)) out[k] = mergeKnown(cur, v);
    else if (v !== undefined) out[k] = v;
  }
  return out as T;
}

/** Stored settings over the defaults; unknown keys are dropped. */
export function withConnDefaults(raw: unknown): ConnSettings {
  return mergeKnown(structuredClone(DEFAULT_CONN_SETTINGS), raw);
}

/** Every setting's path, e.g. "sqlEditor.initialSchema". */
export function connSettingPaths(v: unknown = DEFAULT_CONN_SETTINGS, prefix = ""): string[] {
  if (!isObj(v)) return [prefix];
  return Object.entries(v).flatMap(([k, x]) => connSettingPaths(x, prefix ? `${prefix}.${k}` : k));
}
