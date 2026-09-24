import { JAVA_ADAPTER_CLASS, type VsAdapter } from "../types.ts";

/**
 * IBM Db2 through Exasol's JDBC virtual schema adapter (exasol/db2-virtual-schema).
 * Guide: https://github.com/exasol/db2-virtual-schema/blob/main/doc/user_guide/db2_user_guide.md
 */
export const Db2Adapter: VsAdapter = {
  id: "db2",
  name: "IBM Db2",
  kind: "jdbc",
  runtime: "java",
  repo: "exasol/db2-virtual-schema",
  docs: "https://github.com/exasol/db2-virtual-schema/blob/main/doc/user_guide/db2_user_guide.md",
  release: { asset: "^virtual-schema-dist-[\\d.]+-db2-[\\d.]+\\.jar$" },
  scriptClass: JAVA_ADAPTER_CLASS,
  driver: { name: "DB2", class: "com.ibm.db2.jcc.DB2Driver", source: { maven: "com.ibm.db2:jcc" } },
  fields: [
    { key: "host", label: "Host", kind: "text", placeholder: "db.example.com", required: true },
    { key: "port", label: "Port", kind: "number", required: true, default: "50000" },
    { key: "database", label: "Database", kind: "text", placeholder: "SAMPLE", required: true },
    { key: "schema", label: "Schema to attach", kind: "text", placeholder: "DB2INST1", required: true },
    { key: "user", label: "User", kind: "text", required: true },
    { key: "password", label: "Password", kind: "password", required: true },
  ],
  connection: (v) => ({ to: `jdbc:db2://${v.host}:${v.port}/${v.database}`, user: v.user, password: v.password }),
  properties: (v) => ({ SCHEMA_NAME: v.schema }),
  prove: "select",
};
