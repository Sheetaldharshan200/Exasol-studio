import { JAVA_ADAPTER_CLASS, type VsAdapter } from "../types.ts";

/**
 * Amazon Redshift through Exasol's JDBC virtual schema adapter (exasol/redshift-virtual-schema).
 * Guide: https://github.com/exasol/redshift-virtual-schema/blob/main/doc/user_guide/redshift_user_guide.md
 */
export const RedshiftAdapter: VsAdapter = {
  id: "redshift",
  name: "Amazon Redshift",
  kind: "jdbc",
  runtime: "java",
  logo: "amazonredshift",
  repo: "exasol/redshift-virtual-schema",
  docs: "https://github.com/exasol/redshift-virtual-schema/blob/main/doc/user_guide/redshift_user_guide.md",
  release: { tag: "4.0.0", asset: "^virtual-schema-dist-[\\d.]+-redshift-[\\d.]+\\.jar$" },
  scriptClass: JAVA_ADAPTER_CLASS,
  driver: { name: "REDSHIFT", class: "com.amazon.redshift.jdbc42.Driver", source: { maven: "com.amazon.redshift:redshift-jdbc42" } },
  fields: [
    { key: "host", label: "Cluster endpoint", kind: "text", placeholder: "cluster.abc123.eu-central-1.redshift.amazonaws.com", required: true },
    { key: "port", label: "Port", kind: "number", required: true, default: "5439" },
    { key: "database", label: "Database", kind: "text", placeholder: "dev", required: true },
    { key: "schema", label: "Schema to attach", kind: "text", placeholder: "public", required: true, default: "public" },
    { key: "user", label: "User", kind: "text", required: true },
    { key: "password", label: "Password", kind: "password", required: true },
  ],
  connection: (v) => ({ to: `jdbc:redshift://${v.host}:${v.port}/${v.database}`, user: v.user, password: v.password }),
  properties: (v) => ({ CATALOG_NAME: v.database, SCHEMA_NAME: v.schema }),
  prove: "select",
};
