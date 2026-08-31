/**
 * Exasol virtual-schema supported data sources (from the official dialect list:
 * github.com/exasol/virtual-schemas). Each entry carries the JDBC URL template
 * and the adapter repo so the flow can guide install + connection.
 */
export type VsSource = {
  id: string;
  name: string;
  kind: "jdbc" | "document";
  /** Simple Icons slug (DbMarks) — omit for a generic DB glyph. */
  logo?: string;
  /** JDBC URL template shown/prefilled for relational dialects. */
  jdbc?: string;
  /** The adapter repo on GitHub (for install guidance). */
  repo: string;
  note?: string;
  /** One-time driver install metadata for this dialect. `driverName` is the
   *  identifier used in BucketFS `settings.cfg`; `driverClass` is the JDBC main
   *  class; `driverMaven` is the Maven group:artifact of the JDBC driver to
   *  fetch; `docs` links the dialect's user guide. Absent for document sources. */
  driverName?: string;
  driverClass?: string;
  driverMaven?: string;
  docs?: string;
};

/** BucketFS location Exasol expects JDBC drivers under. */
export const VS_DRIVER_BUCKET_PATH = "/buckets/bfsdefault/default/drivers/jdbc";

export const VS_SOURCES: VsSource[] = [
  { id: "postgresql", name: "PostgreSQL", kind: "jdbc", logo: "postgresql", jdbc: "jdbc:postgresql://host:5432/database", repo: "exasol/postgresql-virtual-schema", driverName: "POSTGRESQL", driverClass: "org.postgresql.Driver", driverMaven: "org.postgresql:postgresql", docs: "https://github.com/exasol/postgresql-virtual-schema/blob/main/doc/user_guide/postgresql_user_guide.md" },
  { id: "mysql", name: "MySQL", kind: "jdbc", logo: "mysql", jdbc: "jdbc:mysql://host:3306/database", repo: "exasol/mysql-virtual-schema", driverName: "MYSQL", driverClass: "com.mysql.cj.jdbc.Driver", driverMaven: "com.mysql:mysql-connector-j", docs: "https://github.com/exasol/mysql-virtual-schema/blob/main/doc/user_guide/mysql_user_guide.md" },
  { id: "oracle", name: "Oracle", kind: "jdbc", logo: "oracle", jdbc: "jdbc:oracle:thin:@host:1521/service", repo: "exasol/oracle-virtual-schema", driverName: "ORACLE", driverClass: "oracle.jdbc.OracleDriver", driverMaven: "com.oracle.database.jdbc:ojdbc11", docs: "https://github.com/exasol/oracle-virtual-schema/blob/main/doc/user_guide/oracle_user_guide.md" },
  { id: "sqlserver", name: "SQL Server", kind: "jdbc", logo: "microsoftsqlserver", jdbc: "jdbc:sqlserver://host:1433;databaseName=database", repo: "exasol/sqlserver-virtual-schema", driverName: "SQLSERVER", driverClass: "com.microsoft.sqlserver.jdbc.SQLServerDriver", driverMaven: "com.microsoft.sqlserver:mssql-jdbc", docs: "https://github.com/exasol/sqlserver-virtual-schema/blob/main/doc/user_guide/sqlserver_user_guide.md" },
  { id: "snowflake", name: "Snowflake", kind: "jdbc", logo: "snowflake", jdbc: "jdbc:snowflake://account.snowflakecomputing.com/?db=database", repo: "exasol/snowflake-virtual-schema", driverName: "SNOWFLAKE", driverClass: "net.snowflake.client.jdbc.SnowflakeDriver", driverMaven: "net.snowflake:snowflake-jdbc" },
  { id: "bigquery", name: "Google BigQuery", kind: "jdbc", logo: "googlebigquery", jdbc: "jdbc:bigquery://https://www.googleapis.com/bigquery/v2:443;ProjectId=project", repo: "exasol/bigquery-virtual-schema", driverName: "BIGQUERY", driverClass: "com.simba.googlebigquery.jdbc.Driver" },
  { id: "redshift", name: "Amazon Redshift", kind: "jdbc", logo: "amazonredshift", jdbc: "jdbc:redshift://cluster.region.redshift.amazonaws.com:5439/database", repo: "exasol/redshift-virtual-schema", driverName: "REDSHIFT", driverClass: "com.amazon.redshift.jdbc42.Driver", driverMaven: "com.amazon.redshift:redshift-jdbc42" },
  { id: "databricks", name: "Databricks", kind: "jdbc", logo: "databricks", jdbc: "jdbc:databricks://host:443/default;transportMode=http", repo: "exasol/databricks-virtual-schema", driverName: "DATABRICKS", driverClass: "com.databricks.client.jdbc.Driver" },
  { id: "db2", name: "IBM Db2", kind: "jdbc", jdbc: "jdbc:db2://host:50000/database", repo: "exasol/db2-virtual-schema", driverName: "DB2", driverClass: "com.ibm.db2.jcc.DB2Driver", driverMaven: "com.ibm.db2:jcc" },
  { id: "hana", name: "SAP HANA", kind: "jdbc", logo: "sap", jdbc: "jdbc:sap://host:39015", repo: "exasol/hana-virtual-schema", driverName: "HANA", driverClass: "com.sap.db.jdbc.Driver", driverMaven: "com.sap.cloud.db.jdbc:ngdbc" },
  { id: "hive", name: "Hive", kind: "jdbc", logo: "apachehive", jdbc: "jdbc:hive2://host:10000/default", repo: "exasol/hive-virtual-schema", driverName: "HIVE", driverClass: "org.apache.hive.jdbc.HiveDriver" },
  { id: "impala", name: "Impala", kind: "jdbc", jdbc: "jdbc:impala://host:21050/default", repo: "exasol/impala-virtual-schema", driverName: "IMPALA", driverClass: "com.cloudera.impala.jdbc.Driver" },
  { id: "athena", name: "Amazon Athena", kind: "jdbc", logo: "amazonwebservices", jdbc: "jdbc:awsathena://AwsRegion=region;S3OutputLocation=s3://bucket/", repo: "exasol/athena-virtual-schema", driverName: "ATHENA", driverClass: "com.simba.athena.jdbc.Driver" },
  { id: "aurora", name: "Amazon Aurora", kind: "jdbc", logo: "amazonwebservices", jdbc: "jdbc:mysql://cluster.region.rds.amazonaws.com:3306/database", repo: "exasol/aurora (MySQL/PostgreSQL dialect)", driverName: "MYSQL", driverClass: "com.mysql.cj.jdbc.Driver", driverMaven: "com.mysql:mysql-connector-j", note: "Use the MySQL or PostgreSQL dialect depending on your Aurora engine." },
  { id: "teradata", name: "Teradata", kind: "jdbc", logo: "teradata", jdbc: "jdbc:teradata://host/database=database", repo: "exasol/virtual-schemas (Teradata)", driverName: "TERADATA", driverClass: "com.teradata.jdbc.TeraDriver" },
  { id: "sybase", name: "Sybase ASE", kind: "jdbc", jdbc: "jdbc:sybase:Tds:host:5000/database", repo: "exasol/sybase-virtual-schema", driverName: "SYBASE", driverClass: "com.sybase.jdbc4.jdbc.SybDriver" },
  { id: "exasol", name: "Exasol → Exasol", kind: "jdbc", jdbc: "jdbc:exa:host:8563", repo: "exasol/exasol-virtual-schema", driverName: "EXASOL", driverClass: "com.exasol.jdbc.EXADriver", driverMaven: "com.exasol:exasol-jdbc" },
  { id: "generic", name: "Generic JDBC", kind: "jdbc", jdbc: "jdbc:<driver>://host:port/database", repo: "exasol/virtual-schemas (generic JDBC)", note: "Fallback for any database with a JDBC driver.", driverName: "GENERIC", driverClass: "<jdbc.Driver>" },
  // Document-based sources
  { id: "s3", name: "S3 (document files)", kind: "document", logo: "amazonwebservices", repo: "exasol/s3-document-files-virtual-schema", note: "JSON/CSV/Parquet files in S3." },
  { id: "dynamodb", name: "DynamoDB", kind: "document", logo: "amazondynamodb", repo: "exasol/dynamodb-virtual-schema" },
  { id: "elasticsearch", name: "Elasticsearch", kind: "document", logo: "elasticsearch", repo: "exasol/elasticsearch-virtual-schema" },
  { id: "gcs", name: "Google Cloud Storage", kind: "document", logo: "googlecloud", repo: "exasol/gcs-document-files-virtual-schema" },
  { id: "azureblob", name: "Azure Blob / Data Lake", kind: "document", logo: "microsoftazure", repo: "exasol/azure-blob-storage-document-files-virtual-schema" },
];
