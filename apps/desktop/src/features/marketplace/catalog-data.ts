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
 * Fill an item's display fields: GitHub metadata first (the exact repo name
 * and About line), the item's own fields for repo-less entries, safe
 * fallbacks while metadata is loading or unavailable.
 */
export function resolveCatalogItem(
  item: CatalogItem,
  meta: Record<string, RepoMeta> | null,
): ResolvedCatalogItem {
  const m = item.repo ? meta?.[item.repo] : undefined;
  return {
    ...item,
    name: m?.name || item.name || (item.repo ? repoDisplayName(item.repo) : item.id),
    description: (m ? m.description : null) ?? item.description ?? "",
    homepage: m?.htmlUrl || item.homepage || (item.repo ? `https://github.com/${item.repo}` : ""),
  };
}

export function resolveCatalog(meta: Record<string, RepoMeta> | null): ResolvedCatalogItem[] {
  return CATALOG.map((i) => resolveCatalogItem(i, meta));
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
