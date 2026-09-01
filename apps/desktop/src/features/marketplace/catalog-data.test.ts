import assert from "node:assert/strict";
import { test } from "node:test";
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
