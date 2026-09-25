#!/usr/bin/env node
/**
 * Check that every marketplace item still points at a real repository.
 *
 * Marketplace cards carry no display text of their own: the name, About line,
 * stars and homepage are resolved from GitHub at runtime. That keeps the
 * catalog honest, but it also means a typo in a `repo` field does not fail
 * anything — it renders a blank card. Nothing else would notice.
 *
 * So this asks GitHub about every repo in the registry and fails on one that
 * does not exist, has been archived (users should not be sent to a dead
 * project), or has no About line to show.
 *
 * Needs network and the `gh` CLI (for the API token). Run it manually, or on
 * a schedule — not in the unit-test suite, which is offline by design.
 *
 *   node scripts/verify-catalog.mjs
 */
import { execFileSync } from "node:child_process";
import { CATALOG } from "../apps/desktop/src/features/marketplace/catalog-data.ts";

const problems = [];

for (const item of CATALOG) {
  // Repo-less items (the JDBC/ODBC/ADO.NET drivers) carry their own display
  // text precisely because there is no repository to resolve it from.
  if (!item.repo) {
    if (!item.name || !item.description || !item.homepage) {
      problems.push(`${item.id}: repo-less item is missing name/description/homepage`);
    }
    continue;
  }
  let meta;
  try {
    meta = JSON.parse(
      execFileSync("gh", ["api", `repos/${item.repo}`, "--jq", "{name: .name, description: .description, archived: .archived}"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    problems.push(`${item.id}: repository ${item.repo} does not exist`);
    continue;
  }
  if (meta.archived) {
    problems.push(`${item.id}: ${item.repo} is archived — the card points at a dead project`);
    continue;
  }
  if (!meta.description) {
    problems.push(`${item.id}: ${item.repo} has no About line, so the card renders without a description`);
    continue;
  }
  console.log(`ok   ${item.id} → ${item.repo}`);
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(` - ${p}`);
  process.exit(1);
}
console.log(`\nAll ${CATALOG.length} catalog items resolve.`);
