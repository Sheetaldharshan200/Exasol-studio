import { JAVA_ADAPTER_CLASS, type VsAdapter } from "../types.ts";

/**
 * Exasol (JDBC) through Exasol's JDBC virtual schema adapter (exasol/exasol-virtual-schema).
 * Guide: https://github.com/exasol/exasol-virtual-schema/blob/main/doc/dialects/exasol.md
 */
export const ExasolAdapter: VsAdapter = {
  id: "exasol",
  name: "Exasol (JDBC)",
  kind: "jdbc",
  runtime: "java",
  repo: "exasol/exasol-virtual-schema",
  docs: "https://github.com/exasol/exasol-virtual-schema/blob/main/doc/dialects/exasol.md",
  release: { tag: "9.0.4", asset: "^virtual-schema-dist-[\\d.]+-exasol-[\\d.]+\\.jar$" },
  scriptClass: JAVA_ADAPTER_CLASS,
  driver: { name: "EXASOL", class: "com.exasol.jdbc.EXADriver", source: { maven: "com.exasol:exasol-jdbc" } },
  fields: [
    { key: "host", label: "Host", kind: "text", placeholder: "db.example.com", required: true },
    { key: "port", label: "Port", kind: "number", required: true, default: "8563" },
    { key: "schema", label: "Schema to attach", kind: "text", placeholder: "RETAIL", required: true },
    { key: "user", label: "User", kind: "text", required: true },
    { key: "password", label: "Password", kind: "password", required: true },
  ],
  connection: (v) => ({ to: `jdbc:exa:${v.host}:${v.port}`, user: v.user, password: v.password }),
  properties: (v) => ({ SCHEMA_NAME: v.schema }),
  prove: "select",
  note:
    "Reads through JDBC. For bulk loads the adapter can instead use Exasol's parallel IMPORT FROM EXA — set IMPORT_FROM_EXA = 'true' with an EXA_CONNECTION; see the guide. The Lua variant does that natively.",
};
