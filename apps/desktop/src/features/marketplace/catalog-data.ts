import { VS_CATALOG } from "./vs-catalog.ts";
/**
 * The marketplace catalog registry — deliberately minimal so adding an addon
 * is ONE entry: `{ id, repo, kind, install }`. Everything the user sees —
 * the product name, the about line, the homepage — resolves dynamically from
 * the official GitHub repo (via `market_repo_meta`, disk-cached in Rust), so
 * the marketplace always shows exactly what the repo shows. Items without a
 * repo (docs-hosted drivers) carry their own `name`/`description`/`homepage`.
 */

export type Kind =
  | "database"
  | "cli"
  | "driver"
  | "server"
  | "extension"
  | "skills"
  | "cloud"
  | "bi"
  /** A virtual schema adapter — its own shelf, because these are updated and
   *  applied against a connected database rather than installed onto this
   *  machine. Built from the adapter registry, never listed by hand. */
  | "vs"
  /** Published libraries and developer tooling: real releases people depend
   *  on, but not something you install from a database client. They get their
   *  own shelf so the ecosystem is complete without burying the rest. */
  | "library";
export type Install =
  | "personal-local"
  | "personal-cloud"
  | "binary"
  | "uv-tool"
  | "uv-pip"
  | "source-build"
  | "semantic-views"
  | "bundled"
  | "maven"
  /** Downloaded from the driver's NATIVE registry (npm / Go proxy / crates.io /
   *  GitHub tags) at any version — independent of Studio, usable by your own
   *  tools (its coordinate is the item's own `source`). */
  | "package"
  /** Staged into BucketFS from the repo's newest release, by the same command
   *  the add-data-source flow runs. */
  | "vs-adapter"
  /** A plugin for another application: fetched and verified into Studio's
   *  folder and revealed, with where it belongs spelled out. Studio never
   *  writes into another product's installation. */
  | "host-plugin"
  /** A file for one of the person's own tools (a Lua rock, a dbt package, a
   *  source archive, a desktop build): fetched and verified into Studio's
   *  folder and revealed, with the next step stated from its format. */
  | "deliver"
  /** A script language container for the managed local database, installed
   *  and removed through the official launcher, which owns them. */
  | "slc"
  /** SQL and Lua scripts run into a schema on a connection the person chose,
   *  after they have reviewed every statement. */
  | "db-scripts"
  /** A database image imported into the hypervisor on this machine (x86-64
   *  only); the person downloads it from the publisher's sign-up page. */
  | "vm-appliance"
  | "reference";

import type { InstallSource } from "@/lib/ipc";
export type { InstallSource };

export type CatalogItem = {
  id: string;
  repo?: string;
  kind: Kind;
  install: Install;
  labs?: boolean;
  /**
   * Where the artifact comes from. Absent for items Studio installs through a
   * path of their own (the managed components) and for `reference` items,
   * which have nothing to fetch.
   */
  source?: InstallSource;
  /** Only for repo-less items — repo items resolve these from GitHub. */
  name?: string;
  description?: string;
  homepage?: string;
};

/** A catalog item with its display fields resolved — what the UI renders. */
export type ResolvedCatalogItem = Omit<CatalogItem, "name" | "description" | "homepage"> & {
  name: string;
  description: string;
  homepage: string;
  stars: number | null;
  pushedAt: string | null;
};

/** What GitHub says about a repo (subset of GET /repos/{owner}/{repo}). */
export type RepoMeta = {
  name: string;
  description: string | null;
  htmlUrl: string;
  /** GitHub stargazers — social proof on the catalog card. */
  stars?: number | null;
  /** Last push, ISO — "updated 3 days ago" on the card. */
  pushedAt?: string | null;
};

// Official Exasol / Exasol-Labs repositories only.
export const CATALOG: CatalogItem[] = [
  { id: "exasol-personal", repo: "exasol/exasol-personal", kind: "database", install: "personal-local" },
  { id: "exapump", repo: "exasol-labs/exapump", kind: "cli", install: "binary", labs: true, source: { kind: "gh-asset", onPath: true } },
  { id: "semantic-views", repo: "exasol-labs/exasol-semantic-views", kind: "extension", install: "semantic-views", labs: true },
  { id: "json-tables", repo: "exasol-labs/exasol-json-tables", kind: "extension", install: "source-build", labs: true },
  { id: "mcp-server", repo: "exasol/mcp-server", kind: "server", install: "uv-tool", source: { kind: "pypi", package: "exasol-mcp-server", tool: true } },
  { id: "pyexasol", repo: "exasol/pyexasol", kind: "driver", install: "uv-pip", source: { kind: "pypi", package: "pyexasol" } },
  { id: "sqlalchemy-exasol", repo: "exasol/sqlalchemy-exasol", kind: "driver", install: "uv-pip", source: { kind: "pypi", package: "sqlalchemy-exasol" } },
  { id: "exarrow-rs", repo: "exasol-labs/exarrow-rs", kind: "driver", install: "package", labs: true, source: { kind: "registry", registry: "crates", package: "exarrow-rs" } },
  {
    id: "driver-jdbc",
    kind: "driver",
    install: "maven",
    source: { kind: "maven", group: "com.exasol", artifact: "exasol-jdbc" },
    name: "JDBC Driver",
    description: "JDBC driver for Java tools.",
    homepage: "https://docs.exasol.com/db/latest/connect_exasol/drivers/jdbc.htm",
  },
  {
    id: "driver-odbc",
    source: { kind: "registry", registry: "exasol-downloads", package: "ODBC", driverRuntime: "odbc" },
    kind: "driver",
    install: "package",
    name: "ODBC Driver",
    description: "ODBC driver for apps and BI tools.",
    homepage: "https://docs.exasol.com/db/latest/connect_exasol/drivers/odbc.htm",
  },
  { id: "driver-ts", repo: "exasol/exasol-driver-ts", kind: "driver", install: "package", source: { kind: "registry", registry: "npm", package: "@exasol/exasol-driver-ts" } },
  { id: "driver-go", repo: "exasol/exasol-driver-go", kind: "driver", install: "package", source: { kind: "registry", registry: "goproxy", package: "github.com/exasol/exasol-driver-go" } },
  {
    id: "driver-adonet",
    source: { kind: "registry", registry: "exasol-downloads", package: "ADO.NET" },
    kind: "driver",
    install: "package",
    name: "ADO.NET Provider",
    description: "ADO.NET provider for .NET (Windows driver package).",
    homepage: "https://docs.exasol.com/db/latest/connect_exasol/drivers/ado.net.htm",
  },
  {
    id: "driver-r",
    source: { kind: "driver-runtime", driver: "r" },
    repo: "exasol/r-exasol",
    kind: "driver",
    install: "package",
    name: "R Integration",
    description: "R integration for Exasol.",
    homepage: "https://docs.exasol.com/db/latest/connect_exasol/drivers/r.htm",
  },
  { id: "driver-websocket", repo: "exasol/websocket-api", kind: "driver", install: "package", source: { kind: "repo-snapshot" } },
  { id: "notebook-connector", repo: "exasol/notebook-connector", kind: "driver", install: "uv-pip", source: { kind: "pypi", package: "exasol-notebook-connector" } },
  { id: "dbt-exasol", repo: "exasol/dbt-exasol", kind: "extension", install: "uv-pip", source: { kind: "pypi", package: "dbt-exasol" } },
  { id: "exasol-scheduler", repo: "exasol-labs/exasol-scheduler", kind: "cli", install: "binary", labs: true, source: { kind: "gh-asset", onPath: true } },
  { id: "dash-server", repo: "exasol-labs/dash-server", kind: "bi", install: "package", labs: true, source: { kind: "pip-release" } },
  // Ships through Grafana's own plugin catalogue, never as a release asset —
  // every GitHub release is source-only. Installing it means Grafana's CLI or
  // its UI, which is another application's installation and out of scope.
  { id: "grafana-datasource", repo: "exasol-labs/grafana-datasource", kind: "bi", install: "reference", labs: true },
  { id: "tableau-connector", repo: "exasol/tableau-connector", kind: "bi", install: "binary", source: { kind: "gh-asset", onPath: true } },
  { id: "terraform-provider", repo: "exasol-labs/terraform-provider-exasol", kind: "cli", install: "binary", labs: true, source: { kind: "gh-asset", onPath: true } },
  { id: "postgres-interface", repo: "exasol-labs/exa-postgres-interface", kind: "server", install: "binary", labs: true, source: { kind: "gh-asset", onPath: true } },
  // The decision-model daemon behind the Anomalies tab: one binary, one file
  // per platform in its release (Linux ships .tar.zst, which Studio does not
  // extract, so Linux is told there is no build).
  { id: "ollaya", repo: "ollaya-dev/ollaya", kind: "server", install: "binary", source: { kind: "gh-asset", assetPattern: "^ollaya-(darwin-arm64|windows-amd64)\\.(tgz|zip)$", onPath: true, perPlatform: true } },
  { id: "more-functions", repo: "exasol-labs/more-functions", kind: "extension", install: "package", labs: true, source: { kind: "repo-snapshot" } },
  // AI Lab ships only as a container image (JupyterLab). Studio does not drive a
  // container engine, so this links to the project instead of installing it.
  { id: "ai-lab", repo: "exasol/ai-lab", kind: "extension", install: "reference" },
  { id: "agent-skills", repo: "exasol-labs/exasol-agent-skills", kind: "skills", install: "bundled", labs: true },
  // The AI panel's engine — a managed component (updates via update_component,
  // digest-verified; the sidecar restarts after a switch). Shown as a card so
  // ALL components live in one place, no separate panel.
  // ── The rest of the published Exasol ecosystem ─────────────────────────
  // Every non-archived exasol / exasol-labs repository that publishes
  // releases and is something a person USES (rather than build plumbing,
  // test fixtures or shared libraries). They carry `install: "reference"`:
  // Studio shows each one's real name, About line, stars and latest release
  // straight from GitHub and links to it, because these install into the tool
  // they extend — Power BI, Tableau, Metabase, a Python environment — not
  // into Studio. Promote one to a real installer by changing its `install`.
  { id: "cloud-storage-extension", repo: "exasol/cloud-storage-extension", kind: "extension", install: "binary", source: { kind: "gh-asset", assetPattern: "^exasol-cloud-storage-extension-[\\d.]+\\.jar$" } },
  { id: "kinesis-connector", repo: "exasol/kinesis-connector-extension", kind: "extension", install: "binary", source: { kind: "gh-asset", assetPattern: "^exasol-kinesis-connector-extension-[\\d.]+\\.jar$" } },
  { id: "transformers-extension", repo: "exasol/transformers-extension", kind: "extension", install: "uv-pip", source: { kind: "pypi", package: "exasol-transformers-extension" } },
  { id: "advanced-analytics", repo: "exasol/advanced-analytics-framework", kind: "extension", install: "uv-pip", source: { kind: "pypi", package: "exasol-advanced-analytics-framework" } },
  { id: "mlflow-plugin", repo: "exasol/mlflow-plugin", kind: "extension", install: "uv-pip", source: { kind: "pypi", package: "exasol-mlflow-plugin" } },
  { id: "script-languages-release", repo: "exasol/script-languages-release", kind: "extension", install: "slc", source: { kind: "slc" } },
  { id: "language-container-rs", repo: "exasol-labs/language-container-rs", kind: "extension", install: "slc", labs: true, source: { kind: "slc", alias: "rust" } },
  { id: "preprocessor-library", repo: "exasol-labs/preprocessor-library", kind: "extension", install: "deliver", labs: true, source: { kind: "deliver", format: "source" } },
  { id: "lakehouse-engine-rs", repo: "exasol-labs/lakehouse-engine-rs", kind: "extension", install: "deliver", labs: true, source: { kind: "deliver", format: "source" } },
  { id: "vscode-extension", repo: "exasol-labs/exasol-vscode", kind: "extension", install: "host-plugin", labs: true, source: { kind: "host-plugin", assetPattern: "^exasol-vscode-[\\d.]+\\.vsix$", host: "vscode" } },
  { id: "powerbi-connector", repo: "exasol/powerbi-exasol", kind: "bi", install: "host-plugin", source: { kind: "host-plugin", assetPattern: "^Exasol\\.mez$", host: "powerbi" } },
  { id: "metabase-driver", repo: "exasol/metabase-driver", kind: "bi", install: "binary", source: { kind: "gh-asset", assetPattern: "^exasol\\.metabase-driver\\.jar$" } },
  { id: "power-apps-connector", repo: "exasol/power-apps-connector", kind: "bi", install: "host-plugin", source: { kind: "host-plugin", assetPattern: "^power-apps-connector-certified-[\\d.]+\\.zip$", host: "powerapps" } },
  { id: "n8n-nodes", repo: "exasol/n8n-nodes", kind: "bi", install: "package", source: { kind: "registry", registry: "npm", package: "n8n-nodes-exasol" } },
  { id: "azure-data-factory", repo: "exasol/azure-data-factory-functions", kind: "bi", install: "host-plugin", source: { kind: "host-plugin", assetPattern: "^adffunctions-[\\d.]+\\.zip$", host: "azure-functions" } },
  { id: "panorama", repo: "exasol-labs/exasol-panorama", kind: "bi", install: "deliver", labs: true, source: { kind: "deliver", format: "desktop-app" } },
  { id: "driver-lua", repo: "exasol/exasol-driver-lua", kind: "driver", install: "deliver", source: { kind: "deliver", format: "rockspec", assetPattern: "^luasql-exasol-[\\d.]+-\\d+\\.rockspec$" } },
  { id: "bucketfs-python", repo: "exasol/bucketfs-python", kind: "driver", install: "uv-pip", source: { kind: "pypi", package: "exasol-bucketfs" } },
  { id: "saas-api-python", repo: "exasol/saas-api-python", kind: "driver", install: "uv-pip", source: { kind: "pypi", package: "exasol-saas-api" } },
  { id: "rest-api", repo: "exasol/exasol-rest-api", kind: "server", install: "binary", source: { kind: "gh-asset", onPath: true } },
  { id: "saas-cli", repo: "exasol-labs/saas-cli", kind: "cli", install: "binary", labs: true, source: { kind: "gh-asset", onPath: true } },
  { id: "exaplus-lua", repo: "exasol-labs/exaplus-lua", kind: "cli", install: "binary", labs: true, source: { kind: "gh-asset", onPath: true } },
  { id: "starter-kit", repo: "exasol-labs/exasol-personal-local-starterkit", kind: "cli", install: "reference", labs: true },
  { id: "community-edition", repo: "exasol-labs/exasol-labs-community-edition", kind: "database", install: "vm-appliance", labs: true, source: { kind: "vm-appliance", imagePattern: "^Exasol_Community_Edition_v8_\\d+_(virtualbox|vmware)\\.ova$", downloadPage: "https://www.exasol.com/free-signup-community-edition/", vmName: "Exasol Community Edition" } },
  // Second pass over the release-bearing repositories: these are deployed or
  // installed by a person, unlike the Maven plugins, pytest fixtures and
  // shared libraries that make up most of what is left.
  { id: "kafka-connector", repo: "exasol/kafka-connector-extension", kind: "extension", install: "binary", source: { kind: "gh-asset", assetPattern: "^exasol-kafka-connector-extension-[\\d.]+\\.jar$" } },
  { id: "spark-connector", repo: "exasol/spark-connector", kind: "extension", install: "binary", source: { kind: "gh-asset", assetPattern: "^spark-connector-(jdbc|s3)_[\\d.]+-[\\d.]+-spark-[\\d.]+-assembly\\.jar$", choose: true } },
  { id: "cloudwatch-adapter", repo: "exasol/cloudwatch-adapter", kind: "extension", install: "reference" },
  { id: "row-level-security", repo: "exasol/row-level-security-lua", kind: "extension", install: "db-scripts", source: { kind: "db-scripts", schema: "EXA_RLS" } },
  { id: "udf-api-java", repo: "exasol/udf-api-java", kind: "extension", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "udf-api-java" } },
  { id: "dbt-exasol-utils", repo: "exasol/dbt-exasol-utils", kind: "extension", install: "deliver", source: { kind: "deliver", format: "dbt-package" } },
  { id: "bucketfs-client", repo: "exasol/bucketfs-client", kind: "cli", install: "binary", source: { kind: "gh-asset", assetPattern: "^bfsc-[\\d.]+\\.jar$" } },
  { id: "parquet-edml-generator", repo: "exasol/parquet-edml-generator", kind: "cli", install: "deliver", source: { kind: "deliver", format: "source" } },
  { id: "slc-tool", repo: "exasol/script-languages-container-tool", kind: "cli", install: "uv-pip", source: { kind: "pypi", package: "exasol-script-languages-container-tool" } },
  { id: "bucketfs-java", repo: "exasol/bucketfs-java", kind: "driver", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "bucketfs-java" } },
  // ── Libraries & tooling ────────────────────────────────────────────────
  // The remainder of the published ecosystem: every other non-archived
  // exasol / exasol-labs repository that ships releases. These are depended
  // on rather than installed — Maven plugins, pytest fixtures, test
  // frameworks, error-reporting builders, shared virtual-schema libraries —
  // so they sit on their own shelf instead of among the things you install.
  // Listed because they are part of the ecosystem and people look for them,
  // and generated from the repository list rather than chosen by hand.
  { id: "ansible-collection", repo: "exasol/ansible-collection", kind: "library", install: "uv-pip", source: { kind: "pypi", package: "exasol-ansible-modules" } },
  { id: "ansible-runner-wrapper", repo: "exasol/ansible-runner-wrapper", kind: "library", install: "uv-pip", source: { kind: "pypi", package: "exasol-ansible-runner-wrapper" } },
  { id: "artifact-reference-checker-maven-plugin", repo: "exasol/artifact-reference-checker-maven-plugin", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "artifact-reference-checker-maven-plugin" } },
  { id: "autogenerated-resource-verifier-java", repo: "exasol/autogenerated-resource-verifier-java", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "autogenerated-resource-verifier-java" } },
  { id: "ci-isolation-aws", repo: "exasol/ci-isolation-aws", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "ci-isolation-aws" } },
  { id: "cloudwatch-dashboard-examples", repo: "exasol/cloudwatch-dashboard-examples", kind: "library", install: "reference" },
  { id: "compatibility-test-suite", repo: "exasol/compatibility-test-suite", kind: "library", install: "reference" },
  { id: "connection-parameter-specification", repo: "exasol/connection-parameter-specification", kind: "library", install: "reference" },
  { id: "database-cleaner", repo: "exasol/database-cleaner", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "database-cleaner" } },
  { id: "db-fundamentals-java", repo: "exasol/db-fundamentals-java", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "db-fundamentals-java" } },
  { id: "edml-java", repo: "exasol/edml-java", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "edml-java" } },
  { id: "error-catalog", repo: "exasol/error-catalog", kind: "library", install: "binary", source: { kind: "gh-asset", assetPattern: "^error-catalog-[\\d.]+\\.jar$" } },
  { id: "error-code-crawler-maven-plugin", repo: "exasol/error-code-crawler-maven-plugin", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "error-code-crawler-maven-plugin" } },
  { id: "error-code-model-java", repo: "exasol/error-code-model-java", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "error-code-model-java" } },
  { id: "error-reporting-go", repo: "exasol/error-reporting-go", kind: "library", install: "package", source: { kind: "registry", registry: "goproxy", package: "github.com/exasol/error-reporting-go" } },
  { id: "error-reporting-java", repo: "exasol/error-reporting-java", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "error-reporting-java" } },
  { id: "error-reporting-lua", repo: "exasol/error-reporting-lua", kind: "library", install: "deliver", source: { kind: "deliver", format: "rockspec", assetPattern: "^exaerror-[\\d.]+-\\d+\\.rockspec$" } },
  { id: "error-reporting-python", repo: "exasol/error-reporting-python", kind: "library", install: "uv-pip", source: { kind: "pypi", package: "exasol-error-reporting" } },
  { id: "exasol-java-tutorial", repo: "exasol/exasol-java-tutorial", kind: "library", install: "reference" },
  { id: "exasol-local-vm", repo: "exasol/exasol-local-vm", kind: "library", install: "reference" },
  { id: "exasol-python-test-framework", repo: "exasol/exasol-python-test-framework", kind: "library", install: "uv-pip", source: { kind: "pypi", package: "exasol-python-test-framework" } },
  { id: "exasol-test-setup-abstraction-java", repo: "exasol/exasol-test-setup-abstraction-java", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "exasol-test-setup-abstraction-java" } },
  { id: "exasol-test-setup-abstraction-server", repo: "exasol/exasol-test-setup-abstraction-server", kind: "library", install: "binary", source: { kind: "gh-asset", assetPattern: "^exasol-test-setup-abstraction-server-[\\d.]+\\.jar$" } },
  { id: "exasol-testcontainers", repo: "exasol/exasol-testcontainers", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "exasol-testcontainers" } },
  { id: "hamcrest-resultset-matcher", repo: "exasol/hamcrest-resultset-matcher", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "hamcrest-resultset-matcher" } },
  { id: "import-export-udf-common-scala", repo: "exasol/import-export-udf-common-scala", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "import-export-udf-common-scala" } },
  { id: "integration-test-docker-environment", repo: "exasol/integration-test-docker-environment", kind: "library", install: "uv-pip", source: { kind: "pypi", package: "exasol-integration-test-docker-environment" } },
  { id: "java-util-logging-testing", repo: "exasol/java-util-logging-testing", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "java-util-logging-testing" } },
  { id: "lua-styleguide", repo: "exasol/lua-styleguide", kind: "library", install: "reference" },
  { id: "maven-plugin-integration-testing", repo: "exasol/maven-plugin-integration-testing", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "maven-plugin-integration-testing" } },
  { id: "maven-project-version-getter", repo: "exasol/maven-project-version-getter", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "maven-project-version-getter" } },
  { id: "parquet-io-java", repo: "exasol/parquet-io-java", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "parquet-io-java" } },
  { id: "performance-test-recorder-java", repo: "exasol/performance-test-recorder-java", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "performance-test-recorder-java" } },
  { id: "project-keeper", repo: "exasol/project-keeper", kind: "library", install: "binary", source: { kind: "gh-asset", assetPattern: "^project-keeper-cli-[\\d.]+\\.jar$" } },
  { id: "pytest-backend", repo: "exasol/pytest-backend", kind: "library", install: "uv-pip", source: { kind: "pypi", package: "pytest-exasol-backend" } },
  { id: "pytest-exasol-benchmark", repo: "exasol/pytest-exasol-benchmark", kind: "library", install: "uv-pip", source: { kind: "pypi", package: "pytest-exasol-benchmark" } },
  { id: "pytest-extension", repo: "exasol/pytest-extension", kind: "library", install: "uv-pip", source: { kind: "pypi", package: "pytest-exasol-extension" } },
  { id: "pytest-slc", repo: "exasol/pytest-slc", kind: "library", install: "uv-pip", source: { kind: "pypi", package: "pytest-exasol-slc" } },
  { id: "python-extension-common", repo: "exasol/python-extension-common", kind: "library", install: "uv-pip", source: { kind: "pypi", package: "exasol-python-extension-common" } },
  { id: "python-toolbox", repo: "exasol/python-toolbox", kind: "library", install: "uv-pip", source: { kind: "pypi", package: "exasol-toolbox" } },
  { id: "release-droid", repo: "exasol/release-droid", kind: "library", install: "binary", source: { kind: "gh-asset", assetPattern: "^release-droid-[\\d.]+\\.jar$" } },
  { id: "remotelog-lua", repo: "exasol/remotelog-lua", kind: "library", install: "deliver", source: { kind: "deliver", format: "source" } },
  { id: "schemas", repo: "exasol/schemas", kind: "library", install: "reference" },
  { id: "script-languages", repo: "exasol/script-languages", kind: "library", install: "reference" },
  { id: "script-languages-container-ci", repo: "exasol/script-languages-container-ci", kind: "library", install: "uv-pip", source: { kind: "pypi", package: "exasol-script-languages-container-ci" } },
  { id: "script-languages-container-ci-setup", repo: "exasol/script-languages-container-ci-setup", kind: "library", install: "uv-pip", source: { kind: "pypi", package: "exasol-script-languages-container-ci-setup" } },
  { id: "script-languages-package-management", repo: "exasol/script-languages-package-management", kind: "library", install: "uv-pip", source: { kind: "pypi", package: "exasol-script-languages-package-management" } },
  { id: "small-json-files-test-fixture", repo: "exasol/small-json-files-test-fixture", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "small-json-files-test-fixture" } },
  { id: "spark-connector-common-java", repo: "exasol/spark-connector-common-java", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "spark-connector-common-java" } },
  { id: "sql-statement-builder", repo: "exasol/sql-statement-builder", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "sql-statement-builder" } },
  { id: "telemetry-client-python", repo: "exasol/telemetry-client-python", kind: "library", install: "uv-pip", source: { kind: "pypi", package: "exasol-telemetry-client" } },
  { id: "telemetry-java", repo: "exasol/telemetry-java", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "telemetry-java" } },
  { id: "test-db-builder-java", repo: "exasol/test-db-builder-java", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "test-db-builder-java" } },
  { id: "test-db-builder-python", repo: "exasol/test-db-builder-python", kind: "library", install: "uv-pip", source: { kind: "pypi", package: "test-db-builder-python" } },
  { id: "tutorials", repo: "exasol/tutorials", kind: "library", install: "reference" },
  { id: "udf-debugging-java", repo: "exasol/udf-debugging-java", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "udf-debugging-java" } },
  { id: "udf-mock-python", repo: "exasol/udf-mock-python", kind: "library", install: "uv-pip", source: { kind: "pypi", package: "exasol-udf-mock-python" } },
  { id: "udf-runner-cpp", repo: "exasol/udf-runner-cpp", kind: "library", install: "deliver", source: { kind: "deliver", format: "source" } },
  { id: "virtual-schema-common-document", repo: "exasol/virtual-schema-common-document", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "virtual-schema-common-document" } },
  { id: "virtual-schema-common-document-files", repo: "exasol/virtual-schema-common-document-files", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "virtual-schema-common-document-files" } },
  { id: "virtual-schema-common-java", repo: "exasol/virtual-schema-common-java", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "virtual-schema-common-java" } },
  { id: "virtual-schema-common-jdbc", repo: "exasol/virtual-schema-common-jdbc", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "virtual-schema-common-jdbc" } },
  { id: "virtual-schema-shared-integration-tests", repo: "exasol/virtual-schema-shared-integration-tests", kind: "library", install: "maven", source: { kind: "maven", group: "com.exasol", artifact: "virtual-schema-shared-integration-tests" } },
  { id: "virtual-schemas", repo: "exasol/virtual-schemas", kind: "library", install: "reference" },
  {
    id: "exa-agent",
    repo: "Sheetaldharshan200/exa-engine",
    kind: "server",
    install: "bundled",
    name: "Exa Agent Engine",
    description: "The engine behind Studio's AI panel. Updates independently of Studio releases; sessions are kept across engine switches.",
  },
];

/**
 * The virtual schema adapters, as catalog items.
 *
 * Appended rather than written out: they are derived from the adapter
 * registry (see vs-catalog.ts), so the shelf is always exactly the adapters
 * the add-data-source flow can install.
 */
CATALOG.push(...VS_CATALOG);

/** The repos whose metadata the marketplace needs. */
export function catalogRepos(): string[] {
  return CATALOG.flatMap((i) => (i.repo ? [i.repo] : []));
}

/** The repo's own name ("owner/repo-name" → "repo-name") — the loading-state
 *  fallback, chosen so the title never shifts once the metadata arrives. */
export function repoDisplayName(repo: string): string {
  const tail = repo.split("/").pop() ?? repo;
  return tail || repo;
}

/**
 * Fill an item's display fields. Explicit `name`/`description` on the entry are
 * deliberate OVERRIDES and win (a repo's About line is not always a product
 * description — some About lines read "Documentation for…"); GitHub metadata
 * fills everything not overridden; safe fallbacks cover loading/offline.
 */
export function resolveCatalogItem(
  item: CatalogItem,
  meta: Record<string, RepoMeta> | null,
): ResolvedCatalogItem {
  const m = item.repo ? meta?.[item.repo] : undefined;
  return {
    ...item,
    name: item.name || m?.name || (item.repo ? repoDisplayName(item.repo) : item.id),
    description: item.description ?? (m ? m.description : null) ?? "",
    homepage: item.homepage || m?.htmlUrl || (item.repo ? `https://github.com/${item.repo}` : ""),
    stars: m?.stars ?? null,
    pushedAt: m?.pushedAt ?? null,
  };
}

export function resolveCatalog(meta: Record<string, RepoMeta> | null): ResolvedCatalogItem[] {
  return CATALOG.map((i) => resolveCatalogItem(i, meta));
}

/**
 * Repo metadata mined from catalog.json (whose cron fetches GitHub
 * AUTHENTICATED, so it's immune to the 60/hr unauthenticated rate limit that
 * silently empties the app's own `market_repo_meta` calls). Used as the base
 * layer under live metadata.
 */
export function metaFromCatalogItems(
  items:
    | Record<
        string,
        {
          repo?: string;
          homepage?: string;
          name?: string | null;
          description?: string | null;
          stars?: number | null;
          pushedAt?: string | null;
        }
      >
    | null
    | undefined,
): Record<string, RepoMeta> {
  const out: Record<string, RepoMeta> = {};
  for (const entry of Object.values(items ?? {})) {
    if (!entry?.repo || !entry.name) continue;
    out[entry.repo] = {
      name: entry.name,
      description: entry.description ?? null,
      htmlUrl: entry.homepage || `https://github.com/${entry.repo}`,
      // Carried by the mirror so a card is complete WITHOUT the app's own
      // unauthenticated call, which returns nothing once the hour's 60
      // requests are gone — the reason cards read "No description yet".
      stars: entry.stars ?? null,
      pushedAt: entry.pushedAt ?? null,
    };
  }
  return out;
}

const META_SNAPSHOT_KEY = "exasol-studio-repo-meta";

/** Last-known repo metadata, for instant paint before the IPC answers. */
export function readMetaSnapshot(): Record<string, RepoMeta> | null {
  try {
    const raw = window.localStorage.getItem(META_SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as Record<string, RepoMeta>) : null;
  } catch {
    return null;
  }
}

export function writeMetaSnapshot(meta: Record<string, RepoMeta>): void {
  try {
    window.localStorage.setItem(META_SNAPSHOT_KEY, JSON.stringify(meta));
  } catch {
    /* quota/private mode — snapshot is best-effort */
  }
}
