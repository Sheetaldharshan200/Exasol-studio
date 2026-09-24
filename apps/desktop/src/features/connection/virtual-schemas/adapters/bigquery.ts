import { JAVA_ADAPTER_CLASS, type VsAdapter } from "../types.ts";

/**
 * Google BigQuery through Exasol's JDBC virtual schema adapter (exasol/bigquery-virtual-schema).
 * Guide: https://github.com/exasol/bigquery-virtual-schema/blob/main/doc/user_guide/bigquery_user_guide.md
 */
export const BigqueryAdapter: VsAdapter = {
  id: "bigquery",
  name: "Google BigQuery",
  kind: "jdbc",
  runtime: "java",
  logo: "googlebigquery",
  repo: "exasol/bigquery-virtual-schema",
  docs: "https://github.com/exasol/bigquery-virtual-schema/blob/main/doc/user_guide/bigquery_user_guide.md",
  release: { asset: "^virtual-schema-dist-[\\d.]+-bigquery-[\\d.]+\\.jar$" },
  scriptClass: JAVA_ADAPTER_CLASS,
  driver: { name: "BIGQUERY", class: "com.simba.googlebigquery.jdbc.Driver", source: { manualUrl: "https://cloud.google.com/bigquery/docs/reference/odbc-jdbc-drivers" } },
  fields: [
    { key: "project", label: "Project id", kind: "text", placeholder: "my-gcp-project", required: true },
    { key: "dataset", label: "Dataset to attach", kind: "text", placeholder: "analytics", required: true },
    { key: "serviceAccount", label: "Service account e-mail", kind: "text", placeholder: "vs@my-gcp-project.iam.gserviceaccount.com", required: true },
    { key: "keyPath", label: "Key file in BucketFS", kind: "text", placeholder: "/buckets/bfsdefault/default/bigquery-key.json", required: true, help: "Upload the service account's JSON key to BucketFS first." },
  ],
  connection: (v) => ({ to: `jdbc:bigquery://https://www.googleapis.com/bigquery/v2:443;ProjectId=${v.project};OAuthType=0;OAuthServiceAcctEmail=${v.serviceAccount};OAuthPvtKeyPath=${v.keyPath}` }),
  properties: (v) => ({ CATALOG_NAME: v.project, SCHEMA_NAME: v.dataset }),
  prove: "select",
  note:
    "The Simba BigQuery JDBC driver is not redistributable — download it from Google and supply the JAR when asked.",
};
