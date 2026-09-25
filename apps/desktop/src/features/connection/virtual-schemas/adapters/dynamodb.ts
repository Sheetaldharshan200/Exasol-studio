import { DOCUMENT_UDF_CLASS, JAVA_ADAPTER_CLASS, type VsAdapter } from "../types.ts";

/**
 * Amazon DynamoDB tables mapped to Exasol tables with an EDML mapping
 * (exasol/dynamodb-virtual-schema).
 * Document adapters need TWO scripts — the adapter script and an import UDF
 * that does the parallel reading — both pointing at the same JAR. Their
 * credentials travel as a JSON object in the connection's IDENTIFIED BY part;
 * TO and USER stay empty.
 * Guide: https://github.com/exasol/dynamodb-virtual-schema/blob/main/doc/user-guide/user_guide.md
 * EDML:  https://github.com/exasol/virtual-schema-common-document/blob/main/doc/user_guide/edml_user_guide.md
 */
export const DynamoDbAdapter: VsAdapter = {
  id: "dynamodb",
  name: "Amazon DynamoDB",
  kind: "document",
  runtime: "java",
  logo: "amazondynamodb",
  repo: "exasol/dynamodb-virtual-schema",
  docs: "https://github.com/exasol/dynamodb-virtual-schema/blob/main/doc/user-guide/user_guide.md",
  release: { asset: "^document-virtual-schema-dist-[\\d.]+-dynamodb-[\\d.]+\\.jar$" },
  scriptClass: JAVA_ADAPTER_CLASS,
  importUdf: { name: "IMPORT_FROM_DYNAMO_DB", scriptClass: DOCUMENT_UDF_CLASS },
  fields: [
    { key: "region", label: "Region", kind: "text", placeholder: "eu-central-1", required: true },
    { key: "accessKey", label: "Access key id", kind: "text", required: true },
    { key: "secretKey", label: "Secret access key", kind: "password", required: true },
    { key: "mapping", label: "EDML mapping", kind: "text", placeholder: "{\"$schema\":\"https://schemas.exasol.com/edml-2.0.0.json\",\"source\":\"MY_TABLE\",\"destinationTable\":\"MY_TABLE\",\"mapping\":{…}}", required: true, help: "Which DynamoDB table becomes which Exasol table, as EDML JSON — or a BucketFS path to a mapping file." },
  ],
  connection: (v) => ({ to: "", user: "", password: JSON.stringify({ awsAccessKeyId: v.accessKey, awsSecretAccessKey: v.secretKey, awsRegion: v.region }) }),
  properties: (v) => ({ MAPPING: v.mapping }),
  prove: "select",
};
