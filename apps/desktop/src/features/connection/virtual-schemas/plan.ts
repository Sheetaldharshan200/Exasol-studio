/**
 * The statements the add-data-source flow runs, in order, as pure data. The
 * component only walks the list; everything that could be wrong about the SQL
 * is decided — and tested — here.
 */
import type { FieldValues, VsAdapter } from "./types.ts";
import { presentDriverFile, type Prerequisite } from "./prereqs.ts";
import { adapterScriptDdl, connectionDdl, importUdfDdl, virtualSchemaDdl } from "./ddl.ts";
import { ADAPTER_SCHEMA, adapterScriptName } from "./prereqs.ts";

export type PlanStep = {
  /** Stable id for progress display and tests. */
  id: "connection" | "adapterScript" | "importUdf" | "virtualSchema";
  label: string;
  sql: string;
  /** Redacted text for logs and history display; the connection carries a password. */
  display: string;
};

export type PlanNames = {
  virtualSchema: string;
  connection: string;
  /** Schema the adapter script (and import UDF) live in. */
  adapterSchema?: string;
};

/** What staging produced: the file names the DDL must reference. */
export type Staged = {
  adapterAsset: string;
  driverFile?: string | null;
  luaSource?: string | null;
};

/** Suggested names from the adapter id: `POSTGRESQL_VS`, `POSTGRESQL_CONN`. */
export function defaultNames(adapter: VsAdapter): PlanNames {
  const base = adapter.id.toUpperCase().replace(/-/g, "_");
  return { virtualSchema: `${base}_VS`, connection: `${base}_CONN`, adapterSchema: ADAPTER_SCHEMA };
}

/**
 * Build the plan. `installScripts` is false when the adapter script (and UDF)
 * already exist on the database and only the connection and schema are needed.
 */
export function buildPlan(
  adapter: VsAdapter,
  values: FieldValues,
  names: PlanNames,
  staged: Staged,
  options: { installScripts: boolean } = { installScripts: true },
): PlanStep[] {
  const schema = names.adapterSchema ?? ADAPTER_SCHEMA;
  const scriptName = adapterScriptName(adapter);
  const conn = adapter.connection(values);
  const steps: PlanStep[] = [];

  const connectionSql = connectionDdl({ name: names.connection, ...conn });
  steps.push({
    id: "connection",
    label: `Connection ${names.connection}`,
    sql: connectionSql,
    display: connectionDdl({ name: names.connection, to: conn.to, user: conn.user, password: conn.password ? "•••••" : "" }),
  });

  if (options.installScripts) {
    const scriptSql = adapterScriptDdl(adapter, {
      schema,
      name: scriptName,
      adapterAsset: staged.adapterAsset,
      driverFile: staged.driverFile ?? undefined,
      luaSource: staged.luaSource ?? undefined,
    });
    steps.push({ id: "adapterScript", label: `Adapter script ${schema}.${scriptName}`, sql: scriptSql, display: scriptSql });
    if (adapter.importUdf) {
      const udfSql = importUdfDdl(adapter, { schema, adapterAsset: staged.adapterAsset });
      steps.push({ id: "importUdf", label: `Import UDF ${schema}.${adapter.importUdf.name}`, sql: udfSql, display: udfSql });
    }
  }

  const vsSql = virtualSchemaDdl({
    name: names.virtualSchema,
    adapterScript: { schema, name: scriptName },
    connectionName: names.connection,
    properties: adapter.properties(values),
  });
  steps.push({ id: "virtualSchema", label: `Virtual schema ${names.virtualSchema}`, sql: vsSql, display: vsSql });
  return steps;
}

/**
 * On Studio's managed local Exasol the database runs inside the launcher's
 * runtime, so `localhost` there is the runtime, not this computer. The guide
 * says so explicitly; this is the check that turns it into a warning.
 */
export function pointsAtLocalhost(values: FieldValues): boolean {
  const host = (values.host ?? "").trim().toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0";
}

/**
 * May the prerequisites step advance to "create"? On the managed local Exasol
 * Studio installs what is missing, so the answer is "nothing missing, or just
 * staged". Elsewhere Studio cannot see the bucket, so the user supplies the
 * facts the DDL needs: the adapter file they uploaded (Java), the driver file
 * when the adapter has one, or the fetched source (Lua).
 */
export function readyToCreate(input: {
  adapter: VsAdapter;
  managedLocal: boolean;
  missingCount: number;
  staged: boolean;
  adapterFile: string;
  driverFile: string;
}): boolean {
  if (input.managedLocal) return input.missingCount === 0 || input.staged;
  const driverKnown = !input.adapter.driver || input.driverFile.trim().length > 0;
  // Lua: the source must have been fetched; a Lua adapter that still needs a
  // JDBC driver (Databricks) also needs the driver the user registered.
  if (input.adapter.runtime === "lua") return input.staged && driverKnown;
  return input.adapterFile.trim().length > 0 && driverKnown;
}

/**
 * Does the plan have to (re)create the adapter script / import UDF? Yes when
 * either is missing from the database, and always right after Studio staged a
 * new adapter release — the script must point at the new file.
 */
export function needsScriptInstall(missing: Prerequisite[], staged: boolean): boolean {
  return staged || missing.some((m) => m.kind === "adapterScript" || m.kind === "importUdf");
}

/**
 * The driver JAR the adapter script will name: what Studio just staged, else
 * the file the user says they uploaded, else the one already in the bucket
 * (a Maven driver from an earlier run, under its versioned name).
 */
export function resolveDriverFile(input: { adapter: VsAdapter; stagedDriverFile?: string | null; userJarPath: string; bucketFiles: Iterable<string> }): string | undefined {
  if (!input.adapter.driver) return undefined;
  if (input.stagedDriverFile) return input.stagedDriverFile;
  const typed = input.userJarPath.split("/").pop()?.trim();
  if (typed) return typed;
  return presentDriverFile(input.adapter, input.bucketFiles);
}

/** `buildPlan` without the throw: the reason it cannot be built, for the UI. */
export function tryBuildPlan(...args: Parameters<typeof buildPlan>): { plan: PlanStep[]; error: string | null } {
  try {
    return { plan: buildPlan(...args), error: null };
  } catch (e) {
    return { plan: [], error: e instanceof Error ? e.message : String(e) };
  }
}
