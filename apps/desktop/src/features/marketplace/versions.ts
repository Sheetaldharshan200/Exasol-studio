// Where an item's LIVE version list comes from — pure, so the routing is
// unit-tested. Any listed version is installable, not just the newest:
// GitHub-release items resolve the chosen tag's assets, PyPI items install
// `pkg==version`, the JDBC driver downloads that exact jar from Maven Central.

import type { CatalogItem } from "./catalog-data";

export type VersionSource = {
  source: "github" | "pypi" | "npm" | "goproxy" | "crates" | "exasol-downloads" | "maven-exasol-jdbc";
  reference: string;
};

/** How to list an item's versions — null when the item has no version-addressable
 *  install (reference links, bundled
 *  skills, source builds reconciled to a revision). */
export function versionSource(item: Pick<CatalogItem, "id" | "repo" | "install" | "source">): VersionSource | null {
  // The item's own coordinate answers this for everything that has one. It
  // used to be two tables keyed by item id, which is the same coupling that
  // left the catalogue with installers for eight of its items.
  const src = item.source;
  if (src) {
    switch (src.kind) {
      case "pypi":
        return { source: "pypi", reference: src.package };
      case "registry":
        return { source: src.registry, reference: src.package };
      case "gh-asset":
      case "host-plugin":
        return item.repo ? { source: "github", reference: item.repo } : null;
      case "maven":
        // Maven versions come from Maven Central's own metadata, never from
        // the repo's release tags — the two drift badly (bucketfs-java is
        // 5.0.1 on GitHub and 3.2.3 on Maven Central).
        return { source: "maven-exasol-jdbc", reference: `${src.group}:${src.artifact}` };
    }
  }
  // The AI engine is bundled but updates from its release repo.
  if (item.id === "exa-agent" && item.repo) return { source: "github", reference: item.repo };
  // Exasol Personal: official engine releases — a pick on the card switches
  // the managed engine via the verify-or-refuse update path (backup-first).
  if (item.install === "personal-local" && item.repo) return { source: "github", reference: item.repo };
  if (item.install === "maven") return { source: "maven-exasol-jdbc", reference: "exasol-jdbc" };
  if (item.install === "binary" && item.repo) return { source: "github", reference: item.repo };
  // A virtual schema adapter is installed from its repository's releases, the
  // same as a binary — the difference is where it lands (the database's
  // BucketFS), not where it comes from.
  if (item.install === "vs-adapter" && item.repo) return { source: "github", reference: item.repo };
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
