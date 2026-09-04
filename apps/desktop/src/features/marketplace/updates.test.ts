import assert from "node:assert/strict";
import { test } from "node:test";
import { countCatalogUpdates, countManagedUpdates, isNewerVersion } from "./updates.ts";
import type { ComponentInfo, InstalledItem, MarketCatalog } from "@/lib/ipc";

test("isNewerVersion: strictly-newer only, tolerant of v-prefix, rejects non-numeric", () => {
  assert.equal(isNewerVersion("1.2.0", "1.1.9"), true);
  assert.equal(isNewerVersion("v2.0.0", "1.9.9"), true);
  assert.equal(isNewerVersion("1.2.0", "1.2.0"), false); // equal
  assert.equal(isNewerVersion("1.1.0", "1.2.0"), false); // older
  assert.equal(isNewerVersion("main", "1.0.0"), false); // non-numeric
  assert.equal(isNewerVersion(null, "1.0.0"), false);
  assert.equal(isNewerVersion("1.0.0", undefined), false);
});

const catalog = (items: Record<string, { latest: string | null }>): MarketCatalog => ({
  generatedAt: null,
  mirrorRepo: "x/y",
  items: Object.fromEntries(Object.entries(items).map(([id, v]) => [id, { repo: "x/y", latest: v.latest, homepage: "" }])),
});
const inst = (id: string, version: string): InstalledItem => ({ id, version, path: "", filename: "" });

test("countCatalogUpdates counts only addons with a strictly-newer catalog latest, skips managed", () => {
  const c = catalog({ "some-addon": { latest: "2.0.0" }, exapump: { latest: "9.9.9" }, "up-to-date": { latest: "1.0.0" } });
  const installed = [inst("some-addon", "1.0.0"), inst("exapump", "1.0.0"), inst("up-to-date", "1.0.0")];
  const ids = ["some-addon", "exapump", "up-to-date", "not-installed"];
  // some-addon updatable; exapump is MANAGED (skipped); up-to-date equal; not-installed has no installed version.
  assert.equal(countCatalogUpdates(c, installed, ids), 1);
});

test("countCatalogUpdates is 0 when catalog is null", () => {
  assert.equal(countCatalogUpdates(null, [inst("a", "1.0.0")], ["a"]), 0);
});

const comp = (o: Partial<ComponentInfo> & { id: string }): ComponentInfo => ({
  id: o.id, name: o.id, repo: "x/y", installed: o.installed ?? null, verified: o.verified ?? "1.0.0",
  onOwnEnv: false, busy: false, updatable: true, pipManaged: true, opaqueVersion: o.opaqueVersion ?? false,
});

test("countManagedUpdates: newer tag, not-installed, and opaque drift each count once", () => {
  const comps = [
    comp({ id: "personal", installed: "1.0.0" }), // newer upstream tag → 1
    comp({ id: "mcp-server", installed: "2.0.0" }), // upstream equal → 0
    comp({ id: "exapump", installed: null }), // not installed → 1
    comp({ id: "semantic-views", installed: "abc", verified: "def", opaqueVersion: true }), // opaque drift → 1
    comp({ id: "aligned", installed: "xyz", verified: "xyz", opaqueVersion: true }), // opaque aligned → 0
  ];
  const upstream = { personal: "1.1.0", "mcp-server": "2.0.0" };
  assert.equal(countManagedUpdates(comps, upstream), 3);
});
