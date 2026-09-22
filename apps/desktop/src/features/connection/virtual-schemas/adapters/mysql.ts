import { JAVA_ADAPTER_CLASS, type VsAdapter } from "../types.ts";

/**
 * MySQL through Exasol's JDBC virtual schema adapter (exasol/mysql-virtual-schema).
 * Guide: https://github.com/exasol/mysql-virtual-schema/blob/main/doc/user_guide/mysql_user_guide.md
 */
export const MysqlAdapter: VsAdapter = {
  id: "mysql",
  name: "MySQL",
  kind: "jdbc",
  runtime: "java",
  logo: "mysql",
  repo: "exasol/mysql-virtual-schema",
  docs: "https://github.com/exasol/mysql-virtual-schema/blob/main/doc/user_guide/mysql_user_guide.md",
  release: { tag: "6.0.3", asset: "^virtual-schema-dist-[\\d.]+-mysql-[\\d.]+\\.jar$" },
  scriptClass: JAVA_ADAPTER_CLASS,
  driver: { name: "MYSQL", class: "com.mysql.cj.jdbc.Driver", source: { maven: "com.mysql:mysql-connector-j" } },
  fields: [
    { key: "host", label: "Host", kind: "text", placeholder: "db.example.com", required: true },
    { key: "port", label: "Port", kind: "number", required: true, default: "3306" },
    { key: "database", label: "Database", kind: "text", placeholder: "shop", required: true, help: "MySQL's database is the catalog the schema is attached from." },
    { key: "user", label: "User", kind: "text", required: true },
    { key: "password", label: "Password", kind: "password", required: true },
  ],
  connection: (v) => ({ to: `jdbc:mysql://${v.host}:${v.port}/`, user: v.user, password: v.password }),
  properties: (v) => ({ CATALOG_NAME: v.database }),
  prove: "select",
};
