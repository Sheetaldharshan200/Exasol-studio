import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan, defaultNames, needsScriptInstall, pointsAtLocalhost, readyToCreate } from "./plan.ts";
import { adapterById } from "./adapters/index.ts";
import { missingPrerequisites } from "./prereqs.ts";
import { PostgresqlAdapter } from "./adapters/postgresql.ts";
import { S3Adapter } from "./adapters/s3.ts";
import { DatabricksAdapter } from "./adapters/databricks.ts";

const pgValues = { host: "db.example.com", port: "5432", database: "shop", user: "app", password: "s3cret", schema: "public" };

test("default names derive from the adapter id and fold cleanly", () => {
  assert.deepEqual(defaultNames(PostgresqlAdapter), { virtualSchema: "POSTGRESQL_VS", connection: "POSTGRESQL_CONN", adapterSchema: "ADAPTER" });
  assert.equal(defaultNames(S3Adapter).virtualSchema, "S3_VS");
});

test("a JDBC plan is connection → adapter script → virtual schema, and the password appears once, redacted in display", () => {
  const plan = buildPlan(PostgresqlAdapter, pgValues, defaultNames(PostgresqlAdapter), { adapterAsset: "virtual-schema-dist-14.0.5-postgresql-4.0.2.jar", driverFile: "postgresql-42.7.13.jar" });
  assert.deepEqual(plan.map((s) => s.id), ["connection", "adapterScript", "virtualSchema"]);
  assert.ok(plan[0].sql.includes("IDENTIFIED BY 's3cret'"), "the real password goes to the database");
  assert.ok(!plan[0].display.includes("s3cret"), "…but never to a log or the history display");
  for (const step of plan.slice(1)) assert.ok(!step.sql.includes("s3cret"), `${step.id} must not carry the password`);
  assert.ok(plan[1].sql.includes("%jar /buckets/bfsdefault/default/vs/postgresql-42.7.13.jar;"));
  assert.ok(!plan[1].sql.trimEnd().endsWith("/"), "no exaplus terminator — statements run one at a time");
  assert.ok(plan[2].sql.includes("USING ADAPTER.POSTGRESQL_ADAPTER") && plan[2].sql.includes("CONNECTION_NAME = 'POSTGRESQL_CONN'"));
});

test("a document plan adds the import UDF between the script and the schema", () => {
  const plan = buildPlan(S3Adapter, { bucket: "b", region: "eu-central-1", accessKey: "AK", secretKey: "SK", mapping: "{}" }, defaultNames(S3Adapter), { adapterAsset: "document-files-virtual-schema-dist-9.1.0-s3-4.1.1.jar" });
  assert.deepEqual(plan.map((s) => s.id), ["connection", "adapterScript", "importUdf", "virtualSchema"]);
  assert.ok(plan[2].sql.startsWith("CREATE OR REPLACE JAVA SET SCRIPT ADAPTER.IMPORT_FROM_S3_DOCUMENT_FILES("));
});

test("a Lua plan inlines the staged source and references no JAR", () => {
  const plan = buildPlan(DatabricksAdapter, { host: "h", httpPath: "/p", token: "t", catalog: "main", schema: "default" }, defaultNames(DatabricksAdapter), { adapterAsset: "databricks-virtual-schema-dist-1.0.2.lua", luaSource: "return {}" });
  assert.ok(plan[1].sql.includes("CREATE OR REPLACE LUA ADAPTER SCRIPT ADAPTER.DATABRICKS_ADAPTER AS\nreturn {}"));
  assert.ok(!plan[1].sql.includes("%jar"));
});

test("when the scripts already exist only the connection and schema are created", () => {
  const plan = buildPlan(PostgresqlAdapter, pgValues, defaultNames(PostgresqlAdapter), { adapterAsset: "x.jar", driverFile: "y.jar" }, { installScripts: false });
  assert.deepEqual(plan.map((s) => s.id), ["connection", "virtualSchema"]);
});

test("localhost is flagged: on the managed database it means the runtime, not this computer", () => {
  assert.equal(pointsAtLocalhost({ host: "localhost" }), true);
  assert.equal(pointsAtLocalhost({ host: " 127.0.0.1 " }), true);
  assert.equal(pointsAtLocalhost({ host: "db.example.com" }), false);
  assert.equal(pointsAtLocalhost({}), false, "sources without a host field are not flagged");
});

test("readyToCreate: the managed local database only needs nothing missing or a fresh stage", () => {
  const pg = adapterById("postgresql")!;
  const base = { adapter: pg, managedLocal: true, staged: false, adapterFile: "", driverFile: "" };
  assert.equal(readyToCreate({ ...base, missingCount: 0 }), true);
  assert.equal(readyToCreate({ ...base, missingCount: 2 }), false);
  assert.equal(readyToCreate({ ...base, missingCount: 2, staged: true }), true);
});

test("readyToCreate: a remote database needs the uploaded file names, and a Lua adapter its fetched source", () => {
  const pg = adapterById("postgresql")!;
  const remote = { managedLocal: false, missingCount: 1, staged: false };
  assert.equal(readyToCreate({ ...remote, adapter: pg, adapterFile: "", driverFile: "postgresql.jar" }), false);
  assert.equal(readyToCreate({ ...remote, adapter: pg, adapterFile: "vs-pg.jar", driverFile: "  " }), false, "JDBC adapters need their driver");
  assert.equal(readyToCreate({ ...remote, adapter: pg, adapterFile: "vs-pg.jar", driverFile: "postgresql.jar" }), true);
  const s3 = adapterById("s3")!;
  assert.equal(readyToCreate({ ...remote, adapter: s3, adapterFile: "s3.jar", driverFile: "" }), true, "document adapters have no driver");
  const lua = adapterById("exasol-lua")!;
  assert.equal(readyToCreate({ ...remote, adapter: lua, adapterFile: "", driverFile: "" }), false);
  assert.equal(readyToCreate({ ...remote, adapter: lua, adapterFile: "", driverFile: "", staged: true }), true);
});

test("readyToCreate: a Lua adapter with a JDBC driver (Databricks) needs both the fetched source and the registered driver on a remote database", () => {
  const dbx = adapterById("databricks")!;
  const remote = { adapter: dbx, managedLocal: false, missingCount: 1, adapterFile: "" };
  assert.equal(readyToCreate({ ...remote, staged: true, driverFile: "" }), false);
  assert.equal(readyToCreate({ ...remote, staged: false, driverFile: "DatabricksJDBC42.jar" }), false);
  assert.equal(readyToCreate({ ...remote, staged: true, driverFile: "DatabricksJDBC42.jar" }), true);
});

test("needsScriptInstall: a document adapter whose script exists but whose import UDF is missing still installs scripts", () => {
  const s3 = adapterById("s3")!;
  const probe = {
    adapterScripts: [{ schema: "ADAPTER", name: "S3_ADAPTER" }],
    udfScripts: [],
    bucketFiles: ["vs/document-files-virtual-schema-dist-8.1.7-s3-4.1.1.jar"],
    connections: [],
  };
  const missing = missingPrerequisites(s3, probe, {});
  assert.ok(missing.some((m) => m.kind === "importUdf"), "the UDF is what is missing");
  assert.ok(!missing.some((m) => m.kind === "adapterScript"), "the adapter script is present");
  assert.equal(needsScriptInstall(missing, false), true);
  assert.equal(needsScriptInstall([], false), false, "everything present: leave the scripts alone");
  assert.equal(needsScriptInstall([], true), true, "just staged a new release: the script must point at it");
});
