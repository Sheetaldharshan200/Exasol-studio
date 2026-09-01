import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CATALOG,
  catalogRepos,
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

test("repoDisplayName handles odd shapes", () => {
  assert.equal(repoDisplayName("exasol/pyexasol"), "pyexasol");
  assert.equal(repoDisplayName("plain"), "plain");
  assert.equal(repoDisplayName("trailing/"), "trailing/");
});
