import { JAVA_ADAPTER_CLASS, type VsAdapter } from "../types.ts";

/**
 * Apache Impala through Exasol's JDBC virtual schema adapter (exasol/impala-virtual-schema).
 * Guide: https://github.com/exasol/impala-virtual-schema/blob/main/doc/user_guide/impala_user_guide.md
 */
export const ImpalaAdapter: VsAdapter = {
  id: "impala",
  name: "Apache Impala",
  kind: "jdbc",
  runtime: "java",
  repo: "exasol/impala-virtual-schema",
  docs: "https://github.com/exasol/impala-virtual-schema/blob/main/doc/user_guide/impala_user_guide.md",
  release: { tag: "4.0.0", asset: "^virtual-schema-dist-[\\d.]+-impala-[\\d.]+\\.jar$" },
  scriptClass: JAVA_ADAPTER_CLASS,
  driver: { name: "IMPALA", class: "com.cloudera.impala.jdbc.Driver", source: { manualUrl: "https://www.cloudera.com/downloads/connectors/impala/jdbc.html" } },
  fields: [
    { key: "host", label: "Host", kind: "text", placeholder: "db.example.com", required: true },
    { key: "port", label: "Port", kind: "number", required: true, default: "21050" },
    { key: "database", label: "Database to attach", kind: "text", placeholder: "default", required: true, default: "default" },
    { key: "user", label: "User", kind: "text", required: true },
    { key: "password", label: "Password", kind: "password", required: true },
  ],
  connection: (v) => ({ to: `jdbc:impala://${v.host}:${v.port}/${v.database}`, user: v.user, password: v.password }),
  properties: (v) => ({ SCHEMA_NAME: v.database }),
  prove: "select",
  note:
    "The Cloudera Impala JDBC driver is not redistributable — download it from Cloudera and supply the JAR when asked.",
};
