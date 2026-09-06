/**
 * The marketplace catalog registry — deliberately minimal so adding an addon
 * is ONE entry: `{ id, repo, kind, install }`. Everything the user sees —
 * the product name, the about line, the homepage — resolves dynamically from
 * the official GitHub repo (via `market_repo_meta`, disk-cached in Rust), so
 * the marketplace always shows exactly what the repo shows. Items without a
 * repo (docs-hosted drivers) carry their own `name`/`description`/`homepage`.
 */

export type Kind = "database" | "cli" | "driver" | "server" | "extension" | "skills" | "cloud" | "bi";
export type Install =
  | "personal-local"
  | "personal-cloud"
  | "binary"
  | "uv-tool"
  | "uv-pip"
  | "source-build"
  | "semantic-views"
  | "bundled"
  | "community-docker"
  | "reference";

export type CatalogItem = {
  id: string;
  repo?: string;
  kind: Kind;
  install: Install;
  labs?: boolean;
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
};

/** What GitHub says about a repo (subset of GET /repos/{owner}/{repo}). */
export type RepoMeta = { name: string; description: string | null; htmlUrl: string };

// Official Exasol / Exasol-Labs repositories only.
export const CATALOG: CatalogItem[] = [
  { id: "exasol-personal", repo: "exasol/exasol-personal", kind: "database", install: "personal-local" },
  // Full Exasol 8 in Docker (BucketFS, virtual schemas, extensions; ≤10 GiB).
  // Lifecycle is managed by the community_db Rust commands: Docker checks,
  // live version tags from Docker Hub, pull/run, start/stop/remove.
  {
    id: "exasol-community",
    repo: "exasol/docker-db",
    kind: "database",
    install: "community-docker",
    // Override: the repo's About line reads "Documentation for the Docker
    // version…", which mislabels a full database as documentation.
    name: "Exasol Community",
    description: "Full Exasol 8 database running in Docker — BucketFS, virtual schemas and extensions, up to 10 GiB of data. Free for evaluation and development.",
  },
  { id: "exapump", repo: "exasol-labs/exapump", kind: "cli", install: "binary", labs: true },
  { id: "semantic-views", repo: "exasol-labs/exasol-semantic-views", kind: "extension", install: "semantic-views", labs: true },
  { id: "json-tables", repo: "exasol-labs/exasol-json-tables", kind: "extension", install: "source-build", labs: true },
  { id: "mcp-server", repo: "exasol/mcp-server", kind: "server", install: "uv-tool" },
  { id: "pyexasol", repo: "exasol/pyexasol", kind: "driver", install: "uv-pip" },
  { id: "sqlalchemy-exasol", repo: "exasol/sqlalchemy-exasol", kind: "driver", install: "uv-pip" },
  { id: "exarrow-rs", repo: "exasol-labs/exarrow-rs", kind: "driver", install: "reference", labs: true },
  {
    id: "driver-jdbc",
    kind: "driver",
    install: "reference",
    name: "JDBC Driver",
    description: "JDBC driver for Java tools.",
    homepage: "https://docs.exasol.com/db/latest/connect_exasol/drivers/jdbc.htm",
  },
  {
    id: "driver-odbc",
    kind: "driver",
    install: "reference",
    name: "ODBC Driver",
    description: "ODBC driver for apps and BI tools.",
    homepage: "https://docs.exasol.com/db/latest/connect_exasol/drivers/odbc.htm",
  },
  { id: "driver-ts", repo: "exasol/exasol-driver-ts", kind: "driver", install: "reference" },
  { id: "driver-go", repo: "exasol/exasol-driver-go", kind: "driver", install: "reference" },
  {
    id: "driver-adonet",
    kind: "driver",
    install: "reference",
    name: "ADO.NET Provider",
    description: "ADO.NET provider for .NET.",
    homepage: "https://docs.exasol.com/db/latest/connect_exasol/drivers/ado.net.htm",
  },
  {
    id: "driver-r",
    kind: "driver",
    install: "reference",
    name: "R Integration",
    description: "R integration for Exasol.",
    homepage: "https://docs.exasol.com/db/latest/connect_exasol/drivers/r.htm",
  },
  { id: "driver-websocket", repo: "exasol/websocket-api", kind: "driver", install: "reference" },
  { id: "notebook-connector", repo: "exasol/notebook-connector", kind: "driver", install: "uv-pip" },
  { id: "dbt-exasol", repo: "exasol/dbt-exasol", kind: "extension", install: "uv-pip" },
  { id: "exasol-scheduler", repo: "exasol-labs/exasol-scheduler", kind: "cli", install: "reference", labs: true },
  { id: "dash-server", repo: "exasol-labs/dash-server", kind: "bi", install: "reference", labs: true },
  { id: "grafana-datasource", repo: "exasol-labs/grafana-datasource", kind: "bi", install: "reference", labs: true },
  { id: "tableau-connector", repo: "exasol/tableau-connector", kind: "bi", install: "reference" },
  { id: "terraform-provider", repo: "exasol-labs/terraform-provider-exasol", kind: "cli", install: "reference", labs: true },
  { id: "postgres-interface", repo: "exasol-labs/exa-postgres-interface", kind: "server", install: "reference", labs: true },
  { id: "mongodb-vs", repo: "exasol-labs/exasol-mongodb-vs", kind: "extension", install: "reference", labs: true },
  { id: "more-functions", repo: "exasol-labs/more-functions", kind: "extension", install: "reference", labs: true },
  { id: "ai-lab", repo: "exasol/ai-lab", kind: "extension", install: "uv-pip" },
  { id: "agent-skills", repo: "exasol-labs/exasol-agent-skills", kind: "skills", install: "bundled", labs: true },
];

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
 * description — exasol/docker-db's says "Documentation for…"); GitHub metadata
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
  items: Record<string, { repo?: string; homepage?: string; name?: string | null; description?: string | null }> | null | undefined,
): Record<string, RepoMeta> {
  const out: Record<string, RepoMeta> = {};
  for (const entry of Object.values(items ?? {})) {
    if (!entry?.repo || !entry.name) continue;
    out[entry.repo] = {
      name: entry.name,
      description: entry.description ?? null,
      htmlUrl: entry.homepage || `https://github.com/${entry.repo}`,
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
