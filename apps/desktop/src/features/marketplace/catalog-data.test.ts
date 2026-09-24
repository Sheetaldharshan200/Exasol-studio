import assert from "node:assert/strict";
import { test } from "node:test";
import { VS_ADAPTERS } from "../connection/virtual-schemas/adapters/index.ts";
import {
  CATALOG,
  catalogRepos,
  metaFromCatalogItems,
  repoDisplayName,
  resolveCatalogItem,
  type CatalogItem,
  type RepoMeta,
} from "./catalog-data.ts";

const repoItem: CatalogItem = { id: "mcp-server", repo: "exasol/mcp-server", kind: "server", install: "uv-tool" };

test("repo item resolves name/about/homepage from GitHub metadata", () => {
  const meta: Record<string, RepoMeta> = {
    "exasol/mcp-server": {
      name: "mcp-server",
      description: "MCP server for the Exasol database",
      htmlUrl: "https://github.com/exasol/mcp-server",
    },
  };
  const r = resolveCatalogItem(repoItem, meta);
  assert.equal(r.name, "mcp-server");
  assert.equal(r.description, "MCP server for the Exasol database");
  assert.equal(r.homepage, "https://github.com/exasol/mcp-server");
});

test("while metadata is loading the repo tail is the stable fallback name", () => {
  const r = resolveCatalogItem(repoItem, null);
  assert.equal(r.name, "mcp-server");
  assert.equal(r.description, "");
  assert.equal(r.homepage, "https://github.com/exasol/mcp-server");
});

test("a null GitHub description falls back without rendering 'null'", () => {
  const meta = { "exasol/mcp-server": { name: "mcp-server", description: null, htmlUrl: "https://github.com/exasol/mcp-server" } };
  assert.equal(resolveCatalogItem(repoItem, meta).description, "");
});

test("repo-less items keep their own fields untouched", () => {
  const jdbc = CATALOG.find((i) => i.id === "driver-jdbc")!;
  const r = resolveCatalogItem(jdbc, {});
  assert.equal(r.name, "JDBC Driver");
  assert.ok(r.homepage.includes("docs.exasol.com"));
});

test("every catalog item resolves to a non-empty name and homepage", () => {
  for (const item of CATALOG) {
    const r = resolveCatalogItem(item, null);
    assert.ok(r.name.length > 0, `${item.id} has no name`);
    assert.ok(r.homepage.length > 0, `${item.id} has no homepage`);
  }
});

test("catalogRepos lists only items with a repo, no duplicates lost", () => {
  const repos = catalogRepos();
  assert.ok(repos.includes("exasol/mcp-server"));
  assert.ok(!repos.some((r) => r === undefined || r === ""));
  assert.equal(repos.length, CATALOG.filter((i) => i.repo).length);
});

test("metaFromCatalogItems keys by repo, skips entries without repo or name", () => {
  const meta = metaFromCatalogItems({
    "exasol-personal": { repo: "exasol/exasol-personal", homepage: "https://github.com/exasol/exasol-personal", name: "exasol-personal", description: "The Analytics Database for Agentic AI" },
    "old-entry": { repo: "exasol/pyexasol", homepage: "" }, // pre-refresh catalog: no name yet
    "no-repo": { name: "x", description: "y" },
  });
  assert.equal(meta["exasol/exasol-personal"].description, "The Analytics Database for Agentic AI");
  assert.equal(meta["exasol/exasol-personal"].htmlUrl, "https://github.com/exasol/exasol-personal");
  assert.ok(!("exasol/pyexasol" in meta));
  assert.equal(Object.keys(meta).length, 1);
});

test("metaFromCatalogItems tolerates null/undefined input and fills homepage", () => {
  assert.deepEqual(metaFromCatalogItems(null), {});
  assert.deepEqual(metaFromCatalogItems(undefined), {});
  const meta = metaFromCatalogItems({ a: { repo: "o/r", name: "r", description: null } });
  assert.equal(meta["o/r"].htmlUrl, "https://github.com/o/r");
  assert.equal(meta["o/r"].description, null);
});

test("catalog meta feeds resolveCatalogItem end to end (the About line)", () => {
  const meta = metaFromCatalogItems({
    "exasol-personal": { repo: "exasol/exasol-personal", name: "exasol-personal", description: "The Analytics Database for Agentic AI" },
  });
  const item = CATALOG.find((i) => i.id === "exasol-personal")!;
  assert.equal(resolveCatalogItem(item, meta).description, "The Analytics Database for Agentic AI");
});

test("repoDisplayName handles odd shapes", () => {
  assert.equal(repoDisplayName("exasol/pyexasol"), "pyexasol");
  assert.equal(repoDisplayName("plain"), "plain");
  assert.equal(repoDisplayName("trailing/"), "trailing/");
});

test("every catalog id is unique — a duplicate would render two identical cards", () => {
  const ids = CATALOG.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate id in CATALOG: ${ids.filter((id, n) => ids.indexOf(id) !== n)}`);
});

test("every repo is a well-formed owner/name in an official org", () => {
  for (const item of CATALOG) {
    if (!item.repo) continue;
    assert.match(item.repo, /^[\w.-]+\/[\w.-]+$/, `${item.id}: repo shape`);
    const owner = item.repo.split("/")[0];
    assert.ok(["exasol", "exasol-labs", "Sheetaldharshan200"].includes(owner), `${item.id}: unofficial owner ${owner}`);
  }
});

test("a repo appears once, so the ecosystem list cannot drift into duplicates", () => {
  // Two cards on the same repo would show the same name and About line
  // twice, which is how a mis-merge of the ecosystem list would look.
  const repos = CATALOG.flatMap((i) => (i.repo ? [i.repo] : []));
  const dupes = repos.filter((r, n) => repos.indexOf(r) !== n);
  assert.deepEqual(dupes, [], `repo listed more than once: ${dupes}`);
});

test("items without a repo carry their own display text, since nothing can resolve it", () => {
  for (const item of CATALOG) {
    if (item.repo) continue;
    assert.ok(item.name && item.description && item.homepage, `${item.id}: repo-less item needs name/description/homepage`);
  }
});

test("the Virtual Schemas shelf is exactly the adapters, derived not listed", () => {
  const vs = CATALOG.filter((i) => i.kind === "vs");
  assert.equal(vs.length, VS_ADAPTERS.length, "one catalog item per adapter");
  assert.deepEqual(
    vs.map((i) => i.repo).sort(),
    VS_ADAPTERS.map((a) => a.repo).sort(),
    "the shelf cannot drift from the registry the add-source flow uses",
  );
});

test("a Lua adapter has nothing to stage, so it links instead of installing", () => {
  for (const a of VS_ADAPTERS) {
    const item = CATALOG.find((i) => i.id === `vs-${a.id}`)!;
    assert.ok(item, `${a.id} is on the shelf`);
    // Lua adapter source is inlined into the CREATE ADAPTER SCRIPT — there is
    // no artifact in BucketFS to update.
    assert.equal(item.install, a.runtime === "lua" ? "reference" : "vs-adapter", a.id);
  }
});

test("every release-bearing shelf gets used — no kind is declared and left empty", () => {
  for (const kind of ["vs", "library", "extension", "driver", "cli", "bi"] as const) {
    assert.ok(CATALOG.some((i) => i.kind === kind), `nothing is filed under "${kind}"`);
  }
});
