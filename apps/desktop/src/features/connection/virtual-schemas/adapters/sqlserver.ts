import { JAVA_ADAPTER_CLASS, type VsAdapter } from "../types.ts";

/**
 * Microsoft SQL Server through Exasol's JDBC virtual schema adapter (exasol/sqlserver-virtual-schema).
 * Guide: https://github.com/exasol/sqlserver-virtual-schema/blob/main/doc/user_guide/sqlserver_user_guide.md
 */
export const SqlserverAdapter: VsAdapter = {
  id: "sqlserver",
  name: "Microsoft SQL Server",
  kind: "jdbc",
  runtime: "java",
  logo: "microsoftsqlserver",
  repo: "exasol/sqlserver-virtual-schema",
  docs: "https://github.com/exasol/sqlserver-virtual-schema/blob/main/doc/user_guide/sqlserver_user_guide.md",
  release: { tag: "3.0.1", asset: "^virtual-schema-dist-[\\d.]+-sqlserver-[\\d.]+\\.jar$" },
  scriptClass: JAVA_ADAPTER_CLASS,
  driver: { name: "SQLSERVER", class: "com.microsoft.sqlserver.jdbc.SQLServerDriver", source: { maven: "com.microsoft.sqlserver:mssql-jdbc" } },
  fields: [
    { key: "host", label: "Host", kind: "text", placeholder: "db.example.com", required: true },
    { key: "port", label: "Port", kind: "number", required: true, default: "1433" },
    { key: "database", label: "Database", kind: "text", placeholder: "AdventureWorks", required: true },
    { key: "user", label: "User", kind: "text", required: true },
    { key: "password", label: "Password", kind: "password", required: true },
    { key: "schema", label: "Schema to attach", kind: "text", placeholder: "dbo", required: true, default: "dbo" },
  ],
  connection: (v) => ({ to: `jdbc:sqlserver://${v.host}:${v.port};databaseName=${v.database}`, user: v.user, password: v.password }),
  properties: (v) => ({ CATALOG_NAME: v.database, SCHEMA_NAME: v.schema }),
  prove: "select",
};
