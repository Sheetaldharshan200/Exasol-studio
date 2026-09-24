import { JAVA_ADAPTER_CLASS, type VsAdapter } from "../types.ts";

/**
 * SAP HANA through Exasol's JDBC virtual schema adapter (exasol/hana-virtual-schema).
 * Guide: https://github.com/exasol/hana-virtual-schema/blob/main/doc/user_guide/hana_user_guide.md
 */
export const HanaAdapter: VsAdapter = {
  id: "hana",
  name: "SAP HANA",
  kind: "jdbc",
  runtime: "java",
  logo: "sap",
  repo: "exasol/hana-virtual-schema",
  docs: "https://github.com/exasol/hana-virtual-schema/blob/main/doc/user_guide/hana_user_guide.md",
  release: { asset: "^virtual-schema-dist-[\\d.]+-hana-[\\d.]+\\.jar$" },
  scriptClass: JAVA_ADAPTER_CLASS,
  driver: { name: "HANA", class: "com.sap.db.jdbc.Driver", source: { maven: "com.sap.cloud.db.jdbc:ngdbc" } },
  fields: [
    { key: "host", label: "Host", kind: "text", placeholder: "db.example.com", required: true },
    { key: "port", label: "Port", kind: "number", required: true, default: "39015" },
    { key: "schema", label: "Schema to attach", kind: "text", placeholder: "SYSTEM", required: true },
    { key: "user", label: "User", kind: "text", required: true },
    { key: "password", label: "Password", kind: "password", required: true },
  ],
  connection: (v) => ({ to: `jdbc:sap://${v.host}:${v.port}`, user: v.user, password: v.password }),
  properties: (v) => ({ SCHEMA_NAME: v.schema }),
  prove: "select",
};
