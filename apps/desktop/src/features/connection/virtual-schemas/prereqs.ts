/**
 * What is still missing on a database before a virtual schema through a given
 * adapter can be created — decided purely from what the database reports, so
 * the flow's "Studio will install …" step is testable without a database.
 */
import type { VsAdapter } from "./types.ts";
import { foldIdentifier } from "./ddl.ts";

/** What the database reports about itself (from `list_vs_prereqs`). */
export type PrereqProbe = {
  /** Adapter scripts present (`SYS.EXA_ALL_SCRIPTS` with SCRIPT_TYPE = 'ADAPTER'). */
  adapterScripts: { schema: string; name: string }[];
  /** UDF scripts present (SCRIPT_TYPE = 'UDF'), for document adapters' import UDF. */
  udfScripts: { schema: string; name: string }[];
  /** File names present in the adapter bucket path (`/buckets/bfsdefault/default`, recursive). */
  bucketFiles: string[];
  connections: string[];
};

export type Prerequisite =
  | { kind: "adapterArtifact"; label: string; asset: string }
  | { kind: "driverJar"; label: string; source: "maven" | "user"; maven?: string; manualUrl?: string }
  | { kind: "adapterScript"; label: string; schema: string; name: string }
  | { kind: "importUdf"; label: string; schema: string; name: string };

/** Studio registers adapters under this schema unless one already exists. */
export const ADAPTER_SCHEMA = "ADAPTER";

/** The adapter script name Studio uses for an adapter, e.g. `POSTGRESQL_ADAPTER`. */
export function adapterScriptName(adapter: VsAdapter): string {
  return `${adapter.id.toUpperCase().replace(/-/g, "_")}_ADAPTER`;
}

/** The driver JAR file name Studio uploads for a Maven-sourced driver. */
export function driverFileName(adapter: VsAdapter): string | undefined {
  const maven = adapter.driver?.source.maven;
  if (!maven) return undefined;
  const artifact = maven.split(":")[1];
  return `${artifact}.jar`;
}

/**
 * The ordered list of what must be installed, in the order it must happen:
 * artifacts into BucketFS first, then the scripts that reference them.
 *
 * `matches` are case-folded the way Exasol folds them, so a probe reporting
 * `ADAPTER.POSTGRESQL_ADAPTER` satisfies a plan for `adapter.postgresql_adapter`.
 * `userDriverFile` is the JAR name the user already uploaded for a driver that
 * cannot be fetched; without it a user-supplied driver is reported as missing.
 */
export function missingPrerequisites(
  adapter: VsAdapter,
  probe: PrereqProbe,
  options: { schema?: string; userDriverFile?: string } = {},
): Prerequisite[] {
  const schema = foldIdentifier(options.schema ?? ADAPTER_SCHEMA);
  const files = new Set(probe.bucketFiles.map((f) => f.split("/").pop() ?? f));
  const hasScript = (list: { schema: string; name: string }[], name: string) =>
    list.some((s) => foldIdentifier(s.schema) === schema && foldIdentifier(s.name) === foldIdentifier(name));
  const missing: Prerequisite[] = [];

  const assetPattern = new RegExp(adapter.release.asset);
  const artifactPresent = adapter.runtime === "lua" || [...files].some((f) => assetPattern.test(f));
  if (!artifactPresent) {
    missing.push({ kind: "adapterArtifact", label: `${adapter.name} adapter ${adapter.release.tag}`, asset: adapter.release.asset });
  }

  if (adapter.driver) {
    const fetched = driverFileName(adapter);
    const present = fetched ? files.has(fetched) : Boolean(options.userDriverFile && files.has(options.userDriverFile));
    if (!present) {
      missing.push(
        fetched
          ? { kind: "driverJar", label: `${adapter.name} JDBC driver`, source: "maven", maven: adapter.driver.source.maven }
          : { kind: "driverJar", label: `${adapter.name} JDBC driver (supplied by you)`, source: "user", manualUrl: adapter.driver.source.manualUrl },
      );
    }
  }

  const scriptName = adapterScriptName(adapter);
  if (!hasScript(probe.adapterScripts, scriptName)) {
    missing.push({ kind: "adapterScript", label: `Adapter script ${schema}.${scriptName}`, schema, name: scriptName });
  }
  if (adapter.importUdf && !hasScript(probe.udfScripts, adapter.importUdf.name)) {
    missing.push({ kind: "importUdf", label: `Import UDF ${schema}.${adapter.importUdf.name}`, schema, name: adapter.importUdf.name });
  }
  return missing;
}
