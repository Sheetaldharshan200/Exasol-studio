import test from "node:test";
import assert from "node:assert/strict";
import { countUpdates, itemState, stateLabel, type ItemSources } from "./item-state.ts";
import type { ResolvedCatalogItem } from "./catalog-data.ts";

const item = (over: Partial<ResolvedCatalogItem>): ResolvedCatalogItem => ({
  id: "x", kind: "cli", install: "binary", name: "X", description: "", homepage: "", stars: null, pushedAt: null, ...over,
});
const sources = (over: Partial<ItemSources> = {}): ItemSources => ({
  installed: {},
  componentUpstream: {},
  detected: {},
  installing: new Set(),
  latestFor: () => null,
  releaseAssets: () => [],
  env: { os: "macos", arch: "aarch64" },
  ...over,
});
/** installedMap entry — presence already established by detection. */
const present = (id: string, version: string) => ({ [id]: { id, version, path: "", filename: "" } });

test("managed component: newer upstream tag → update; equal → installed; older → installed (never a downgrade)", () => {
  const personal = item({ id: "exasol-personal", install: "personal-local", kind: "database" });
  const base = sources({ installed: present("exasol-personal", "2.2.0") });
  assert.deepEqual(itemState(personal, { ...base, componentUpstream: { personal: "2.3.0" } }), { kind: "update", installed: "2.2.0", available: "2.3.0" });
  assert.equal(itemState(personal, { ...base, componentUpstream: { personal: "2.2.0" } }).kind, "installed");
  assert.equal(itemState(personal, { ...base, componentUpstream: { personal: "2.1.9" } }).kind, "installed");
});

test("the local database reports running only when installed or detected AND up; an update still wins", () => {
  const personal = item({ id: "exasol-personal", install: "personal-local", kind: "database" });
  const up = sources({ installed: present("exasol-personal", "2.3.0"), detected: { "exasol-personal:running": true } });
  assert.equal(itemState(personal, up).kind, "running");
  assert.equal(itemState(personal, { ...up, componentUpstream: { personal: "2.4.0" } }).kind, "update", "an available update outranks the running state");
  assert.equal(itemState(personal, sources({ detected: { "exasol-personal": true } })).kind, "onSystem");
});

test("addon: catalog latest vs installed; non-numeric versions never count as an update", () => {
  // json-tables is an addon (not a managed component), so "latest" comes from the catalog
  const pump = item({ id: "json-tables" });
  const inst = { "json-tables": { id: "json-tables", version: "0.11.0", path: "", filename: "" } };
  assert.equal(itemState(pump, sources({ installed: inst, latestFor: () => "v0.12.0" })).kind, "update");
  assert.equal(itemState(pump, sources({ installed: inst, latestFor: () => "v0.11.0" })).kind, "installed");
  assert.equal(itemState(pump, sources({ installed: inst, latestFor: () => "nightly" })).kind, "installed");
  assert.equal(itemState(pump, sources({ installed: { "json-tables": { id: "json-tables", version: "latest", path: "", filename: "" } } })).kind, "installed");
});

test("not installed: reference → reference; binary with assets but none for the host → unavailable; else install", () => {
  assert.equal(itemState(item({ install: "reference" }), sources()).kind, "reference");
  const linuxOnly = [{ name: "tool_Linux_x86_64.tar.gz", url: "", size: 1 }];
  assert.deepEqual(itemState(item({}), sources({ releaseAssets: () => linuxOnly })), { kind: "unavailable", platform: "macOS" });
  assert.deepEqual(itemState(item({}), sources({ latestFor: () => "v2.0.0" })), { kind: "install", available: "v2.0.0" });
  assert.deepEqual(itemState(item({}), sources({ releaseAssets: () => [] })), { kind: "install", available: null }, "no assets yet: offer Install, do not guess unavailable");
});

test("installing beats everything, including reference and installed", () => {
  const s = sources({ installing: new Set(["x"]), installed: { x: { id: "x", version: "1", path: "", filename: "" } } });
  assert.equal(itemState(item({}), s).kind, "installing");
  assert.equal(itemState(item({ install: "reference" }), s).kind, "installing");
});

test("list_components alone never makes a managed component present — presence comes from installedMap", () => {
  const personal = item({ id: "exasol-personal", install: "personal-local", kind: "database" });
  assert.equal(itemState(personal, sources({ componentUpstream: { personal: "2.3.0" } })).kind, "install");
});

test("runs-inside-Studio drivers: ready when the runtime is, installing while busy, else install — and an update still outranks ready", () => {
  const jdbc = item({ id: "driver-jdbc", install: "maven", kind: "driver" });
  assert.equal(itemState(jdbc, sources({ driverRuntime: { id: "jdbc", ready: true, busy: false } })).kind, "ready");
  const st = itemState(jdbc, sources({ driverRuntime: { id: "jdbc", ready: true, busy: false }, installed: present("driver-jdbc", "24.1.0"), latestFor: () => "25.2.0" }));
  assert.deepEqual(st, { kind: "update", installed: "24.1.0", available: "25.2.0" });
  assert.equal(itemState(jdbc, sources({ driverRuntime: { id: "jdbc", ready: false, busy: true } })).kind, "installing");
  assert.equal(itemState(jdbc, sources({ driverRuntime: { id: "jdbc", ready: false, busy: false } })).kind, "install");
});

test("semantic views names the database it landed in", () => {
  const sv = item({ id: "semantic-views", install: "semantic-views", kind: "extension" });
  const s = sources({ installed: { "semantic-views": { id: "semantic-views", version: "1.2.0", path: "", filename: "", note: "Installed in Prod warehouse." } } });
  const st = itemState(sv, s);
  assert.equal(st.kind, "installed");
  assert.equal(stateLabel(st), "Installed in Prod warehouse");
});

test("labels are short and name the version when they have one", () => {
  assert.equal(stateLabel({ kind: "update", installed: "1", available: "2.0.0" }), "Update 2.0.0");
  assert.equal(stateLabel({ kind: "install", available: null }), "Install");
  assert.equal(stateLabel({ kind: "unavailable", platform: "macOS" }), "No macOS build");
});

test("countUpdates is the same decision, summed", () => {
  const items = [item({ id: "json-tables" }), item({ id: "exasol-personal", install: "personal-local" }), item({ id: "exapump" })];
  const s = sources({
    installed: { ...present("json-tables", "1.0.0"), ...present("exasol-personal", "2.2.0"), ...present("exapump", "0.9.0") },
    componentUpstream: { personal: "2.3.0", exapump: "0.9.0" },
    latestFor: (id) => (id === "json-tables" ? "1.1.0" : null),
  });
  assert.equal(countUpdates(items, s), 2);
});
