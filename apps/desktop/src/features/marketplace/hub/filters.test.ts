import test from "node:test";
import assert from "node:assert/strict";
import { activeChips, applyFilters, compactCount, emptyFilters, filterCount, relativeAge, resultRange, sectionOf } from "./filters.ts";
import type { ResolvedCatalogItem } from "../catalog-data.ts";
import type { ItemState } from "../item-state.ts";

const it = (id: string, over: Partial<ResolvedCatalogItem> = {}): ResolvedCatalogItem => ({
  id, kind: "cli", install: "binary", name: id, description: "", homepage: "", stars: null, pushedAt: null, ...over,
});
const items = [
  it("exapump", { labs: true, pushedAt: "2026-09-01" }),
  it("pyexasol", { kind: "driver", pushedAt: "2026-09-20" }),
  it("mcp-server", { kind: "server", name: "MCP Server", pushedAt: "2026-08-01" }),
  it("json-tables", { kind: "extension", labs: true }),
];
const states: Record<string, ItemState> = {
  exapump: { kind: "installed", installed: "1", available: null },
  pyexasol: { kind: "install", available: null },
  "mcp-server": { kind: "update", installed: "1", available: "2" },
  "json-tables": { kind: "install", available: null },
};
const stateOf = (i: ResolvedCatalogItem) => states[i.id];

test("no query, no filters, suggested → catalog order untouched", () => {
  assert.deepEqual(applyFilters(items, stateOf, "", emptyFilters(), "suggested").map((i) => i.id), ["exapump", "pyexasol", "mcp-server", "json-tables"]);
});

test("trust boxes OR within the rail; rails AND across", () => {
  const f = emptyFilters();
  f.trust.add("labs");
  assert.deepEqual(applyFilters(items, stateOf, "", f, "suggested").map((i) => i.id), ["exapump", "json-tables"]);
  f.trust.add("installed");
  assert.deepEqual(applyFilters(items, stateOf, "", f, "suggested").map((i) => i.id), ["exapump", "mcp-server", "json-tables"], "labs OR installed");
  f.sections.add("extension");
  assert.deepEqual(applyFilters(items, stateOf, "", f, "suggested").map((i) => i.id), ["json-tables"], "(labs OR installed) AND extensions");
});

test("installed filter counts update, running, ready and on-system as installed", () => {
  const f = emptyFilters();
  f.trust.add("installed");
  const st: Record<string, ItemState> = { a: { kind: "running", installed: null, available: null }, b: { kind: "ready", installed: null }, c: { kind: "onSystem" }, d: { kind: "reference" } };
  const list = [it("a"), it("b"), it("c"), it("d")];
  assert.deepEqual(applyFilters(list, (i) => st[i.id], "", f, "suggested").map((i) => i.id), ["a", "b", "c"]);
});

test("sorts: name A–Z; recently updated puts unknown dates last", () => {
  assert.deepEqual(applyFilters(items, stateOf, "", emptyFilters(), "name").map((i) => i.id), ["exapump", "json-tables", "MCP Server", "pyexasol"].map((n) => items.find((i) => i.name === n)!.id));
  assert.deepEqual(applyFilters(items, stateOf, "", emptyFilters(), "updated").map((i) => i.id), ["pyexasol", "exapump", "mcp-server", "json-tables"]);
});

test("a query ranks by relevance and still respects the filters", () => {
  const f = emptyFilters();
  f.sections.add("drivers");
  assert.deepEqual(applyFilters(items, stateOf, "exa", f, "suggested").map((i) => i.id), ["pyexasol"]);
  assert.deepEqual(applyFilters(items, stateOf, "zzzz", emptyFilters(), "suggested"), []);
});

test("chips mirror the filters and remove exactly one", () => {
  const f = emptyFilters();
  f.trust.add("official");
  f.sections.add("ai");
  const chips = activeChips(f);
  assert.deepEqual(chips.map((c) => c.label), ["Official Exasol", "AI & Agents"]);
  assert.equal(filterCount(f), 2);
  const g = chips[0].remove(f);
  assert.equal(g.trust.size, 0);
  assert.equal(g.sections.size, 1, "the other rail is untouched");
});

test("sections cover every kind", () => {
  for (const k of ["database", "cloud", "cli", "driver", "extension", "server", "skills", "bi"] as const) assert.ok(sectionOf(k));
});

test("result range, compact counts and relative age read like Docker Hub", () => {
  assert.equal(resultRange(24, 2500), "1 - 24 of 2500 results");
  assert.equal(resultRange(3, 1), "1 - 1 of 1 result");
  assert.equal(resultRange(0, 0), "0 results");
  assert.equal(compactCount(23), "23");
  assert.equal(compactCount(1600), "1.6K");
  assert.equal(compactCount(100_500), "100K+");
  assert.equal(compactCount(10_000_000), "10M");
  assert.equal(compactCount(null), null);
  const now = Date.parse("2026-09-22T00:00:00Z");
  assert.equal(relativeAge("2026-09-22T00:00:00Z", now), "today");
  assert.equal(relativeAge("2026-09-19T00:00:00Z", now), "3 days ago");
  assert.equal(relativeAge("2026-06-01T00:00:00Z", now), "3 mo ago");
  assert.equal(relativeAge("garbage", now), null);
});
