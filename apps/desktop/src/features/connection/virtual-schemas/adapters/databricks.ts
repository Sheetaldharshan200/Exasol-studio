import type { VsAdapter } from "../types.ts";

/**
 * Databricks through Exasol's Lua virtual schema adapter (exasol/databricks-virtual-schema).
 * Lua adapters are not JARs: the released `.lua` file is inlined into
 * `CREATE LUA ADAPTER SCRIPT`, so nothing goes to BucketFS for the adapter
 * itself. Pushdown still runs `IMPORT FROM JDBC`, so the Databricks JDBC
 * driver must be installed in Exasol's JDBC driver location.
 * Guide: https://github.com/exasol/databricks-virtual-schema/blob/main/doc/user_guide/user_guide.md
 */
export const DatabricksAdapter: VsAdapter = {
  id: "databricks",
  name: "Databricks",
  kind: "jdbc",
  runtime: "lua",
  logo: "databricks",
  repo: "exasol/databricks-virtual-schema",
  docs: "https://github.com/exasol/databricks-virtual-schema/blob/main/doc/user_guide/user_guide.md",
  release: { tag: "1.0.2", asset: "^databricks-virtual-schema-dist-[\\d.]+\\.lua$" },
  driver: {
    name: "DATABRICKS",
    class: "com.databricks.client.jdbc.Driver",
    source: { manualUrl: "https://www.databricks.com/spark/jdbc-drivers-download" },
  },
  fields: [
    { key: "host", label: "Workspace host", kind: "text", placeholder: "adb-1234567890123456.7.azuredatabricks.net", required: true },
    { key: "httpPath", label: "HTTP path", kind: "text", placeholder: "/sql/1.0/warehouses/abcdef1234567890", required: true, help: "From the SQL warehouse's connection details." },
    { key: "token", label: "Personal access token", kind: "password", required: true },
    { key: "catalog", label: "Catalog", kind: "text", placeholder: "main", required: true },
    { key: "schema", label: "Schema to attach", kind: "text", placeholder: "default", required: true, default: "default" },
  ],
  connection: (v) => ({
    to: `jdbc:databricks://${v.host}:443;httpPath=${v.httpPath};AuthMech=3`,
    user: "token",
    password: v.token,
  }),
  properties: (v) => ({ CATALOG_NAME: v.catalog, SCHEMA_NAME: v.schema }),
  prove: "select",
  note: "The Databricks JDBC driver is not redistributable — download it from Databricks and supply the JAR when asked.",
};
