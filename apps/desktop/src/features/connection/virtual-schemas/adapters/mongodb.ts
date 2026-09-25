import type { VsAdapter } from "../types.ts";

/**
 * MongoDB collections read from Exasol through the Rust connector
 * (exasol-labs/exasol-mongodb-vs).
 *
 * Unlike every Exasol-published adapter this is not a JAR: it ships a shared
 * object that goes into BucketFS and is referenced with `%udf_object` from a
 * RUST adapter script, which needs the RUST language alias to be active in
 * the session. It comes with a streaming scan UDF beside the adapter script.
 *
 * With no MANIFEST the connector infers the schema from collection metadata
 * and a bounded sample, so the MongoDB user needs `find` on the collection.
 * Guide: https://github.com/exasol-labs/exasol-mongodb-vs
 */
export const MongodbAdapter: VsAdapter = {
  id: "mongodb",
  name: "MongoDB",
  kind: "document",
  runtime: "rust",
  logo: "mongodb",
  repo: "exasol-labs/exasol-mongodb-vs",
  docs: "https://github.com/exasol-labs/exasol-mongodb-vs#readme",
  release: { asset: "^exasol-mongodb-vs-[\\d.]+-linux-x86_64\\.so$" },
  rust: {
    bucketPath: "/buckets/bfsdefault/rust/libmongodb_vs.so",
    languageAlias: "RUST",
    scanUdf: { name: "MONGODB_SCAN", signature: "spec VARCHAR(2000000)" },
  },
  fields: [
    {
      key: "uri",
      label: "Connection string",
      kind: "text",
      placeholder: "mongodb://mongodb.internal:27017/?authSource=admin",
      required: true,
      help: "The MongoDB URI, without the username and password — those are asked for separately.",
    },
    { key: "user", label: "User", kind: "text", placeholder: "analytics_reader", required: true },
    { key: "password", label: "Password", kind: "password", required: true },
    { key: "database", label: "Database", kind: "text", placeholder: "demo", required: true },
    { key: "collection", label: "Collection", kind: "text", placeholder: "people", required: true },
  ],
  connection: (v) => ({ to: v.uri, user: v.user, password: v.password }),
  properties: (v) => ({ DATABASE: v.database, COLLECTION: v.collection }),
  prove: "select",
  note: "Needs the RUST Script Language Container active and the connector library in BucketFS at /buckets/bfsdefault/rust/. The release publishes a linux-x86_64 shared object, so it does not run on an arm64 database.",
};
