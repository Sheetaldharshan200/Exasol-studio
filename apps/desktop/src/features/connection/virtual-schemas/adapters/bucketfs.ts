import { DOCUMENT_UDF_CLASS, JAVA_ADAPTER_CLASS, type VsAdapter } from "../types.ts";

/**
 * Files already in this database's BucketFS mapped to tables with an EDML mapping
 * (exasol/bucketfs-document-files-virtual-schema). No credentials: the files are local.
 * Document adapters need TWO scripts — the adapter script and an import UDF
 * that does the parallel reading — both pointing at the same JAR. Their
 * credentials travel as a JSON object in the connection's IDENTIFIED BY part;
 * TO and USER stay empty.
 * Guide: https://github.com/exasol/bucketfs-document-files-virtual-schema/blob/main/doc/user_guide/user_guide.md
 * EDML:  https://github.com/exasol/virtual-schema-common-document/blob/main/doc/user_guide/edml_user_guide.md
 */
export const BucketFsAdapter: VsAdapter = {
  id: "bucketfs",
  name: "BucketFS files",
  kind: "document",
  runtime: "java",
  repo: "exasol/bucketfs-document-files-virtual-schema",
  docs: "https://github.com/exasol/bucketfs-document-files-virtual-schema/blob/main/doc/user_guide/user_guide.md",
  release: { asset: "^document-files-virtual-schema-dist-[\\d.]+-bucketfs-[\\d.]+\\.jar$" },
  scriptClass: JAVA_ADAPTER_CLASS,
  importUdf: { name: "IMPORT_FROM_BUCKETFS_DOCUMENT_FILES", scriptClass: DOCUMENT_UDF_CLASS },
  fields: [
    { key: "mapping", label: "EDML mapping", kind: "text", placeholder: "{\"$schema\":\"https://schemas.exasol.com/edml-2.0.0.json\",\"source\":\"orders/*.json\",\"destinationTable\":\"ORDERS\",\"mapping\":{…}}", required: true, help: "Which files become which table, as EDML JSON — or a BucketFS path to a mapping file." },
  ],
  connection: (v) => ({ to: "", user: "", password: JSON.stringify({}) }),
  properties: (v) => ({ MAPPING: v.mapping }),
  prove: "select",
  note:
    "The mapping's source paths are relative to the bucket root, e.g. `data/orders/*.parquet`.",
};
