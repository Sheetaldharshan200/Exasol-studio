import { JAVA_ADAPTER_CLASS, type VsAdapter } from "../types.ts";

/**
 * Amazon Athena through Exasol's JDBC virtual schema adapter (exasol/athena-virtual-schema).
 * Guide: https://github.com/exasol/athena-virtual-schema/blob/main/doc/user_guide/athena_user_guide.md
 */
export const AthenaAdapter: VsAdapter = {
  id: "athena",
  name: "Amazon Athena",
  kind: "jdbc",
  runtime: "java",
  logo: "amazonwebservices",
  repo: "exasol/athena-virtual-schema",
  docs: "https://github.com/exasol/athena-virtual-schema/blob/main/doc/user_guide/athena_user_guide.md",
  release: { asset: "^virtual-schema-dist-[\\d.]+-athena-[\\d.]+\\.jar$" },
  scriptClass: JAVA_ADAPTER_CLASS,
  driver: { name: "ATHENA", class: "com.simba.athena.jdbc.Driver", source: { manualUrl: "https://docs.aws.amazon.com/athena/latest/ug/connect-with-jdbc.html" } },
  fields: [
    { key: "region", label: "AWS region", kind: "text", placeholder: "eu-central-1", required: true },
    { key: "s3Output", label: "S3 output location", kind: "text", placeholder: "s3://my-athena-results/", required: true },
    { key: "database", label: "Database to attach", kind: "text", placeholder: "default", required: true, default: "default" },
    { key: "user", label: "Access key id", kind: "text", required: true },
    { key: "password", label: "Secret access key", kind: "password", required: true },
  ],
  connection: (v) => ({ to: `jdbc:awsathena://AwsRegion=${v.region};S3OutputLocation=${v.s3Output}`, user: v.user, password: v.password }),
  properties: (v) => ({ SCHEMA_NAME: v.database }),
  prove: "select",
  note:
    "The Simba Athena JDBC driver is not redistributable — download it from AWS and supply the JAR when asked.",
};
