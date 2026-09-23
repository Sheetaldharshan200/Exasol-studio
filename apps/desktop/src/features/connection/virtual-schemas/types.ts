/**
 * The contract every virtual schema adapter in Studio's catalog fulfils.
 *
 * One adapter = one file under `./adapters/`. The add-data-source flow and the
 * agent both read these; nothing else in the app knows adapter specifics.
 * Everything here is what a person would otherwise have to look up in the
 * adapter's user guide: which fields to ask for, how they turn into a
 * `CONNECTION` and a `CREATE VIRTUAL SCHEMA … WITH`, where the adapter
 * artifact comes from, how the driver is obtained, and how to prove the new
 * schema actually works.
 */

/** What the flow asks the user for, in order. */
export type ConnField = {
  key: string;
  label: string;
  kind: "text" | "password" | "number";
  /** Shown greyed in the input; also the example in the agent's guidance. */
  placeholder?: string;
  required?: boolean;
  /** Prefilled value (a default port, a default catalog). */
  default?: string;
  /** One sentence of help, only when the label alone is not enough. */
  help?: string;
};

/** The values a user entered, keyed by `ConnField.key`. */
export type FieldValues = Record<string, string>;

/** How the adapter's JDBC driver reaches BucketFS. */
export type DriverSource =
  /** Studio fetches it from Maven Central. */
  | { maven: string; manualUrl?: undefined }
  /** Not redistributable — the user supplies the JAR; the URL is the vendor page. */
  | { manualUrl: string; maven?: undefined };

export type VsAdapter = {
  /** Stable id — also the file name under `adapters/`. */
  id: string;
  name: string;
  /**
   * `jdbc`: a relational source through a JDBC driver. `document`: files or a
   * document store mapped through EDML. `exasol`: another Exasol database.
   */
  kind: "jdbc" | "document" | "exasol";
  /** Java adapters are JARs in BucketFS; Lua adapters are source inlined in
   *  DDL; Rust adapters are a shared object in BucketFS, loaded through a
   *  Rust Script Language Container. */
  runtime: "java" | "lua" | "rust";
  /** Simple Icons slug for the source's logo; omit for a generic database glyph. */
  logo?: string;
  /** GitHub repository, `owner/name`. */
  repo: string;
  /** The adapter's user guide. */
  docs: string;
  /** The release Studio installs from, pinned; `asset` is a regex over asset names. */
  release: { tag: string; asset: string };
  /** Java only: the `%scriptclass` of the adapter script. */
  scriptClass?: string;
  /**
   * Rust only. The shared object is uploaded to BucketFS and referenced by
   * `%udf_object`, and the adapter comes with a scan UDF beside the adapter
   * script. `bucketPath` is where the library is expected to live, and
   * `languageAlias` the `SCRIPT_LANGUAGES` alias that selects its container.
   */
  rust?: {
    bucketPath: string;
    languageAlias: string;
    scanUdf: { name: string; signature: string };
  };
  /**
   * Document adapters only: the `CREATE JAVA SET SCRIPT` the adapter needs
   * beside the adapter script — its name and `%scriptclass`.
   */
  importUdf?: { name: string; scriptClass: string };
  /** JDBC-backed adapters only. */
  driver?: {
    /** Identifier Exasol's `settings.cfg` uses for this driver. */
    name: string;
    /** The JDBC main class. */
    class: string;
    /** Where the JAR comes from. */
    source: DriverSource;
  };
  fields: ConnField[];
  /**
   * The `CREATE CONNECTION` parts. `to` is the `TO '…'` target (a JDBC URL, an
   * S3 bucket URL, …); `user`/`password` are omitted for sources that
   * authenticate inside `to`.
   */
  connection: (v: FieldValues) => { to: string; user?: string; password?: string };
  /** The `WITH` properties of `CREATE VIRTUAL SCHEMA` (values unquoted). */
  properties: (v: FieldValues) => Record<string, string>;
  /**
   * How a freshly created schema is proved. `listTables` reads its metadata;
   * `select` additionally reads a handful of rows from the first table.
   */
  prove: "listTables" | "select";
  /** Anything the user must know that the fields cannot express. */
  note?: string;
};

/** BucketFS location Exasol expects adapter and driver JARs under. */
export const VS_BUCKET_PATH = "/buckets/bfsdefault/default";
export const VS_DRIVER_BUCKET_PATH = `${VS_BUCKET_PATH}/drivers/jdbc`;

/** The `%scriptclass` shared by every Java adapter Exasol publishes. */
export const JAVA_ADAPTER_CLASS = "com.exasol.adapter.RequestDispatcher";
/** The `%scriptclass` of every document adapter's import UDF. */
export const DOCUMENT_UDF_CLASS = "com.exasol.adapter.document.UdfEntryPoint";
