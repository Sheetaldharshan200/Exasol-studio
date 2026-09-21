import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adapterScriptDdl, connectionDdl, dropVirtualSchemaSql, foldIdentifier, identifier, importUdfDdl,
  jdbcPrefix, jdbcSettingsCfg, proveListTablesSql, proveSelectSql, sqlString, virtualSchemaDdl,
} from "./ddl.ts";
import { PostgresqlAdapter } from "./adapters/postgresql.ts";
import { S3Adapter } from "./adapters/s3.ts";
import { DatabricksAdapter } from "./adapters/databricks.ts";
import { VS_ADAPTERS } from "./adapters/index.ts";

test("identifiers fold to UPPERCASE like Exasol, and only odd names are quoted", () => {
  assert.equal(identifier("pg_orders"), "PG_ORDERS");
  assert.equal(identifier("  Orders "), "ORDERS");
  assert.equal(identifier("my schema"), '"my schema"');
  assert.equal(identifier('say "hi"'), '"say ""hi"""');
  assert.equal(identifier("1abc"), '"1abc"', "cannot start with a digit unquoted");
  assert.equal(foldIdentifier("pg_orders"), "PG_ORDERS");
  assert.equal(foldIdentifier("my schema"), "my schema", "a quoted name keeps its case");
});

test("string literals double an embedded quote", () => {
  assert.equal(sqlString("it's"), "'it''s'");
  assert.equal(sqlString(""), "''");
});

test("the connection is the only statement a password appears in", () => {
  const ddl = connectionDdl({ name: "pg_conn", to: "jdbc:postgresql://h:5432/db", user: "app", password: "s3cr'et" });
  assert.equal(ddl, [
    "CREATE OR REPLACE CONNECTION PG_CONN",
    "  TO 'jdbc:postgresql://h:5432/db'",
    "  USER 'app'",
    "  IDENTIFIED BY 's3cr''et'",
  ].join("\n"));
  const vs = virtualSchemaDdl({ name: "pg_vs", adapterScript: { schema: "adapter", name: "pg" }, connectionName: "pg_conn", properties: { SCHEMA_NAME: "public" } });
  assert.ok(!vs.includes("s3cr"), "no password in CREATE VIRTUAL SCHEMA");
});

test("document adapters put their JSON credentials in IDENTIFIED BY with TO and USER empty", () => {
  const conn = S3Adapter.connection({ bucket: "b", region: "eu-central-1", accessKey: "AK", secretKey: "SK", mapping: "{}" });
  const ddl = connectionDdl({ name: "s3_conn", ...conn });
  assert.match(ddl, /^  TO ''$/m);
  assert.match(ddl, /^  USER ''$/m);
  assert.ok(ddl.includes(`IDENTIFIED BY '{"awsAccessKeyId":"AK"`));
});

test("a Java JDBC adapter script references both JARs; a document adapter also gets its import UDF", () => {
  const pg = adapterScriptDdl(PostgresqlAdapter, { schema: "adapter", name: "pg_adapter", adapterAsset: "virtual-schema-dist-14.0.5-postgresql-4.0.2.jar", driverFile: "postgresql-42.7.4.jar" });
  assert.equal(pg, [
    "CREATE OR REPLACE JAVA ADAPTER SCRIPT ADAPTER.PG_ADAPTER AS",
    "  %scriptclass com.exasol.adapter.RequestDispatcher;",
    "  %jvmoption -Duser.timezone=UTC;",
    "  %jar /buckets/bfsdefault/default/vs/virtual-schema-dist-14.0.5-postgresql-4.0.2.jar;",
    "  %jar /buckets/bfsdefault/default/vs/postgresql-42.7.4.jar;",
    "/",
  ].join("\n"));
  assert.throws(() => adapterScriptDdl(PostgresqlAdapter, { schema: "a", name: "b", adapterAsset: "x.jar" }), /driver JAR/);

  const udf = importUdfDdl(S3Adapter, { schema: "adapter", adapterAsset: "document-files-virtual-schema-dist-9.1.0-s3-4.1.1.jar" });
  assert.match(udf, /^CREATE OR REPLACE JAVA SET SCRIPT ADAPTER\.IMPORT_FROM_S3_DOCUMENT_FILES\(/);
  assert.ok(udf.includes("DATA_LOADER VARCHAR(2000000)") && udf.includes("SCHEMA_MAPPING_REQUEST VARCHAR(2000000)") && udf.includes("CONNECTION_NAME VARCHAR(500))"));
  assert.ok(udf.includes("%scriptclass com.exasol.adapter.document.UdfEntryPoint;"));
  assert.throws(() => importUdfDdl(PostgresqlAdapter, { schema: "a", adapterAsset: "x.jar" }), /not a document adapter/);
});

test("a Lua adapter inlines its released source and references no JAR", () => {
  const ddl = adapterScriptDdl(DatabricksAdapter, { schema: "adapter", name: "dbx", adapterAsset: "ignored.lua", luaSource: "-- adapter\nreturn {}\n" });
  assert.equal(ddl, "CREATE OR REPLACE LUA ADAPTER SCRIPT ADAPTER.DBX AS\n-- adapter\nreturn {}\n/");
  assert.ok(!ddl.includes("%jar"));
  assert.throws(() => adapterScriptDdl(DatabricksAdapter, { schema: "a", name: "b", adapterAsset: "x" }), /released source/);
});

test("CREATE VIRTUAL SCHEMA adds CONNECTION_NAME itself and drops blank optional properties", () => {
  const ddl = virtualSchemaDdl({
    name: "sf_vs",
    adapterScript: { schema: "adapter", name: "snowflake" },
    connectionName: "sf_conn",
    properties: { CATALOG_NAME: "ANALYTICS", SCHEMA_NAME: "PUBLIC", WAREHOUSE: "" },
  });
  assert.equal(ddl, [
    "CREATE VIRTUAL SCHEMA SF_VS",
    "  USING ADAPTER.SNOWFLAKE",
    "  WITH",
    "  CONNECTION_NAME = 'SF_CONN'",
    "  CATALOG_NAME    = 'ANALYTICS'",
    "  SCHEMA_NAME     = 'PUBLIC'",
  ].join("\n"));
  assert.ok(!ddl.includes("WAREHOUSE"), "a blank optional property is omitted, not emitted as ''");
});

test("every catalog adapter's properties render into valid WITH clauses", () => {
  for (const a of VS_ADAPTERS) {
    const values = Object.fromEntries(a.fields.map((f) => [f.key, f.key === "keyJson" ? '{"type":"service_account"}' : `v_${f.key}`]));
    // Names the flow would generate: identifier-safe, so they fold to upper case.
    const base = a.id.replace(/-/g, "_");
    const ddl = virtualSchemaDdl({ name: `${base}_vs`, adapterScript: { schema: "adapter", name: `${base}_adapter` }, connectionName: `${base}_conn`, properties: a.properties(values) });
    assert.ok(ddl.includes(`CREATE VIRTUAL SCHEMA ${base.toUpperCase()}_VS`), a.id);
    assert.match(ddl, /CONNECTION_NAME\s+= '[A-Z0-9_]+'/, a.id);
    assert.ok(!ddl.includes("= ''"), `${a.id}: no empty property values`);
  }
});

test("prove and undo statements target the folded schema name", () => {
  assert.equal(proveListTablesSql("pg_vs"), "SELECT TABLE_NAME FROM SYS.EXA_ALL_TABLES WHERE TABLE_SCHEMA = 'PG_VS' ORDER BY TABLE_NAME");
  assert.equal(proveSelectSql("pg_vs", "customers"), "SELECT * FROM PG_VS.CUSTOMERS LIMIT 5");
  assert.equal(proveSelectSql("pg_vs", "customers", 0), "SELECT * FROM PG_VS.CUSTOMERS LIMIT 1", "never LIMIT 0");
  assert.equal(dropVirtualSchemaSql("pg_vs"), "DROP VIRTUAL SCHEMA IF EXISTS PG_VS CASCADE");
});

test("the ETL layer's driver registration matches the guide's settings.cfg, newline-terminated", () => {
  const cfg = jdbcSettingsCfg({ driverName: "POSTGRESQL", prefix: "jdbc:postgresql:", mainClass: "org.postgresql.Driver", jar: "postgresql-42.7.13.jar" });
  assert.equal(cfg, "DRIVERNAME=POSTGRESQL\nPREFIX=jdbc:postgresql:\nDRIVERMAIN=org.postgresql.Driver\nFETCHSIZE=100000\nINSERTSIZE=-1\nJAR=postgresql-42.7.13.jar\n");
  assert.equal(jdbcPrefix("jdbc:postgresql://h:5432/db"), "jdbc:postgresql:");
  assert.equal(jdbcPrefix("jdbc:sqlserver://h:1433;databaseName=x"), "jdbc:sqlserver:");
  assert.equal(jdbcPrefix("JDBC:EXA:host:8563"), "jdbc:exa:");
  assert.throws(() => jdbcPrefix("postgresql://h/db"), /not a JDBC URL/);
});
