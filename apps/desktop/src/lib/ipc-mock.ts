/**
 * Browser-preview mock backend. Mirrors the Rust command surface with
 * representative Exasol default data so the UI can be designed and reviewed
 * with `pnpm dev` outside of Tauri. Never used inside the packaged app.
 */

const delay = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));

const profiles: Record<string, unknown>[] = [
  {
    id: "conn-demo-1",
    name: "Local Exasol",
    host: "localhost",
    port: 8563,
    username: "sys",
    password: "exasol",
    schema: null,
    notes: "Local Docker Exasol for development.",
    sslMode: "required",
    compression: false,
    driverId: "sqlx-exasol",
    createdAt: "2026-07-01T09:00:00Z",
    lastUsedAt: "2026-07-09T17:20:00Z",
  },
];

let history: Record<string, unknown>[] = [
  {
    id: "h-1",
    executedAt: "2026-07-09T17:22:41Z",
    profileId: "conn-demo-1",
    connectionName: "Local Exasol",
    sql: "SELECT C_CUSTKEY, C_NAME, C_ACCTBAL FROM STARTER_KIT.CUSTOMER LIMIT 25;",
    statementCount: 1,
    elapsedMs: 231,
    success: true,
    error: null,
    rowCount: 25,
  },
];

const SYS_OBJECTS = [
  "CAT",
  "DUAL",
  "EXA_ALL_COLUMNS",
  "EXA_ALL_CONNECTIONS",
  "EXA_ALL_CONSTRAINTS",
  "EXA_ALL_FUNCTIONS",
  "EXA_ALL_OBJECTS",
  "EXA_ALL_SCHEMAS",
  "EXA_ALL_SCRIPTS",
  "EXA_ALL_SESSIONS",
  "EXA_ALL_TABLES",
  "EXA_ALL_USERS",
  "EXA_ALL_VIEWS",
  "EXA_ALL_VIRTUAL_SCHEMAS",
  "EXA_CONSUMER_GROUPS",
  "EXA_DBA_USERS",
  "EXA_METADATA",
  "EXA_PARAMETERS",
  "EXA_SQL_KEYWORDS",
  "EXA_SQL_TYPES",
  "EXA_TIME_ZONES",
];

const STATISTICS_OBJECTS = [
  "EXA_DBA_AUDIT_SESSIONS",
  "EXA_DBA_AUDIT_SQL",
  "EXA_DB_SIZE_DAILY",
  "EXA_DB_SIZE_HOURLY",
  "EXA_DB_SIZE_LAST_DAY",
  "EXA_DB_SIZE_MONTHLY",
  "EXA_MONITOR_DAILY",
  "EXA_MONITOR_LAST_DAY",
  "EXA_SQL_DAILY",
  "EXA_SQL_HOURLY",
  "EXA_SQL_LAST_DAY",
  "EXA_SYSTEM_EVENTS",
  "EXA_USAGE_DAILY",
  "EXA_USAGE_LAST_DAY",
];

const CUSTOMER_COLUMNS = [
  { name: "C_CUSTKEY", dataType: "DECIMAL(18,0)", nullable: false, comment: null },
  { name: "C_NAME", dataType: "VARCHAR(25) UTF8", nullable: true, comment: null },
  { name: "C_ADDRESS", dataType: "VARCHAR(40) UTF8", nullable: true, comment: null },
  { name: "C_NATIONKEY", dataType: "DECIMAL(18,0)", nullable: true, comment: null },
  { name: "C_PHONE", dataType: "VARCHAR(15) UTF8", nullable: true, comment: null },
  { name: "C_ACCTBAL", dataType: "DECIMAL(12,2)", nullable: true, comment: null },
  { name: "C_MKTSEGMENT", dataType: "VARCHAR(10) UTF8", nullable: true, comment: null },
  { name: "C_COMMENT", dataType: "VARCHAR(117) UTF8", nullable: true, comment: null },
];

export async function mockInvoke(
  command: string,
  args?: Record<string, unknown>,
): Promise<unknown> {
  await delay();
  switch (command) {
    case "list_drivers":
      return [
        {
          id: "sqlx-exasol",
          name: "sqlx-exasol",
          protocol: "WebSocket API (native)",
          description:
            "Rust SQLx driver over Exasol's native WebSocket protocol. Built in — recommended.",
          defaultPort: 8563,
          kind: "native",
          isDefault: true,
          docsUrl: "https://github.com/bobozaur/sqlx-exasol",
        },
        {
          id: "websocket-api",
          name: "WebSocket API",
          protocol: "JSON over WebSocket",
          description: "Exasol's native wire protocol (wss:// on 8563).",
          defaultPort: 8563,
          kind: "external",
          isDefault: false,
          docsUrl: "https://github.com/exasol/websocket-api",
        },
        {
          id: "jdbc",
          name: "JDBC",
          protocol: "jdbc:exa:<host>:<port>",
          description: "com.exasol.jdbc.EXADriver — for Java tools.",
          defaultPort: 8563,
          kind: "external",
          isDefault: false,
          docsUrl: "https://docs.exasol.com/db/latest/connect_exasol/drivers/jdbc.htm",
        },
        {
          id: "odbc",
          name: "ODBC",
          protocol: "DSN (EXAHOST/EXAUID/EXAPWD)",
          description: "Exasol ODBC driver for Windows, Linux, and macOS.",
          defaultPort: 8563,
          kind: "external",
          isDefault: false,
          docsUrl: "https://docs.exasol.com/db/latest/connect_exasol/drivers/odbc.htm",
        },
        {
          id: "ado-net",
          name: "ADO.NET",
          protocol: ".NET Data Provider",
          description: "Exasol data provider for the .NET ecosystem.",
          defaultPort: 8563,
          kind: "external",
          isDefault: false,
          docsUrl: "https://docs.exasol.com/db/latest/connect_exasol/drivers/ado_net.htm",
        },
      ];

    case "list_connection_profiles":
      return profiles;

    case "save_connection_profile": {
      const profile = { ...(args?.profile as Record<string, unknown>) };
      const idx = profile.id
        ? profiles.findIndex((p) => p.id === profile.id)
        : profiles.findIndex(
            (p) =>
              String(p.host).trim().toLowerCase() === String(profile.host).trim().toLowerCase() &&
              p.port === profile.port &&
              p.username === profile.username &&
              p.driverId === profile.driverId,
          );
      if (idx >= 0) {
        profile.id = profiles[idx].id;
        profile.createdAt = profiles[idx].createdAt;
        profiles[idx] = profile;
      } else {
        profile.id = `conn-${Date.now()}`;
        profile.createdAt = new Date().toISOString();
        profiles.push(profile);
      }
      return profile;
    }

    case "delete_connection_profile": {
      const id = args?.profileId as string;
      const idx = profiles.findIndex((p) => p.id === id);
      if (idx >= 0) profiles.splice(idx, 1);
      return null;
    }

    case "ping_server":
      await delay(400);
      return { reachable: true, latencyMs: 12, error: null };

    case "test_connection":
    case "connect":
      await delay(500);
      return {
        databaseName: "exadb",
        version: "8.34.0",
        currentUser: "SYS",
        currentSchema: null,
        sessionId: "1849561742294450176",
        nodes: 1,
      };

    case "disconnect":
      return null;

    case "list_open_connections":
      return [];

    case "get_database_overview":
      return {
        schemas: [
          { name: "STARTER_KIT", owner: "SYS", comment: "Sample data", isVirtual: false, adapterScript: null },
          {
            name: "SALES_VS",
            owner: "SYS",
            comment: null,
            isVirtual: true,
            adapterScript: "ADAPTERS.JDBC_ADAPTER",
          },
        ],
        systemSchemas: ["SYS", "EXA_STATISTICS"],
      };

    case "list_schema_objects":
      return {
        tables: [
          { name: "CUSTOMER", owner: "SYS", rowCount: 150000, comment: null },
          { name: "LINEITEM", owner: "SYS", rowCount: 6001215, comment: null },
          { name: "NATION", owner: "SYS", rowCount: 25, comment: null },
          { name: "ORDERS", owner: "SYS", rowCount: 1500000, comment: null },
          { name: "PART", owner: "SYS", rowCount: 200000, comment: null },
          { name: "REGION", owner: "SYS", rowCount: 5, comment: null },
          { name: "SUPPLIER", owner: "SYS", rowCount: 10000, comment: null },
        ],
        views: [
          { name: "V_CUSTOMER_BALANCE", owner: "SYS", comment: null },
          { name: "V_ORDER_SUMMARY", owner: "SYS", comment: null },
        ],
        functions: [{ name: "F_SEGMENT_SCORE", owner: "SYS", comment: null }],
        scripts: [
          {
            name: "JDBC_ADAPTER",
            scriptType: "ADAPTER",
            language: "JAVA",
            inputType: null,
            resultType: null,
            comment: null,
          },
          {
            name: "LOAD_DAILY",
            scriptType: "SCRIPTING",
            language: "LUA",
            inputType: null,
            resultType: "ROWCOUNT",
            comment: null,
          },
          {
            name: "TOKENIZE",
            scriptType: "UDF",
            language: "PYTHON3",
            inputType: "SET",
            resultType: "EMITS",
            comment: null,
          },
          {
            name: "SQL_REWRITE",
            scriptType: "PREPROCESSOR",
            language: "LUA",
            inputType: null,
            resultType: null,
            comment: null,
          },
        ],
      };

    case "get_table_details":
      return {
        columns: CUSTOMER_COLUMNS,
        constraints: [
          {
            name: "SYS_1234",
            constraintType: "PRIMARY KEY",
            enabled: true,
            columns: [
              { column: "C_CUSTKEY", referencedSchema: null, referencedTable: null, referencedColumn: null },
            ],
          },
          {
            name: "FK_CUSTOMER_NATION",
            constraintType: "FOREIGN KEY",
            enabled: true,
            columns: [
              {
                column: "C_NATIONKEY",
                referencedSchema: "STARTER_KIT",
                referencedTable: "NATION",
                referencedColumn: "N_NATIONKEY",
              },
            ],
          },
        ],
      };

    case "list_system_objects": {
      const schema = args?.schema as string;
      const names = schema === "SYS" ? SYS_OBJECTS : STATISTICS_OBJECTS;
      return {
        objects: names.map((name) => ({ name, objectType: "SYSTEM TABLE", comment: null })),
      };
    }

    case "list_system_columns":
      return {
        columns: [
          { name: "OBJECT_NAME", dataType: "VARCHAR(128) UTF8", comment: null },
          { name: "OBJECT_TYPE", dataType: "VARCHAR(15) UTF8", comment: null },
        ],
      };

    case "get_user_details":
      return {
        info: [
          { name: "Name", value: String(args?.user ?? "USER") },
          { name: "Created", value: "2026-07-13 11:17:54" },
          { name: "Consumer group", value: null },
          { name: "Password state", value: "VALID" },
        ],
        roles: ["PUBLIC"],
        systemPrivileges: ["CREATE SESSION", "SELECT ANY TABLE"],
        objectPrivileges: [{ schema: "ENERGY", object: "ENERGY_READINGS", privilege: "SELECT" }],
        ownedSchemas: [],
      };

    case "get_object_grants":
      return [{ grantor: "SYS", grantee: "PUBLIC", privilege: "SELECT", object: String(args?.object ?? "") }];
    case "get_object_size":
      return { rawSize: "0.00151", memSize: "0.00044", created: "2026-07-13 11:14:49", lastCommit: "2026-07-13 11:14:49", rowCount: 108000 };

    case "get_dba_overview":
      return {
        users: [
          { name: "SYS", created: "2026-06-30", consumerGroup: "SYS_CONSUMER_GROUP", comment: null },
        ],
        roles: [
          { name: "DBA", created: "2026-06-30", consumerGroup: null, comment: null },
          { name: "PUBLIC", created: "2026-06-30", consumerGroup: null, comment: null },
        ],
        consumerGroups: [
          { name: "SYS_CONSUMER_GROUP", cpuWeight: 1000, precedence: 1000, queryTimeout: 0, idleTimeout: 0 },
          { name: "HIGH", cpuWeight: 900, precedence: 900, queryTimeout: 0, idleTimeout: 0 },
          { name: "MEDIUM", cpuWeight: 300, precedence: 300, queryTimeout: 0, idleTimeout: 0 },
          { name: "LOW", cpuWeight: 100, precedence: 100, queryTimeout: 0, idleTimeout: 0 },
        ],
        connections: [
          {
            name: "EXASOL_CONNECTION_1",
            connectionString: "jdbc:exa:remote:8563",
            userName: "loader",
            created: "2026-07-01",
            comment: null,
          },
        ],
        sessions: [
          {
            sessionId: "4",
            userName: "SYS",
            status: "IDLE",
            command: "NOT SPECIFIED",
            duration: "0:00:00",
            loginTime: "2026-07-10 09:00:00",
            client: "Exasol Studio",
            driver: "sqlx-exasol",
            host: "127.0.0.1",
            osUser: "sheetal",
          },
        ],
        dbSize: {
          measureTime: "2026-07-10 09:30:00",
          rawObjectSize: 3.2,
          memObjectSize: 1.4,
          auxiliarySize: 0.2,
          statisticsSize: 0.1,
          recommendedDbRamSize: 6,
        },
      };

    case "get_database_info":
      return {
        metadata: [
          { name: "databaseName", value: "exadb" },
          { name: "databaseProductName", value: "EXASolution" },
          { name: "databaseProductVersion", value: "8.34.0" },
          { name: "maxConnections", value: "1000" },
          { name: "maxDataMessageSize", value: "67108864" },
          { name: "maxIdentifierLength", value: "128" },
          { name: "maxRow", value: "2000000" },
          { name: "nodeCount", value: "1" },
          { name: "productName", value: "EXASOL" },
          { name: "sessionId", value: "1849561742294450176" },
          { name: "timeZone", value: "EUROPE/BERLIN" },
          { name: "timeZoneBehavior", value: "INVALID SHIFT AMBIGUOUS ST" },
        ],
        parameters: [
          { name: "CONSTRAINT_STATE_DEFAULT", sessionValue: "ENABLE", systemValue: "ENABLE" },
          { name: "DEFAULT_LIKE_ESCAPE_CHARACTER", sessionValue: null, systemValue: null },
          { name: "NLS_DATE_FORMAT", sessionValue: "YYYY-MM-DD", systemValue: "YYYY-MM-DD" },
          { name: "NLS_DATE_LANGUAGE", sessionValue: "ENG", systemValue: "ENG" },
          {
            name: "NLS_TIMESTAMP_FORMAT",
            sessionValue: "YYYY-MM-DD HH24:MI:SS.FF6",
            systemValue: "YYYY-MM-DD HH24:MI:SS.FF6",
          },
          { name: "NLS_FIRST_DAY_OF_WEEK", sessionValue: "7", systemValue: "7" },
          { name: "PROFILE", sessionValue: "OFF", systemValue: "OFF" },
          { name: "QUERY_CACHE", sessionValue: "ON", systemValue: "ON" },
          { name: "QUERY_TIMEOUT", sessionValue: "0", systemValue: "0" },
          { name: "SNAPSHOT_MODE", sessionValue: "SYSTEM TABLES", systemValue: "SYSTEM TABLES" },
          { name: "SQL_PREPROCESSOR_SCRIPT", sessionValue: null, systemValue: null },
          { name: "TIME_ZONE", sessionValue: "EUROPE/BERLIN", systemValue: "EUROPE/BERLIN" },
        ],
      };

    case "list_data_types":
      return {
        types: [
          { typeId: 0, typeName: "BOOLEAN" },
          { typeId: 1, typeName: "CHAR" },
          { typeId: 2, typeName: "DATE" },
          { typeId: 3, typeName: "DECIMAL" },
          { typeId: 4, typeName: "DOUBLE" },
          { typeId: 5, typeName: "GEOMETRY" },
          { typeId: 6, typeName: "INTERVAL DAY TO SECOND" },
          { typeId: 7, typeName: "INTERVAL YEAR TO MONTH" },
          { typeId: 8, typeName: "TIMESTAMP" },
          { typeId: 9, typeName: "TIMESTAMP WITH LOCAL TIME ZONE" },
          { typeId: 10, typeName: "VARCHAR" },
          { typeId: 11, typeName: "HASHTYPE" },
        ],
      };

    case "search_objects": {
      const q = String(args?.query ?? "").trim().toUpperCase();
      if (!q) return { results: [] };
      const catalog = [
        { objectType: "SCHEMA", schema: null, name: "STARTER_KIT", container: null, detail: null, selectable: false },
        { objectType: "TABLE", schema: "STARTER_KIT", name: "CUSTOMER", container: null, detail: "150,000 rows", selectable: true },
        { objectType: "TABLE", schema: "STARTER_KIT", name: "ORDERS", container: null, detail: "1,500,000 rows", selectable: true },
        { objectType: "TABLE", schema: "STARTER_KIT", name: "LINEITEM", container: null, detail: "6,001,215 rows", selectable: true },
        { objectType: "TABLE", schema: "STARTER_KIT", name: "NATION", container: null, detail: "25 rows", selectable: true },
        { objectType: "VIEW", schema: "STARTER_KIT", name: "V_CUSTOMER_BALANCE", container: null, detail: null, selectable: true },
        { objectType: "COLUMN", schema: "STARTER_KIT", name: "C_CUSTKEY", container: "CUSTOMER", detail: "DECIMAL(18,0)", selectable: false },
        { objectType: "COLUMN", schema: "STARTER_KIT", name: "C_NAME", container: "CUSTOMER", detail: "VARCHAR(25) UTF8", selectable: false },
        { objectType: "COLUMN", schema: "STARTER_KIT", name: "C_ACCTBAL", container: "CUSTOMER", detail: "DECIMAL(12,2)", selectable: false },
        { objectType: "COLUMN", schema: "STARTER_KIT", name: "O_CUSTKEY", container: "ORDERS", detail: "DECIMAL(18,0)", selectable: false },
        { objectType: "SCRIPT", schema: "STARTER_KIT", name: "TOKENIZE", container: null, detail: "UDF", selectable: false },
        { objectType: "SCRIPT", schema: "STARTER_KIT", name: "JDBC_ADAPTER", container: null, detail: "ADAPTER", selectable: false },
        { objectType: "FUNCTION", schema: "STARTER_KIT", name: "F_SEGMENT_SCORE", container: null, detail: null, selectable: false },
      ];
      const rank = (name: string) =>
        name.toUpperCase() === q ? 0 : name.toUpperCase().startsWith(q) ? 1 : 2;
      const results = catalog
        .filter((c) => c.name.toUpperCase().includes(q))
        .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
      return { results };
    }

    case "market_env":
      return { os: "macos", arch: "aarch64", docker: false, podman: false };

    case "market_doc":
      return `# ${String(args?.repo ?? "docs")}\n\nThis is a **preview** of the documentation.\n\n\`\`\`bash\nexasol install local\n\`\`\`\n\n- Point one\n- Point two\n`;
    case "market_doc_load":
      return null;
    case "market_doc_save":
    case "market_doc_forget":
      return null;

    case "market_catalog":
      return {
        generatedAt: "2026-07-01T08:00:00Z",
        mirrorRepo: "Sheetaldharshan200/Exasol-studio",
        items: {
          pyexasol: { repo: "exasol/pyexasol", latest: "v1.5.0", homepage: "", mirrorTag: "mirror-pyexasol" },
          exapump: { repo: "exasol/exapump", latest: "v1.4.0", homepage: "", mirrorTag: "mirror-exapump" },
        },
      };

    case "market_installed":
      return [];

    case "market_detect":
      return {};

    case "market_release": {
      const repo = String(args?.repo ?? "");
      return {
        tag: "v1.4.0",
        name: `${repo.split("/").pop()} 1.4.0`,
        publishedAt: "2026-06-20T10:00:00Z",
        htmlUrl: `https://github.com/${repo}/releases/latest`,
        assets: [
          { name: "release-darwin-arm64.tar.gz", url: "https://example.com/a", size: 4200000 },
          { name: "release-linux-x86_64.tar.gz", url: "https://example.com/b", size: 4300000 },
        ],
      };
    }

    case "market_install":
      await delay(400);
      return { ok: true, path: `/Users/you/ExasolStudio/.marketplace/${args?.id}` };

    case "market_install_run":
      // In the browser preview the console component simulates its own log.
      await delay(200);
      return { ok: true };

    case "bi_installed":
      return false;
    case "bi_launch":
      return "http://localhost:8088";

    case "bucketfs_list":
      return ["drivers/", "EXAMPLE_ADAPTER.jar"];
    case "bucketfs_upload":
      return `/buckets/bfsdefault/${args?.bucket ?? "default"}/${args?.remotePath ?? "driver.jar"}`;
    case "bucketfs_download":
      return String(args?.destPath ?? "/tmp/downloaded");
    case "exasol_local_ctl":
      await delay(300);
      return { ok: true, code: 0 };

    case "git_status":
      return {
        hasGit: true,
        isRepo: true,
        branch: "main",
        ahead: 0,
        behind: 0,
        dir: "/Users/you/ExasolStudio",
        files: [
          { code: " M", path: "reports/revenue.sql", label: "modified", staged: false },
          { code: "??", path: "scratch/new-query.sql", label: "untracked", staged: false },
        ],
      };
    case "git_init":
      return null;
    case "git_commit":
      await delay(200);
      return "[main abc1234] " + String(args?.message ?? "");
    case "git_log":
      return [
        { hash: "abc1234", subject: "Add revenue report", author: "You", relative: "2 hours ago" },
        { hash: "def5678", subject: "Initial workspace", author: "You", relative: "yesterday" },
      ];

    case "market_uninstall":
      return null;

    case "market_dir_path":
      return "/Users/you/Library/Application Support/com.exasol.studio/marketplace";

    case "list_vs_prereqs":
      return {
        adapters: [
          { schema: "ADAPTERS", name: "JDBC_ADAPTER" },
          { schema: "ADAPTERS", name: "POSTGRES_ADAPTER" },
        ],
        connections: ["POSTGRES_CONNECTION", "MYSQL_JDBC_CONNECTION"],
      };

    case "get_schema_graph":
      return {
        tables: [
          {
            name: "CUSTOMER",
            columns: [
              { name: "C_CUSTKEY", dataType: "DECIMAL(18,0)", pk: true },
              { name: "C_NAME", dataType: "VARCHAR(25)", pk: false },
              { name: "C_NATIONKEY", dataType: "DECIMAL(18,0)", pk: false },
              { name: "C_ACCTBAL", dataType: "DECIMAL(12,2)", pk: false },
            ],
          },
          {
            name: "ORDERS",
            columns: [
              { name: "O_ORDERKEY", dataType: "DECIMAL(18,0)", pk: true },
              { name: "O_CUSTKEY", dataType: "DECIMAL(18,0)", pk: false },
              { name: "O_TOTALPRICE", dataType: "DECIMAL(12,2)", pk: false },
            ],
          },
          {
            name: "LINEITEM",
            columns: [
              { name: "L_ORDERKEY", dataType: "DECIMAL(18,0)", pk: true },
              { name: "L_PARTKEY", dataType: "DECIMAL(18,0)", pk: false },
              { name: "L_QUANTITY", dataType: "DECIMAL(12,2)", pk: false },
            ],
          },
          {
            name: "NATION",
            columns: [
              { name: "N_NATIONKEY", dataType: "DECIMAL(18,0)", pk: true },
              { name: "N_NAME", dataType: "VARCHAR(25)", pk: false },
            ],
          },
        ],
        links: [
          { source: "CUSTOMER", sourceColumn: "C_NATIONKEY", target: "NATION", targetColumn: "N_NATIONKEY" },
          { source: "ORDERS", sourceColumn: "O_CUSTKEY", target: "CUSTOMER", targetColumn: "C_CUSTKEY" },
          { source: "LINEITEM", sourceColumn: "L_ORDERKEY", target: "ORDERS", targetColumn: "O_ORDERKEY" },
        ],
      };

    case "fs_workspace_dir":
      return { name: "My Workspace", path: "/Users/you/ExasolStudio", isDir: true, size: 0, modified: null, ext: null };

    case "write_text_file":
      return null;

    case "fs_home_roots":
      return [{ name: "Home", path: "/Users/you", isDir: true, size: 0, modified: null, ext: null }];

    case "fs_list_dir": {
      const path = String(args?.path ?? "");
      const mk = (name: string, isDir: boolean, ext: string | null = null) => ({
        name,
        path: `${path}/${name}`,
        isDir,
        size: isDir ? 0 : 2048,
        modified: "2026-07-09T12:00:00Z",
        ext,
      });
      return [
        mk("queries", true),
        mk("exports", true),
        mk("customers.sql", false, "sql"),
        mk("daily_load.sql", false, "sql"),
        mk("notes.md", false, "md"),
        mk("report.csv", false, "csv"),
        mk("schema.json", false, "json"),
      ];
    }

    case "fs_read_text":
      return "-- Loaded from a local file (design preview)\nSELECT * FROM STARTER_KIT.CUSTOMER LIMIT 100;\n";

    case "fs_read_table": {
      const p = String(args?.path ?? "");
      const fmt = p.endsWith(".parquet") ? "Parquet" : p.endsWith(".tsv") ? "TSV" : "CSV";
      return {
        columns: ["C_CUSTKEY", "C_NAME", "C_NATIONKEY", "C_ACCTBAL"],
        rows: [
          ["1", "Acme GmbH", "1", "7211.50"],
          ["2", "Globex", "2", "120.00"],
          ["3", "Initech", "1", "980.25"],
        ],
        truncated: false,
        format: fmt,
      };
    }

    case "fs_delete":
      return null;

    case "exapump_available":
      return true;
    case "exapump_upload":
      await delay(300);
      return { ok: true };

    case "fs_search": {
      const q = String(args?.query ?? "").trim().toLowerCase();
      if (!q) return [];
      const all = [
        { name: "customers.sql", path: "/Users/you/queries/customers.sql", isDir: false, size: 2048, modified: null, ext: "sql" },
        { name: "daily_load.sql", path: "/Users/you/queries/daily_load.sql", isDir: false, size: 2048, modified: null, ext: "sql" },
        { name: "customer_report.csv", path: "/Users/you/exports/customer_report.csv", isDir: false, size: 9000, modified: null, ext: "csv" },
      ];
      return all.filter((e) => e.name.toLowerCase().includes(q));
    }

    case "execute_sql": {
      await delay(350);
      const sql = String(args?.sql ?? "");
      const entry = {
        id: `h-${Date.now()}`,
        executedAt: new Date().toISOString(),
        profileId: String(args?.profileId ?? ""),
        connectionName: String(args?.connectionName ?? ""),
        sql,
        statementCount: 1,
        elapsedMs: 231,
        success: true,
        error: null,
        rowCount: 3,
      };
      history = [entry, ...history].slice(0, 300);
      return {
        results: [
          {
            statement: sql,
            kind: "resultSet",
            columns: [
              { name: "C_CUSTKEY", typeName: "DECIMAL" },
              { name: "C_NAME", typeName: "VARCHAR" },
              { name: "C_ACCTBAL", typeName: "DECIMAL" },
            ],
            rows: [
              [1, "Customer#000000001", "711.56"],
              [2, "Customer#000000002", "121.65"],
              [3, "Customer#000000003", "7498.12"],
            ],
            rowCount: 3,
            truncated: false,
            elapsedMs: 231,
            error: null,
          },
        ],
        totalElapsedMs: 231,
        success: true,
      };
    }

    case "sql_history_list":
      return history;

    case "sql_history_clear":
      history = [];
      return null;

    case "get_assistant_settings":
      return { apiKey: "", model: "claude-opus-4-8" };

    case "set_assistant_settings":
      return { apiKey: "…demo", model: (args?.model as string) ?? "claude-opus-4-8" };

    case "ai_chat":
      await delay(600);
      return {
        text: "This is the design-preview assistant. Run the desktop app and add an Anthropic API key in the assistant settings to chat for real.",
        model: "claude-opus-4-8",
        stopReason: "end_turn",
      };

    case "get_app_settings":
      return {};
    case "set_app_settings":
      return (args?.patch as Record<string, unknown>) ?? {};

    default:
      throw { kind: "mock", message: `mock backend: unknown command ${command}` };
  }
}
