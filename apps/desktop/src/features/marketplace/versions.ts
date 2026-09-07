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

export type VersionSource = { source: "github" | "pypi" | "maven-exasol-jdbc"; reference: string };

/** How to list an item's versions — null when the item has no version-addressable
 *  install (reference links, docker lifecycles, bundled skills, source builds). */
export function versionSource(item: Pick<CatalogItem, "id" | "repo" | "install">): VersionSource | null {
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
