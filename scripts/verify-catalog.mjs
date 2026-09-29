#!/usr/bin/env node
/**
 * Check that every marketplace item still points at something real.
 *
 * Two things can rot silently. A card resolves its name, About line and stars
 * from GitHub at runtime, so a typo in a `repo` field fails nothing — it
 * renders a blank card. And an install dispatches on the item's coordinate,
 * so a PyPI name that does not exist, a Maven artifact that was never
 * published, or an asset pattern that upstream renamed away from fails
 * nothing either — until someone clicks Install. This makes both fail a run
 * instead of a click.
 *
 * Needs network and the `gh` CLI (for the repo check's token). Coordinate
 * checks go to the registries directly, and release assets are read from
 * github.com rather than the API, so they cost nothing against GitHub's
 * signed-out allowance. Run it by hand or on a schedule — not in the unit
 * suite, which is offline by design.
 *
 *   node scripts/verify-catalog.mjs
 */
import { execFileSync } from "node:child_process";
import { CATALOG } from "../apps/desktop/src/features/marketplace/catalog-data.ts";

const METADATA =
  /(\.sha256|\.sha1|\.md5|\.asc|\.sig|\.txt|\.json|(^|[^a-z])sha256sums?)$/i;

async function ok(url) {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "exasol-studio-verify" },
      redirect: "follow",
    });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

/** The newest tag and its asset names, from github.com — not the API. */
async function latestAssets(repo) {
  const feed = await ok(`https://github.com/${repo}/releases.atom`);
  const tag = feed
    ?.match(/tag:github\.com,2008:Repository\/\d+\/([^<]+)</)?.[1]
    ?.trim();
  if (!tag) return null;
  const page = await ok(
    `https://github.com/${repo}/releases/expanded_assets/${tag}`,
  );
  if (page === null) return null;
  const names = [
    ...new Set(
      [...page.matchAll(/releases\/download\/[^"]+/g)].map((m) =>
        m[0].split("/").pop(),
      ),
    ),
  ];
  return { tag, assets: names.filter((n) => !METADATA.test(n)) };
}

/** Why an item's coordinate does not resolve, or null when it does. */
async function coordinateProblem(item) {
  const s = item.source;
  if (!s) return null;
  switch (s.kind) {
    case "pypi":
      return (await ok(`https://pypi.org/pypi/${s.package}/json`))
        ? null
        : `PyPI has no package ${s.package}`;
    case "maven": {
      const xml = await ok(
        `https://repo1.maven.org/maven2/${s.group.replace(/\./g, "/")}/${s.artifact}/maven-metadata.xml`,
      );
      if (!xml) return `Maven Central has no ${s.group}:${s.artifact}`;
      return /<(latest|release)>/.test(xml)
        ? null
        : `Maven Central lists no versions for ${s.group}:${s.artifact}`;
    }
    case "registry": {
      const url = {
        npm: `https://registry.npmjs.org/${s.package.replace("/", "%2F")}`,
        goproxy: `https://proxy.golang.org/${s.package}/@latest`,
        crates: `https://crates.io/api/v1/crates/${s.package}`,
      }[s.registry];
      if (!url) return null; // the downloads portal has its own index
      return (await ok(url))
        ? null
        : `${s.registry} has no package ${s.package}`;
    }
    case "deliver": {
      if (!DELIVER_FORMATS.has(s.format))
        return `unknown deliver format ${JSON.stringify(s.format)}`;
      if (s.format === "rockspec" || s.format === "desktop-app")
        return releaseAssetProblem(item, s.assetPattern);
      // A source archive or dbt package needs only a tag to archive.
      if (!item.repo) return "a source archive needs a repository";
      return (await latestAssets(item.repo))
        ? null
        : `${item.repo} has no release tag to archive`;
    }
    case "host-plugin":
    case "gh-asset":
      return releaseAssetProblem(item, s.assetPattern);
    case "db-scripts": {
      // The install runs the release's .sql and .lua files; a release without any has nothing to run.
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s.schema ?? "")) return `schema ${JSON.stringify(s.schema)} is not one plain identifier`;
      const rel = item.repo ? await latestAssets(item.repo) : null;
      if (!rel) return `${item.repo} has no release to read`;
      return rel.assets.some((n) => /\.(sql|lua)$/.test(n)) ? null : `${rel.tag} of ${item.repo} ships no .sql or .lua file to run`;
    }
    case "slc":
      // The official launcher owns these; an alias must be one word it accepts.
      return s.alias === undefined || /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(s.alias) ? null : `alias ${JSON.stringify(s.alias)} is not one word`;
    default:
      return null; // pip-release, repo-snapshot, driver-runtime: the repo check is the check
  }
}

const DELIVER_FORMATS = new Set([
  "rockspec",
  "dbt-package",
  "source",
  "desktop-app",
]);

/** Why an item's release-asset pattern does not resolve, or null when it does. */
async function releaseAssetProblem(item, pattern) {
  if (!item.repo) return "a release asset needs a repository";
  const rel = await latestAssets(item.repo);
  if (!rel) return `${item.repo} has no release to read`;
  // A newest release with NO assets yet is upstream's state, not ours: a
  // tag cut before the files were uploaded (bucketfs-client 2.2.1 shipped
  // source-only for a while). The card already shows "unavailable" for
  // it. Only a pattern that disagrees with assets that DO exist is a
  // coordinate problem on our side.
  if (rel.assets.length === 0) {
    warnings.push(
      `${item.id}: ${item.repo} ${rel.tag} has no downloadable asset yet (source-only release upstream)`,
    );
    return null;
  }
  if (!pattern) return null;
  const hits = rel.assets.filter((n) => new RegExp(pattern).test(n));
  // A plural release is the point of a choosing item: any match will do.
  if (item.source.choose) return hits.length > 0 ? null : `pattern /${pattern}/ matched nothing in ${rel.tag}`;
  return hits.length === 1
    ? null
    : `pattern /${pattern}/ matched ${hits.length} of ${rel.assets.length} assets in ${rel.tag}: ${rel.assets.join(", ")}`;
}

const problems = [];
const warnings = [];
let coordinates = 0;
for (const item of CATALOG) {
  if (!item.repo) {
    if (!item.name || !item.description || !item.homepage)
      problems.push(
        `${item.id}: repo-less item is missing name/description/homepage`,
      );
    continue;
  }
  let meta;
  try {
    meta = JSON.parse(
      execFileSync(
        "gh",
        [
          "api",
          `repos/${item.repo}`,
          "--jq",
          "{name: .name, description: .description, archived: .archived}",
        ],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        },
      ),
    );
  } catch {
    problems.push(`${item.id}: repository ${item.repo} does not exist`);
    continue;
  }
  if (meta.archived) {
    problems.push(
      `${item.id}: ${item.repo} is archived — the card points at a dead project`,
    );
    continue;
  }
  if (!meta.description)
    problems.push(
      `${item.id}: ${item.repo} has no About line, so the card renders without a description`,
    );
  const why = await coordinateProblem(item);
  if (item.source) coordinates++;
  if (why) problems.push(`${item.id}: ${why}`);
  else
    console.log(
      `ok   ${item.id} → ${item.repo}${item.source ? ` [${item.source.kind}]` : ""}`,
    );
}

if (warnings.length) {
  console.warn(
    `\n${warnings.length} upstream warning(s) — nothing to fix here:`,
  );
  for (const w of warnings) console.warn(` ~ ${w}`);
}
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(` - ${p}`);
  process.exit(1);
}
console.log(
  `\nAll ${CATALOG.length} catalog items resolve; ${coordinates} install coordinates confirmed against their registries.`,
);
