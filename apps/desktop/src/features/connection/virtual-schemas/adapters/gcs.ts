import { DOCUMENT_UDF_CLASS, JAVA_ADAPTER_CLASS, type VsAdapter } from "../types.ts";

/**
 * Files in Google Cloud Storage mapped to tables with an EDML mapping
 * (exasol/google-cloud-storage-document-files-virtual-schema).
 * Document adapters need TWO scripts — the adapter script and an import UDF
 * that does the parallel reading — both pointing at the same JAR. Their
 * credentials travel as a JSON object in the connection's IDENTIFIED BY part;
 * TO and USER stay empty.
 * Guide: https://github.com/exasol/google-cloud-storage-document-files-virtual-schema/blob/main/doc/user_guide/user_guide.md
 * EDML:  https://github.com/exasol/virtual-schema-common-document/blob/main/doc/user_guide/edml_user_guide.md
 */
export const GcsAdapter: VsAdapter = {
  id: "gcs",
  name: "Google Cloud Storage files",
  kind: "document",
  runtime: "java",
  logo: "googlecloud",
  repo: "exasol/google-cloud-storage-document-files-virtual-schema",
  docs: "https://github.com/exasol/google-cloud-storage-document-files-virtual-schema/blob/main/doc/user_guide/user_guide.md",
  release: { asset: "^document-files-virtual-schema-dist-[\\d.]+-google-cloud-storage-[\\d.]+\\.jar$" },
  scriptClass: JAVA_ADAPTER_CLASS,
  importUdf: { name: "IMPORT_FROM_GOOGLE_CLOUD_STORAGE_DOCUMENT_FILES", scriptClass: DOCUMENT_UDF_CLASS },
  fields: [
    { key: "bucket", label: "Bucket", kind: "text", placeholder: "my-bucket", required: true },
    { key: "keyJson", label: "Service account key (JSON)", kind: "text", placeholder: "{\"type\":\"service_account\",\"project_id\":\"…\"}", required: true, help: "Paste the whole key file the service account was created with." },
    { key: "mapping", label: "EDML mapping", kind: "text", placeholder: "{\"$schema\":\"https://schemas.exasol.com/edml-2.0.0.json\",\"source\":\"orders/*.json\",\"destinationTable\":\"ORDERS\",\"mapping\":{…}}", required: true, help: "Which files become which table, as EDML JSON — or a BucketFS path to a mapping file." },
  ],
  connection: (v) => ({ to: "", user: "", password: JSON.stringify({ gcKey: JSON.parse(v.keyJson), gcsBucket: v.bucket }) }),
  properties: (v) => ({ MAPPING: v.mapping }),
  prove: "select",
};
