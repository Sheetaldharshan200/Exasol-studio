/**
 * Every virtual schema adapter Exasol publishes, one file each — see
 * `../types.ts` for what an entry carries. Order is what the source picker
 * shows: relational databases first, then object stores and document stores,
 * then Exasol-to-Exasol.
 */
import type { VsAdapter } from "../types.ts";
import { PostgresqlAdapter } from "./postgresql.ts";
import { MysqlAdapter } from "./mysql.ts";
import { OracleAdapter } from "./oracle.ts";
import { SqlserverAdapter } from "./sqlserver.ts";
import { SnowflakeAdapter } from "./snowflake.ts";
import { BigqueryAdapter } from "./bigquery.ts";
import { RedshiftAdapter } from "./redshift.ts";
import { DatabricksAdapter } from "./databricks.ts";
import { Db2Adapter } from "./db2.ts";
import { HanaAdapter } from "./hana.ts";
import { HiveAdapter } from "./hive.ts";
import { ImpalaAdapter } from "./impala.ts";
import { AthenaAdapter } from "./athena.ts";
import { SybaseAdapter } from "./sybase.ts";
import { ElasticsearchAdapter } from "./elasticsearch.ts";
import { S3Adapter } from "./s3.ts";
import { GcsAdapter } from "./gcs.ts";
import { AzureBlobAdapter } from "./azure-blob.ts";
import { AzureDataLakeAdapter } from "./azure-data-lake.ts";
import { BucketFsAdapter } from "./bucketfs.ts";
import { DynamoDbAdapter } from "./dynamodb.ts";
import { MongodbAdapter } from "./mongodb.ts";
import { ExasolLuaAdapter } from "./exasol-lua.ts";
import { ExasolAdapter } from "./exasol.ts";

export const VS_ADAPTERS: readonly VsAdapter[] = [
  PostgresqlAdapter,
  MysqlAdapter,
  OracleAdapter,
  SqlserverAdapter,
  SnowflakeAdapter,
  BigqueryAdapter,
  RedshiftAdapter,
  DatabricksAdapter,
  Db2Adapter,
  HanaAdapter,
  HiveAdapter,
  ImpalaAdapter,
  AthenaAdapter,
  SybaseAdapter,
  ElasticsearchAdapter,
  S3Adapter,
  GcsAdapter,
  AzureBlobAdapter,
  AzureDataLakeAdapter,
  BucketFsAdapter,
  DynamoDbAdapter,
  MongodbAdapter,
  ExasolLuaAdapter,
  ExasolAdapter,
];

export function adapterById(id: string): VsAdapter | undefined {
  return VS_ADAPTERS.find((a) => a.id === id);
}

/**
 * The adapter behind an existing virtual schema, from its adapter script's
 * name (`SCHEMA.NAME`). Exasol folds unquoted identifiers to UPPERCASE and the
 * name is whatever the creator chose, so this is a best-effort match on the
 * adapter id appearing in the script name — enough to show "PostgreSQL" next
 * to a schema, never used for anything that must be exact.
 */
export function adapterForScript(scriptName: string | null | undefined): VsAdapter | undefined {
  if (!scriptName) return undefined;
  const upper = scriptName.toUpperCase();
  return VS_ADAPTERS.find((a) => upper.includes(a.id.toUpperCase().replace(/-/g, "_")))
    ?? VS_ADAPTERS.find((a) => upper.includes(a.id.toUpperCase()));
}
