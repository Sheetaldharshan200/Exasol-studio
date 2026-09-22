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
  /**
   * Paths present under the default bucket (`/buckets/bfsdefault/default`),
   * RELATIVE to it and recursive — e.g. `vs/postgresql.jar`. Presence is
   * decided on the exact path the DDL will reference, never on a basename:
   * a JAR parked under `backup/` must not count as installed.
   */
  bucketFiles: string[];
  connections: string[];
  /**
   * Script language container aliases installed (`exasol slc list`), e.g.
   * `["PYTHON3", "JAVA"]`. `undefined` when the database is not a local
   * deployment Studio manages — cloud and cluster Exasols ship their SLCs.
   */
  slcAliases?: string[];
};

export type Prerequisite =
  | { kind: "javaSlc"; label: string }
  | { kind: "adapterArtifact"; label: string; asset: string }
  | { kind: "driverJar"; label: string; source: "maven" | "user"; maven?: string; manualUrl?: string }
  | { kind: "adapterScript"; label: string; schema: string; name: string }
  | { kind: "importUdf"; label: string; schema: string; name: string };

/** Studio registers adapters under this schema unless one already exists. */
export const ADAPTER_SCHEMA = "ADAPTER";
/** The directory under the default bucket where Studio stages adapter and driver JARs. */
export const VS_DIR = "vs";

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
 * The driver JAR already in `vs/`, if any. Studio stages a Maven driver as
 * `<artifact>-<version>.jar` (whatever Maven Central's latest was that day),
 * so the match is by artifact, any version; a user-supplied JAR matches by
 * its exact name. `files` are bucket-relative (`vs/postgresql-42.7.13.jar`).
 */
export function presentDriverFile(adapter: VsAdapter, files: Iterable<string>, userDriverFile?: string): string | undefined {
  if (!adapter.driver) return undefined;
  const list = [...files].map((f) => f.replace(/^\/?buckets\/bfsdefault\/default\//, "").replace(/^\/+/, ""));
  const maven = adapter.driver.source.maven;
  if (maven) {
    const artifact = maven.split(":")[1].toLowerCase();
    const re = new RegExp(`^${VS_DIR}/(${artifact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:-[\\w.]+)?\\.jar)$`, "i");
    for (const f of list) {
      const m = re.exec(f);
      if (m) return m[1];
    }
    return undefined;
  }
  return userDriverFile && list.includes(`${VS_DIR}/${userDriverFile}`) ? userDriverFile : undefined;
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
  // Normalise to bucket-relative paths; the DDL references `vs/<file>`.
  const files = new Set(probe.bucketFiles.map((f) => f.replace(/^\/?buckets\/bfsdefault\/default\//, "").replace(/^\/+/, "")));
  const inVs = (name: string) => files.has(`${VS_DIR}/${name}`);
  const hasScript = (list: { schema: string; name: string }[], name: string) =>
    list.some((s) => foldIdentifier(s.schema) === schema && foldIdentifier(s.name) === foldIdentifier(name));
  const missing: Prerequisite[] = [];

  // A Java adapter runs as a Java UDF. Local deployments ship no script
  // language container, so the JAVA one must be installed first (it needs a
  // database restart, which is why it comes before everything else).
  if (adapter.runtime === "java" && probe.slcAliases && !probe.slcAliases.some((a) => a.toUpperCase() === "JAVA")) {
    missing.push({ kind: "javaSlc", label: "Java script language container (runs the adapter)" });
  }

  const assetPattern = new RegExp(adapter.release.asset);
  const artifactPresent = adapter.runtime === "lua" || [...files].some((f) => f.startsWith(`${VS_DIR}/`) && assetPattern.test(f.slice(VS_DIR.length + 1)));
  if (!artifactPresent) {
    missing.push({ kind: "adapterArtifact", label: `${adapter.name} adapter ${adapter.release.tag}`, asset: adapter.release.asset });
  }

  if (adapter.driver) {
    const fetched = driverFileName(adapter);
    const present = presentDriverFile(adapter, files, options.userDriverFile) !== undefined;
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
