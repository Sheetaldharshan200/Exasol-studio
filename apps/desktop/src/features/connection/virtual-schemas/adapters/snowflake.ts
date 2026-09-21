import { JAVA_ADAPTER_CLASS, type VsAdapter } from "../types.ts";

/**
 * Snowflake through Exasol's JDBC virtual schema adapter (exasol/snowflake-virtual-schema).
 * Guide: https://github.com/exasol/snowflake-virtual-schema/blob/main/doc/user_guide/snowflake_user_guide.md
 */
export const SnowflakeAdapter: VsAdapter = {
  id: "snowflake",
  name: "Snowflake",
  kind: "jdbc",
  runtime: "java",
  logo: "snowflake",
  repo: "exasol/snowflake-virtual-schema",
  docs: "https://github.com/exasol/snowflake-virtual-schema/blob/main/doc/user_guide/snowflake_user_guide.md",
  release: { tag: "1.0.1", asset: "^virtual-schema-dist-[\\d.]+-snowflake-[\\d.]+\\.jar$" },
  scriptClass: JAVA_ADAPTER_CLASS,
  driver: { name: "SNOWFLAKE", class: "net.snowflake.client.jdbc.SnowflakeDriver", source: { maven: "net.snowflake:snowflake-jdbc" } },
  fields: [
    { key: "account", label: "Account identifier", kind: "text", placeholder: "xy12345.eu-central-1", required: true, help: "The part before .snowflakecomputing.com." },
    { key: "database", label: "Database", kind: "text", placeholder: "ANALYTICS", required: true },
    { key: "schema", label: "Schema to attach", kind: "text", placeholder: "PUBLIC", required: true, default: "PUBLIC" },
    { key: "warehouse", label: "Warehouse", kind: "text", placeholder: "COMPUTE_WH" },
    { key: "user", label: "User", kind: "text", required: true },
    { key: "password", label: "Password", kind: "password", required: true },
  ],
  connection: (v) => ({ to: `jdbc:snowflake://${v.account}.snowflakecomputing.com/?db=${v.database}${v.warehouse ? `&warehouse=${v.warehouse}` : ""}`, user: v.user, password: v.password }),
  properties: (v) => ({ CATALOG_NAME: v.database, SCHEMA_NAME: v.schema }),
  prove: "select",
};
