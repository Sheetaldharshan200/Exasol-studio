import { JAVA_ADAPTER_CLASS, type VsAdapter } from "../types.ts";

/**
 * Apache Hive through Exasol's JDBC virtual schema adapter (exasol/hive-virtual-schema).
 * Guide: https://github.com/exasol/hive-virtual-schema/blob/main/doc/user_guide/hive_user_guide.md
 */
export const HiveAdapter: VsAdapter = {
  id: "hive",
  name: "Apache Hive",
  kind: "jdbc",
  runtime: "java",
  logo: "apachehive",
  repo: "exasol/hive-virtual-schema",
  docs: "https://github.com/exasol/hive-virtual-schema/blob/main/doc/user_guide/hive_user_guide.md",
  release: { tag: "4.0.1", asset: "^virtual-schema-dist-[\\d.]+-hive-[\\d.]+\\.jar$" },
  scriptClass: JAVA_ADAPTER_CLASS,
  driver: { name: "HIVE", class: "org.apache.hive.jdbc.HiveDriver", source: { maven: "org.apache.hive:hive-jdbc" } },
  fields: [
    { key: "host", label: "Host", kind: "text", placeholder: "db.example.com", required: true },
    { key: "port", label: "Port", kind: "number", required: true, default: "10000" },
    { key: "database", label: "Database to attach", kind: "text", placeholder: "default", required: true, default: "default" },
    { key: "user", label: "User", kind: "text", required: true },
    { key: "password", label: "Password", kind: "password", required: true },
  ],
  connection: (v) => ({ to: `jdbc:hive2://${v.host}:${v.port}/${v.database}`, user: v.user, password: v.password }),
  properties: (v) => ({ SCHEMA_NAME: v.database }),
  prove: "select",
};
