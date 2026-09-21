import { test } from "node:test";
import assert from "node:assert/strict";
import { adapterScriptName, driverFileName, missingPrerequisites, type PrereqProbe } from "./prereqs.ts";
import { PostgresqlAdapter } from "./adapters/postgresql.ts";
import { BigqueryAdapter } from "./adapters/bigquery.ts";
import { S3Adapter } from "./adapters/s3.ts";
import { DatabricksAdapter } from "./adapters/databricks.ts";

const empty: PrereqProbe = { adapterScripts: [], udfScripts: [], bucketFiles: [], connections: [] };
const kinds = (list: { kind: string }[]) => list.map((p) => p.kind);

test("nothing installed: artifacts first, then the scripts that reference them", () => {
  assert.deepEqual(kinds(missingPrerequisites(PostgresqlAdapter, empty)), ["adapterArtifact", "driverJar", "adapterScript"]);
  const [artifact, driver] = missingPrerequisites(PostgresqlAdapter, empty);
  assert.equal(artifact.kind, "adapterArtifact");
  assert.equal(driver.kind === "driverJar" && driver.source, "maven");
});

test("a driver already in BucketFS but no adapter script: only what is missing", () => {
  const probe: PrereqProbe = { ...empty, bucketFiles: ["/buckets/bfsdefault/default/drivers/jdbc/postgresql.jar", "virtual-schema-dist-14.0.5-postgresql-4.0.2.jar"] };
  assert.deepEqual(kinds(missingPrerequisites(PostgresqlAdapter, probe)), ["adapterScript"]);
});

test("the probe's names are matched the way Exasol folds them", () => {
  const probe: PrereqProbe = {
    ...empty,
    bucketFiles: ["postgresql.jar", "virtual-schema-dist-14.0.5-postgresql-4.0.2.jar"],
    adapterScripts: [{ schema: "adapter", name: "postgresql_adapter" }],
  };
  assert.deepEqual(missingPrerequisites(PostgresqlAdapter, probe), [], "lower-case rows from a mock probe still satisfy the plan");
  assert.equal(adapterScriptName(PostgresqlAdapter), "POSTGRESQL_ADAPTER");
  assert.equal(adapterScriptName(S3Adapter), "S3_ADAPTER");
});

test("a user-supplied driver is missing until its JAR is in BucketFS", () => {
  assert.equal(driverFileName(BigqueryAdapter), undefined, "no Maven coordinates to derive a name from");
  const first = missingPrerequisites(BigqueryAdapter, empty);
  const driver = first.find((p) => p.kind === "driverJar");
  assert.ok(driver && driver.kind === "driverJar" && driver.source === "user" && driver.manualUrl?.startsWith("https://"));
  const uploaded: PrereqProbe = { ...empty, bucketFiles: ["GoogleBigQueryJDBC42.jar", "virtual-schema-dist-14.0.4-bigquery-4.0.1.jar"] };
  assert.deepEqual(kinds(missingPrerequisites(BigqueryAdapter, uploaded, { userDriverFile: "GoogleBigQueryJDBC42.jar" })), ["adapterScript"]);
  assert.ok(kinds(missingPrerequisites(BigqueryAdapter, uploaded)).includes("driverJar"), "without naming the file it is not assumed present");
});

test("document adapters also need their import UDF; Lua adapters need no artifact in BucketFS", () => {
  assert.deepEqual(kinds(missingPrerequisites(S3Adapter, empty)), ["adapterArtifact", "adapterScript", "importUdf"]);
  const withScripts: PrereqProbe = {
    ...empty,
    bucketFiles: ["document-files-virtual-schema-dist-9.1.0-s3-4.1.1.jar"],
    adapterScripts: [{ schema: "ADAPTER", name: "S3_ADAPTER" }],
    udfScripts: [{ schema: "ADAPTER", name: "IMPORT_FROM_S3_DOCUMENT_FILES" }],
  };
  assert.deepEqual(missingPrerequisites(S3Adapter, withScripts), []);
  // Databricks is Lua (source inlined) but still a JDBC pushdown: driver yes, artifact no.
  assert.deepEqual(kinds(missingPrerequisites(DatabricksAdapter, empty)), ["driverJar", "adapterScript"]);
});

test("everything present means nothing to do, and a different adapter schema is honoured", () => {
  const probe: PrereqProbe = {
    ...empty,
    bucketFiles: ["postgresql.jar", "virtual-schema-dist-14.0.5-postgresql-4.0.2.jar"],
    adapterScripts: [{ schema: "VS", name: "POSTGRESQL_ADAPTER" }],
  };
  assert.deepEqual(missingPrerequisites(PostgresqlAdapter, probe, { schema: "vs" }), []);
  assert.deepEqual(kinds(missingPrerequisites(PostgresqlAdapter, probe)), ["adapterScript"], "the default ADAPTER schema has no script");
});
