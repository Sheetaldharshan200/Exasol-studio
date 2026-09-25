import { JAVA_ADAPTER_CLASS, type VsAdapter } from "../types.ts";

/**
 * PostgreSQL through Exasol's JDBC virtual schema adapter (exasol/postgresql-virtual-schema).
 * Guide: https://github.com/exasol/postgresql-virtual-schema/blob/main/doc/user_guide/postgresql_user_guide.md
 */
export const PostgresqlAdapter: VsAdapter = {
  id: "postgresql",
  name: "PostgreSQL",
  kind: "jdbc",
  runtime: "java",
  logo: "postgresql",
  repo: "exasol/postgresql-virtual-schema",
  docs: "https://github.com/exasol/postgresql-virtual-schema/blob/main/doc/user_guide/postgresql_user_guide.md",
  release: { asset: "^virtual-schema-dist-[\\d.]+-postgresql-[\\d.]+\\.jar$" },
  scriptClass: JAVA_ADAPTER_CLASS,
  driver: { name: "POSTGRESQL", class: "org.postgresql.Driver", source: { maven: "org.postgresql:postgresql" } },
  fields: [
    { key: "host", label: "Host", kind: "text", placeholder: "db.example.com", required: true },
    { key: "port", label: "Port", kind: "number", required: true, default: "5432" },
    { key: "database", label: "Database", kind: "text", placeholder: "postgres", required: true },
    { key: "user", label: "User", kind: "text", required: true },
    { key: "password", label: "Password", kind: "password", required: true },
    { key: "schema", label: "Schema to attach", kind: "text", placeholder: "public", required: true, default: "public" },
  ],
  connection: (v) => ({ to: `jdbc:postgresql://${v.host}:${v.port}/${v.database}`, user: v.user, password: v.password }),
  properties: (v) => ({ SCHEMA_NAME: v.schema }),
  prove: "select",
  note:
    "PostgreSQL folds unquoted identifiers to lowercase while Exasol folds to UPPERCASE; tables created with quoted upper-case names in PostgreSQL need the adapter property IGNORE_ERRORS = 'POSTGRESQL_UPPERCASE_TABLES'.",
};
