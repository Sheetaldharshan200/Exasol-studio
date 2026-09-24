import { JAVA_ADAPTER_CLASS, type VsAdapter } from "../types.ts";

/**
 * Elasticsearch through Exasol's JDBC virtual schema adapter (exasol/elasticsearch-virtual-schema).
 * Guide: https://github.com/exasol/elasticsearch-virtual-schema/blob/main/doc/user_guide/elasticsearch_sql_user_guide.md
 */
export const ElasticsearchAdapter: VsAdapter = {
  id: "elasticsearch",
  name: "Elasticsearch",
  kind: "jdbc",
  runtime: "java",
  logo: "elasticsearch",
  repo: "exasol/elasticsearch-virtual-schema",
  docs: "https://github.com/exasol/elasticsearch-virtual-schema/blob/main/doc/user_guide/elasticsearch_sql_user_guide.md",
  release: { asset: "^virtual-schema-dist-[\\d.]+-elasticsearch-[\\d.]+\\.jar$" },
  scriptClass: JAVA_ADAPTER_CLASS,
  driver: { name: "ELASTICSEARCH", class: "org.elasticsearch.xpack.sql.jdbc.EsDriver", source: { maven: "org.elasticsearch.plugin:x-pack-sql-jdbc" } },
  fields: [
    { key: "host", label: "Host", kind: "text", placeholder: "db.example.com", required: true },
    { key: "port", label: "Port", kind: "number", required: true, default: "9200" },
    { key: "user", label: "User", kind: "text", required: true },
    { key: "password", label: "Password", kind: "password", required: true },
  ],
  connection: (v) => ({ to: `jdbc:es://${v.host}:${v.port}`, user: v.user, password: v.password }),
  properties: (v) => ({}),
  prove: "select",
  note:
    "Uses Elasticsearch SQL over its JDBC driver, which needs a Platinum or Enterprise licence (or a trial) on the cluster.",
};
