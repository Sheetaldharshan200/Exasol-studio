import { test } from "node:test";
import assert from "node:assert/strict";
import { VS_ADAPTERS, adapterById, adapterForScript } from "./index.ts";

/**
 * The non-archived `*-virtual-schema` repositories under github.com/exasol
 * on 2026-09-21 (`gh api search/repositories?q=org:exasol+virtual-schema`),
 * minus the libraries that are not adapters (virtual-schema-common-*,
 * virtual-schemas, document-virtual-schema-spec, edml-java,
 * row-level-security-lua, udf-debugging-java, virtual-schema-shared-integration-tests).
 * If upstream adds or archives an adapter, this list is what changes — and
 * the test below is what tells you the catalog has drifted from it.
 */
const UPSTREAM_ADAPTER_REPOS = [
  "exasol/athena-virtual-schema",
  "exasol/azure-blob-storage-document-files-virtual-schema",
  "exasol/azure-data-lake-storage-gen2-document-files-virtual-schema",
  "exasol/bigquery-virtual-schema",
  "exasol/bucketfs-document-files-virtual-schema",
  "exasol/databricks-virtual-schema",
  "exasol/db2-virtual-schema",
  "exasol/dynamodb-virtual-schema",
  "exasol/elasticsearch-virtual-schema",
  "exasol/exasol-virtual-schema",
  "exasol/exasol-virtual-schema-lua",
  "exasol/google-cloud-storage-document-files-virtual-schema",
  "exasol/hana-virtual-schema",
  "exasol/hive-virtual-schema",
  "exasol/impala-virtual-schema",
  "exasol/mysql-virtual-schema",
  "exasol/oracle-virtual-schema",
  "exasol/postgresql-virtual-schema",
  "exasol/redshift-virtual-schema",
  "exasol/s3-document-files-virtual-schema",
  "exasol/snowflake-virtual-schema",
  "exasol/sqlserver-virtual-schema",
  "exasol/sybase-virtual-schema",
];

test("every published adapter is in the catalog exactly once, and nothing else is", () => {
  const repos = VS_ADAPTERS.map((a) => a.repo).sort();
  assert.deepEqual(repos, [...UPSTREAM_ADAPTER_REPOS].sort());
  const ids = VS_ADAPTERS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, "adapter ids must be unique");
  for (const a of VS_ADAPTERS) assert.equal(adapterById(a.id), a);
});

test("an entry carries what the flow needs, and nothing that must be guessed", () => {
  for (const a of VS_ADAPTERS) {
    assert.ok(a.docs.startsWith("https://"), `${a.id}: docs link`);
    assert.ok(a.release.tag && a.release.asset, `${a.id}: pinned release`);
    assert.doesNotThrow(() => new RegExp(a.release.asset), `${a.id}: asset pattern is a regex`);
    assert.ok(a.fields.length > 0, `${a.id}: asks for something`);
    const keys = a.fields.map((f) => f.key);
    assert.equal(new Set(keys).size, keys.length, `${a.id}: field keys unique`);
    assert.ok(["listTables", "select"].includes(a.prove), `${a.id}: proof step`);
    if (a.runtime === "java") {
      assert.ok(a.scriptClass, `${a.id}: Java adapters name their %scriptclass`);
      assert.match(a.release.asset, /\\.jar\$$/, `${a.id}: Java adapters ship a JAR`);
    } else {
      assert.match(a.release.asset, /\\.lua\$$/, `${a.id}: Lua adapters ship a .lua`);
    }
    if (a.kind === "document") {
      assert.ok(a.importUdf?.name && a.importUdf.scriptClass, `${a.id}: document adapters need their import UDF`);
    }
  }
});

test("a JDBC adapter either fetches its driver or says the user must supply it — never neither", () => {
  for (const a of VS_ADAPTERS.filter((x) => x.kind === "jdbc")) {
    assert.ok(a.driver, `${a.id}: JDBC adapters name a driver`);
    const src = a.driver!.source;
    const hasMaven = typeof src.maven === "string" && src.maven.includes(":");
    const hasManual = typeof src.manualUrl === "string" && src.manualUrl.startsWith("https://");
    assert.ok(hasMaven !== hasManual, `${a.id}: exactly one driver source`);
  }
  for (const a of VS_ADAPTERS.filter((x) => x.kind !== "jdbc")) {
    assert.equal(a.driver, undefined, `${a.id}: no JDBC driver for a non-JDBC adapter`);
  }
});

test("a password never leaks into the connection target or the schema properties", () => {
  for (const a of VS_ADAPTERS) {
    // Fill every field with a distinctive value so a leak is visible.
    const values = Object.fromEntries(a.fields.map((f) => [f.key, f.key === "keyJson" ? '{"type":"service_account"}' : `<${f.key}>`]));
    const conn = a.connection(values);
    const props = a.properties(values);
    for (const secret of a.fields.filter((f) => f.kind === "password").map((f) => `<${f.key}>`)) {
      assert.ok(!conn.to.includes(secret), `${a.id}: secret in TO`);
      for (const v of Object.values(props)) assert.ok(!v.includes(secret), `${a.id}: secret in WITH`);
    }
    // Document adapters carry credentials as JSON in IDENTIFIED BY and nothing in TO/USER.
    if (a.kind === "document") {
      assert.equal(conn.to, "", `${a.id}: TO must be empty`);
      assert.doesNotThrow(() => JSON.parse(conn.password ?? ""), `${a.id}: IDENTIFIED BY is JSON`);
    }
  }
});

test("adapterForScript names the source behind an existing schema, case-folded like Exasol", () => {
  assert.equal(adapterForScript("ADAPTER.POSTGRESQL_JDBC_ADAPTER")?.id, "postgresql");
  assert.equal(adapterForScript("adapter.snowflake_adapter")?.id, "snowflake");
  assert.equal(adapterForScript("ADAPTER.S3_FILES_ADAPTER")?.id, "s3");
  assert.equal(adapterForScript("VS.AZURE_DATA_LAKE_FILES")?.id, "azure-data-lake");
  assert.equal(adapterForScript("ADAPTER.JDBC_ADAPTER"), undefined, "a generic name matches nothing");
  assert.equal(adapterForScript(null), undefined);
});
