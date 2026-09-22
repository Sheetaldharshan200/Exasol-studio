import { DOCUMENT_UDF_CLASS, JAVA_ADAPTER_CLASS, type VsAdapter } from "../types.ts";

/**
 * Files in Azure Data Lake Storage Gen2 mapped to tables with an EDML mapping
 * (exasol/azure-data-lake-storage-gen2-document-files-virtual-schema).
 * Document adapters need TWO scripts — the adapter script and an import UDF
 * that does the parallel reading — both pointing at the same JAR. Their
 * credentials travel as a JSON object in the connection's IDENTIFIED BY part;
 * TO and USER stay empty.
 * Guide: https://github.com/exasol/azure-data-lake-storage-gen2-document-files-virtual-schema/blob/main/doc/user_guide/user_guide.md
 * EDML:  https://github.com/exasol/virtual-schema-common-document/blob/main/doc/user_guide/edml_user_guide.md
 */
export const AzureDataLakeAdapter: VsAdapter = {
  id: "azure-data-lake",
  name: "Azure Data Lake Storage Gen2 files",
  kind: "document",
  runtime: "java",
  logo: "microsoftazure",
  repo: "exasol/azure-data-lake-storage-gen2-document-files-virtual-schema",
  docs: "https://github.com/exasol/azure-data-lake-storage-gen2-document-files-virtual-schema/blob/main/doc/user_guide/user_guide.md",
  release: { tag: "3.1.0", asset: "^document-files-virtual-schema-dist-[\\d.]+-azure-datalake-storage-gen2-[\\d.]+\\.jar$" },
  scriptClass: JAVA_ADAPTER_CLASS,
  importUdf: { name: "IMPORT_FROM_AZURE_DATA_LAKE_STORAGE_GEN2_DOCUMENT_FILES", scriptClass: DOCUMENT_UDF_CLASS },
  fields: [
    { key: "account", label: "Storage account name", kind: "text", placeholder: "myadlsaccount", required: true },
    { key: "accountKey", label: "Storage account key", kind: "password", required: true },
    { key: "container", label: "Container", kind: "text", placeholder: "my-container", required: true },
    { key: "mapping", label: "EDML mapping", kind: "text", placeholder: "{\"$schema\":\"https://schemas.exasol.com/edml-2.0.0.json\",\"source\":\"orders/*.json\",\"destinationTable\":\"ORDERS\",\"mapping\":{…}}", required: true, help: "Which files become which table, as EDML JSON — or a BucketFS path to a mapping file." },
  ],
  connection: (v) => ({ to: "", user: "", password: JSON.stringify({ adlsStorageAccountName: v.account, adlsStorageAccountKey: v.accountKey, adlsContainerName: v.container }) }),
  properties: (v) => ({ MAPPING: v.mapping }),
  prove: "select",
};
