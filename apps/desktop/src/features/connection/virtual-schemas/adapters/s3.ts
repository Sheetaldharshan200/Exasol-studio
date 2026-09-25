import { DOCUMENT_UDF_CLASS, JAVA_ADAPTER_CLASS, type VsAdapter } from "../types.ts";

/**
 * Files in Amazon S3 — JSON, JSON Lines, CSV and Parquet — mapped to tables with an
 * EDML mapping (exasol/s3-document-files-virtual-schema).
 * Document adapters need TWO scripts — the adapter script and an import UDF
 * that does the parallel reading — both pointing at the same JAR. Their
 * credentials travel as a JSON object in the connection's IDENTIFIED BY part;
 * TO and USER stay empty.
 * Guide: https://github.com/exasol/s3-document-files-virtual-schema/blob/main/doc/user_guide/user_guide.md
 * EDML:  https://github.com/exasol/virtual-schema-common-document/blob/main/doc/user_guide/edml_user_guide.md
 */
export const S3Adapter: VsAdapter = {
  id: "s3",
  name: "Amazon S3 files",
  kind: "document",
  runtime: "java",
  logo: "amazonwebservices",
  repo: "exasol/s3-document-files-virtual-schema",
  docs: "https://github.com/exasol/s3-document-files-virtual-schema/blob/main/doc/user_guide/user_guide.md",
  release: { asset: "^document-files-virtual-schema-dist-[\\d.]+-s3-[\\d.]+\\.jar$" },
  scriptClass: JAVA_ADAPTER_CLASS,
  importUdf: { name: "IMPORT_FROM_S3_DOCUMENT_FILES", scriptClass: DOCUMENT_UDF_CLASS },
  fields: [
    { key: "bucket", label: "Bucket", kind: "text", placeholder: "my-data-lake", required: true },
    { key: "region", label: "Region", kind: "text", placeholder: "eu-central-1", required: true },
    { key: "accessKey", label: "Access key id", kind: "text", help: "Leave both keys empty for an anonymous (public bucket) connection." },
    { key: "secretKey", label: "Secret access key", kind: "password" },
    { key: "mapping", label: "EDML mapping", kind: "text", placeholder: "{\"$schema\":\"https://schemas.exasol.com/edml-2.0.0.json\",\"source\":\"orders/*.json\",\"destinationTable\":\"ORDERS\",\"mapping\":{…}}", required: true, help: "Which files become which table, as EDML JSON — or a BucketFS path to a mapping file." },
  ],
  connection: (v) => ({ to: "", user: "", password: JSON.stringify({ awsAccessKeyId: v.accessKey ?? "", awsSecretAccessKey: v.secretKey ?? "", awsRegion: v.region, s3Bucket: v.bucket }) }),
  properties: (v) => ({ MAPPING: v.mapping }),
  prove: "select",
};
