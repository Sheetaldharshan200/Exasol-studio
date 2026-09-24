#!/usr/bin/env node
/**
 * The marketplace catalog's item list, for the refresh workflow.
 *
 * `.github/workflows/update-catalog.yml` used to carry its own copy of this
 * list as a heredoc, which meant every marketplace change had to be made
 * twice. It drifted, as duplicated lists do: the workflow was still
 * refreshing `mongodb-vs` after it had been removed from the app, and
 * `apache/superset`, which the app never listed at all.
 *
 * So the registry in catalog-data.ts is the one source, and this prints what
 * the workflow needs: `id|repo|homepage`, one line per item that HAS a repo.
 * Repo-less items (the JDBC/ODBC/ADO.NET drivers, documented on
 * docs.exasol.com rather than GitHub) carry their own display text in the
 * app and have no release to look up, so they are left out.
 *
 *   node scripts/catalog-items.mjs
 */
import { CATALOG } from "../apps/desktop/src/features/marketplace/catalog-data.ts";

/**
 * Ids the APP installs that are not cards of their own.
 *
 * `exasol-cloud` is Exasol Personal in cloud mode — same repository, a
 * different install path in market.rs — so it needs a version in the catalog
 * without appearing twice in the gallery.
 */
const ALIASES = { "exasol-cloud": "exasol/exasol-personal" };

const line = (id, repo) => `${id}|${repo}|https://github.com/${repo}`;

const out = [];
for (const item of CATALOG) {
  if (!item.repo) continue;
  out.push(line(item.id, item.repo));
}
for (const [id, repo] of Object.entries(ALIASES)) out.push(line(id, repo));

console.log(out.join("\n"));
