import { DOCUMENT_UDF_CLASS, JAVA_ADAPTER_CLASS, type VsAdapter } from "../types.ts";

/**
 * Files in Azure Blob Storage mapped to tables with an EDML mapping
 * (exasol/azure-blob-storage-document-files-virtual-schema).
 * Document adapters need TWO scripts — the adapter script and an import UDF
 * that does the parallel reading — both pointing at the same JAR. Their
 * credentials travel as a JSON object in the connection's IDENTIFIED BY part;
 * TO and USER stay empty.
 * Guide: https://github.com/exasol/azure-blob-storage-document-files-virtual-schema/blob/main/doc/user_guide/user_guide.md
 * EDML:  https://github.com/exasol/virtual-schema-common-document/blob/main/doc/user_guide/edml_user_guide.md
 */
export const AzureBlobAdapter: VsAdapter = {
  id: "azure-blob",
  name: "Azure Blob Storage files",
  kind: "document",
  runtime: "java",
  logo: "microsoftazure",
  repo: "exasol/azure-blob-storage-document-files-virtual-schema",
  docs: "https://github.com/exasol/azure-blob-storage-document-files-virtual-schema/blob/main/doc/user_guide/user_guide.md",
  release: { asset: "^document-files-virtual-schema-dist-[\\d.]+-azure-blob-storage-[\\d.]+\\.jar$" },
  scriptClass: JAVA_ADAPTER_CLASS,
  importUdf: { name: "IMPORT_FROM_AZURE_BLOB_STORAGE_DOCUMENT_FILES", scriptClass: DOCUMENT_UDF_CLASS },
  fields: [
    { key: "container", label: "Container", kind: "text", placeholder: "my-container", required: true },
    { key: "connectionString", label: "Storage account connection string", kind: "password", placeholder: "DefaultEndpointsProtocol=https;AccountName=…;AccountKey=…;EndpointSuffix=core.windows.net", required: true },
    { key: "mapping", label: "EDML mapping", kind: "text", placeholder: "{\"$schema\":\"https://schemas.exasol.com/edml-2.0.0.json\",\"source\":\"orders/*.json\",\"destinationTable\":\"ORDERS\",\"mapping\":{…}}", required: true, help: "Which files become which table, as EDML JSON — or a BucketFS path to a mapping file." },
  ],
  connection: (v) => ({ to: "", user: "", password: JSON.stringify({ absStorageAccountConnectionString: v.connectionString, absContainerName: v.container }) }),
  properties: (v) => ({ MAPPING: v.mapping }),
  prove: "select",
};
