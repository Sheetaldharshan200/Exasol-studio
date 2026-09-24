import { JAVA_ADAPTER_CLASS, type VsAdapter } from "../types.ts";

/**
 * SAP ASE (Sybase) through Exasol's JDBC virtual schema adapter (exasol/sybase-virtual-schema).
 * Guide: https://github.com/exasol/sybase-virtual-schema/blob/main/doc/user_guide/sybase_user_guide.md
 */
export const SybaseAdapter: VsAdapter = {
  id: "sybase",
  name: "SAP ASE (Sybase)",
  kind: "jdbc",
  runtime: "java",
  repo: "exasol/sybase-virtual-schema",
  docs: "https://github.com/exasol/sybase-virtual-schema/blob/main/doc/user_guide/sybase_user_guide.md",
  release: { asset: "^virtual-schema-dist-[\\d.]+-sybase-[\\d.]+\\.jar$" },
  scriptClass: JAVA_ADAPTER_CLASS,
  driver: { name: "SYBASE", class: "com.sybase.jdbc4.jdbc.SybDriver", source: { manualUrl: "https://help.sap.com/docs/SAP_ASE_SDK" } },
  fields: [
    { key: "host", label: "Host", kind: "text", placeholder: "db.example.com", required: true },
    { key: "port", label: "Port", kind: "number", required: true, default: "5000" },
    { key: "database", label: "Database", kind: "text", placeholder: "pubs2", required: true },
    { key: "schema", label: "Schema to attach", kind: "text", placeholder: "dbo", required: true, default: "dbo" },
    { key: "user", label: "User", kind: "text", required: true },
    { key: "password", label: "Password", kind: "password", required: true },
  ],
  connection: (v) => ({ to: `jdbc:sybase:Tds:${v.host}:${v.port}/${v.database}`, user: v.user, password: v.password }),
  properties: (v) => ({ CATALOG_NAME: v.database, SCHEMA_NAME: v.schema }),
  prove: "select",
  note:
    "The jConnect driver ships with the SAP ASE SDK and is not redistributable — supply the JAR when asked.",
};
