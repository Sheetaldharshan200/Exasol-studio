/**
 * The DDL the add-data-source flow runs, as pure functions of the catalog
 * entry and the user's answers — so every statement can be unit-tested for
 * the things that go wrong in SQL text: identifier folding, quoting, and a
 * password ending up somewhere it must not.
 *
 * Exasol folds unquoted identifiers to UPPERCASE. Names that are plain
 * identifiers are emitted unquoted (and therefore folded); anything else is
 * double-quoted with embedded quotes doubled, so `my schema` stays `my schema`.
 */
import type { VsAdapter } from "./types.ts";
import { VS_BUCKET_PATH } from "./types.ts";

const PLAIN_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** An identifier as Exasol will see it: plain names fold to upper case. */
export function identifier(name: string): string {
  const trimmed = name.trim();
  if (PLAIN_IDENTIFIER.test(trimmed)) return trimmed.toUpperCase();
  return `"${trimmed.replace(/"/g, '""')}"`;
}

/** The canonical (folded) form of a name, for comparing with catalog rows. */
export function foldIdentifier(name: string): string {
  const trimmed = name.trim();
  return PLAIN_IDENTIFIER.test(trimmed) ? trimmed.toUpperCase() : trimmed;
}

/** A SQL string literal; a single quote inside is doubled. */
export function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** `SCHEMA.NAME`, each part treated as an identifier. */
export function qualified(schema: string, name: string): string {
  return `${identifier(schema)}.${identifier(name)}`;
}

/** Where an adapter's release artifact and (for JDBC) its driver live in BucketFS. */
export function adapterJarPath(assetName: string): string {
  return `${VS_BUCKET_PATH}/vs/${assetName}`;
}
export function driverJarPath(fileName: string): string {
  return `${VS_BUCKET_PATH}/vs/${fileName}`;
}

/**
 * The ETL layer (IMPORT FROM JDBC, which the adapters use to move rows) reads
 * the driver from its own registration, not from BucketFS: `settings.cfg`
 * next to the JAR under `/exa/jdbc/<DRIVERNAME>/`. Same keys and meanings as
 * Exasol's "Add JDBC Driver" guide; the trailing newline is required.
 */
export function jdbcSettingsCfg(input: { driverName: string; prefix: string; mainClass: string; jar: string }): string {
  return [
    `DRIVERNAME=${input.driverName}`,
    `PREFIX=${input.prefix}`,
    `DRIVERMAIN=${input.mainClass}`,
    `FETCHSIZE=100000`,
    `INSERTSIZE=-1`,
    `JAR=${input.jar}`,
    ``,
  ].join("\n");
}

/** `jdbc:postgresql:` from `jdbc:postgresql://host:5432/db` — what settings.cfg's PREFIX wants. */
export function jdbcPrefix(url: string): string {
  const m = /^(jdbc:[a-z0-9]+:)/i.exec(url);
  if (!m) throw new Error(`not a JDBC URL: ${url}`);
  return m[1].toLowerCase();
}

/**
 * `CREATE OR REPLACE CONNECTION` — the ONLY statement a credential appears in.
 * USER and IDENTIFIED BY are always emitted, empty when the adapter carries
 * its credentials elsewhere (document adapters put JSON in IDENTIFIED BY and
 * leave TO and USER empty; that is the shape their guides prescribe).
 */
export function connectionDdl(input: { name: string; to: string; user?: string; password?: string }): string {
  return [
    `CREATE OR REPLACE CONNECTION ${identifier(input.name)}`,
    `  TO ${sqlString(input.to)}`,
    `  USER ${sqlString(input.user ?? "")}`,
    `  IDENTIFIED BY ${sqlString(input.password ?? "")}`,
  ].join("\n");
}

/**
 * The adapter script. Java adapters reference their JAR (and the JDBC driver
 * JAR) in BucketFS; Lua adapters inline the released source, so there is
 * nothing in BucketFS to reference.
 *
 * No exaplus `/` terminator: the flow runs each statement on its own
 * (`split = false`), and a script body can legitimately contain semicolons,
 * which is exactly why it must never go through the statement splitter.
 */
export function adapterScriptDdl(
  adapter: VsAdapter,
  input: { schema: string; name: string; adapterAsset: string; driverFile?: string; luaSource?: string },
): string {
  const target = qualified(input.schema, input.name);
  if (adapter.runtime === "lua") {
    if (!input.luaSource?.trim()) throw new Error(`${adapter.id}: a Lua adapter needs its released source`);
    return `CREATE OR REPLACE LUA ADAPTER SCRIPT ${target} AS\n${input.luaSource.trimEnd()}`;
  }
  const lines = [
    `CREATE OR REPLACE JAVA ADAPTER SCRIPT ${target} AS`,
    `  %scriptclass ${adapter.scriptClass};`,
    // The Exasol Personal guide sets this: without it, timestamps read through
    // the adapter shift by whatever zone the Java runtime happens to run in.
    `  %jvmoption -Duser.timezone=UTC;`,
    `  %jar ${adapterJarPath(input.adapterAsset)};`,
  ];
  if (adapter.driver) {
    if (!input.driverFile) throw new Error(`${adapter.id}: a JDBC adapter needs its driver JAR`);
    lines.push(`  %jar ${driverJarPath(input.driverFile)};`);
  }
  return lines.join("\n");
}

/**
 * Document adapters also need the import UDF that does the parallel reading.
 * Its signature is fixed by the adapter framework; only the name and the JAR
 * differ per adapter.
 */
export function importUdfDdl(adapter: VsAdapter, input: { schema: string; adapterAsset: string }): string {
  if (!adapter.importUdf) throw new Error(`${adapter.id}: not a document adapter`);
  return [
    `CREATE OR REPLACE JAVA SET SCRIPT ${qualified(input.schema, adapter.importUdf.name)}(`,
    `  DATA_LOADER VARCHAR(2000000),`,
    `  SCHEMA_MAPPING_REQUEST VARCHAR(2000000),`,
    `  CONNECTION_NAME VARCHAR(500))`,
    `  EMITS(...) AS`,
    `  %scriptclass ${adapter.importUdf.scriptClass};`,
    `  %jar ${adapterJarPath(input.adapterAsset)};`,
  ].join("\n");
}

/**
 * `CREATE VIRTUAL SCHEMA … WITH`. CONNECTION_NAME is the flow's to add — it
 * chose the connection name — so it is never part of an adapter's properties.
 * Empty property values are dropped: an optional field left blank must not
 * become `CATALOG_NAME = ''`, which some adapters reject.
 */
export function virtualSchemaDdl(input: {
  name: string;
  adapterScript: { schema: string; name: string };
  connectionName: string;
  properties: Record<string, string>;
}): string {
  const props: [string, string][] = [["CONNECTION_NAME", foldIdentifier(input.connectionName)]];
  for (const [key, value] of Object.entries(input.properties)) {
    if (value !== undefined && value !== null && String(value).trim() !== "") props.push([key, String(value)]);
  }
  const width = Math.max(...props.map(([k]) => k.length));
  const withClause = props.map(([k, v]) => `  ${k.padEnd(width)} = ${sqlString(v)}`).join("\n");
  return `CREATE VIRTUAL SCHEMA ${identifier(input.name)}\n  USING ${qualified(input.adapterScript.schema, input.adapterScript.name)}\n  WITH\n${withClause}`;
}

/** The statements that PROVE a new schema works. */
export function proveListTablesSql(schemaName: string): string {
  return `SELECT TABLE_NAME FROM SYS.EXA_ALL_TABLES WHERE TABLE_SCHEMA = ${sqlString(foldIdentifier(schemaName))} ORDER BY TABLE_NAME`;
}
export function proveSelectSql(schemaName: string, tableName: string, limit = 5): string {
  return `SELECT * FROM ${qualified(schemaName, tableName)} LIMIT ${Math.max(1, Math.floor(limit))}`;
}

/** Undo, for a schema that created but could not be read. */
export function dropVirtualSchemaSql(schemaName: string): string {
  return `DROP VIRTUAL SCHEMA IF EXISTS ${identifier(schemaName)} CASCADE`;
}
export function dropConnectionSql(connectionName: string): string {
  return `DROP CONNECTION IF EXISTS ${identifier(connectionName)}`;
}
