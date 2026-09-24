import type { VsAdapter } from "../types.ts";

/**
 * Exasol → Exasol through the Lua adapter (exasol/exasol-virtual-schema-lua).
 * The released `.lua` file is inlined into `CREATE LUA ADAPTER SCRIPT`; there
 * is no JAR and no JDBC driver. The connection is an Exasol connection
 * (`host:port`), and pushdown uses Exasol's own parallel `IMPORT FROM EXA`,
 * which is why this is the recommended way to attach another Exasol.
 * Guide: https://github.com/exasol/exasol-virtual-schema-lua/blob/main/doc/evsl/user_guide/user_guide.md
 */
export const ExasolLuaAdapter: VsAdapter = {
  id: "exasol-lua",
  name: "Exasol",
  kind: "exasol",
  runtime: "lua",
  repo: "exasol/exasol-virtual-schema-lua",
  docs: "https://github.com/exasol/exasol-virtual-schema-lua/blob/main/doc/evsl/user_guide/user_guide.md",
  release: { asset: "^exasol-virtual-schema-dist-[\\d.]+\\.lua$" },
  fields: [
    { key: "host", label: "Host", kind: "text", placeholder: "other-exasol.example.com", required: true },
    { key: "port", label: "Port", kind: "number", required: true, default: "8563" },
    { key: "user", label: "User", kind: "text", required: true },
    { key: "password", label: "Password", kind: "password", required: true },
    { key: "schema", label: "Schema to attach", kind: "text", placeholder: "RETAIL", required: true },
  ],
  connection: (v) => ({ to: `${v.host}:${v.port}`, user: v.user, password: v.password }),
  properties: (v) => ({ SCHEMA_NAME: v.schema }),
  prove: "select",
};
