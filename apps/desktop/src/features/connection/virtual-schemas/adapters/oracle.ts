import { JAVA_ADAPTER_CLASS, type VsAdapter } from "../types.ts";

/**
 * Oracle through Exasol's JDBC virtual schema adapter (exasol/oracle-virtual-schema).
 * Guide: https://github.com/exasol/oracle-virtual-schema/blob/main/doc/user_guide/oracle_user_guide.md
 */
export const OracleAdapter: VsAdapter = {
  id: "oracle",
  name: "Oracle",
  kind: "jdbc",
  runtime: "java",
  logo: "oracle",
  repo: "exasol/oracle-virtual-schema",
  docs: "https://github.com/exasol/oracle-virtual-schema/blob/main/doc/user_guide/oracle_user_guide.md",
  release: { asset: "^virtual-schema-dist-[\\d.]+-oracle-[\\d.]+\\.jar$" },
  scriptClass: JAVA_ADAPTER_CLASS,
  driver: { name: "ORACLE", class: "oracle.jdbc.OracleDriver", source: { maven: "com.oracle.database.jdbc:ojdbc11" } },
  fields: [
    { key: "host", label: "Host", kind: "text", placeholder: "db.example.com", required: true },
    { key: "port", label: "Port", kind: "number", required: true, default: "1521" },
    { key: "service", label: "Service name", kind: "text", placeholder: "ORCLPDB1", required: true },
    { key: "user", label: "User", kind: "text", required: true },
    { key: "password", label: "Password", kind: "password", required: true },
    { key: "schema", label: "Schema to attach", kind: "text", placeholder: "HR", required: true },
  ],
  connection: (v) => ({ to: `jdbc:oracle:thin:@//${v.host}:${v.port}/${v.service}`, user: v.user, password: v.password }),
  properties: (v) => ({ SCHEMA_NAME: v.schema }),
  prove: "select",
};
