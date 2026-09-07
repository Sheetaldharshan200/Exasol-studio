// Where an item's LIVE version list comes from — pure, so the routing is
// unit-tested. Any listed version is installable, not just the newest:
// GitHub-release items resolve the chosen tag's assets, PyPI items install
// `pkg==version`, the JDBC driver downloads that exact jar from Maven Central.

import type { CatalogItem } from "./catalog-data";

/** The PyPI package behind each pip-installed catalog id (must mirror the
 *  Rust dispatch in market.rs). */
export const PYPI_PACKAGE: Record<string, string> = {
  pyexasol: "pyexasol",
  "sqlalchemy-exasol": "sqlalchemy-exasol",
  "mcp-server": "exasol-mcp-server",
  "dbt-exasol": "dbt-exasol",
  "notebook-connector": "exasol-notebook-connector",
};

export type VersionSource = {
  source: "github" | "pypi" | "dockerhub" | "npm" | "goproxy" | "crates" | "exasol-downloads" | "maven-exasol-jdbc";
  reference: string;
};

/** Native registry behind each `install: "package"` driver (must mirror the
 *  Rust install_registry_package dispatch). Independent downloads: any listed
 *  version lands in the marketplace folder, unpinned and unmanaged.
 *  driver-websocket is deliberately absent: a living spec with no releases —
 *  its install downloads the current snapshot, so there is nothing to list. */
export const PACKAGE_SOURCE: Record<string, VersionSource> = {
  "driver-ts": { source: "npm", reference: "@exasol/exasol-driver-ts" },
  "driver-go": { source: "goproxy", reference: "github.com/exasol/exasol-driver-go" },
  "exarrow-rs": { source: "crates", reference: "exarrow-rs" },
  "driver-r": { source: "github", reference: "exasol/r-exasol" },
  // The official Exasol downloads portal (machine-readable packages.json,
  // sha256-verified installs) — versions listed for the host platform only.
  "driver-odbc": { source: "exasol-downloads", reference: "ODBC" },
  "driver-adonet": { source: "exasol-downloads", reference: "ADO.NET" },
  // Not on PyPI — pip-installed from the GitHub tag tarball.
  "dash-server": { source: "github", reference: "exasol-labs/dash-server" },
  // more-functions is deliberately absent: no releases — snapshot install.
};

/** How to list an item's versions — null when the item has no version-addressable
 *  install (reference links, the Community docker lifecycle card, bundled
 *  skills, source builds reconciled to a revision). */
export function versionSource(item: Pick<CatalogItem, "id" | "repo" | "install">): VersionSource | null {
  // AI Lab installs as a Docker image, not a pip package — its versions are
  // Docker Hub tags (must mirror the Rust install_ai_lab dispatch).
  if (item.id === "ai-lab") return { source: "dockerhub", reference: "exasol/ai-lab" };
  // The AI engine is bundled but updates from its release repo.
  if (item.id === "exa-agent" && item.repo) return { source: "github", reference: item.repo };
  // Exasol Personal: official engine releases — a pick on the card switches
  // the managed engine via the verify-or-refuse update path (backup-first).
  if (item.install === "personal-local" && item.repo) return { source: "github", reference: item.repo };
  if (item.install === "package") return PACKAGE_SOURCE[item.id] ?? null;
  if (item.install === "maven") return { source: "maven-exasol-jdbc", reference: "exasol-jdbc" };
  if ((item.install === "uv-pip" || item.install === "uv-tool") && PYPI_PACKAGE[item.id]) {
    return { source: "pypi", reference: PYPI_PACKAGE[item.id] };
  }
  if (item.install === "binary" && item.repo) return { source: "github", reference: item.repo };
  return null;
}

/** Version source for a MANAGED component on the Updates tab (component id +
 *  the repo `list_components` reports for it). mcp-server installs via pip, so
 *  PyPI is its truth; Semantic Views is an opaque DB-side revision (no list);
 *  every binary component (personal, exapump, exa-agent) lists its repo's
 *  GitHub release tags. */
export function componentVersionSource(componentId: string, repo?: string | null): VersionSource | null {
  if (componentId === "mcp-server") return { source: "pypi", reference: "exasol-mcp-server" };
  if (componentId === "semantic-views") return null;
  return repo ? { source: "github", reference: repo } : null;
}
