import assert from "node:assert/strict";
import { CATALOG } from "./catalog-data.ts";
import { test } from "node:test";
import { componentVersionSource, versionSource } from "./versions.ts";

test("pip items resolve to their real PyPI package", () => {
  // The coordinate comes from the ITEM now, not from a table keyed by its id.
  assert.deepEqual(
    versionSource({ id: "mcp-server", repo: "exasol/mcp-server", install: "uv-tool", source: { kind: "pypi", package: "exasol-mcp-server" } }),
    { source: "pypi", reference: "exasol-mcp-server" },
  );
  assert.deepEqual(
    versionSource({ id: "notebook-connector", repo: "exasol/notebook-connector", install: "uv-pip", source: { kind: "pypi", package: "exasol-notebook-connector" } }),
    { source: "pypi", reference: "exasol-notebook-connector" },
  );
});

test("ai-lab is a reference item — a container image Studio only links to — so it lists no versions", () => {
  assert.equal(versionSource({ id: "ai-lab", repo: "exasol/ai-lab", install: "reference" }), null);
});

test("binary items list GitHub release tags; maven lists Maven Central", () => {
  assert.deepEqual(versionSource({ id: "exasol-scheduler", repo: "exasol-labs/exasol-scheduler", install: "binary" }), {
    source: "github",
    reference: "exasol-labs/exasol-scheduler",
  });
  assert.equal(versionSource({ id: "driver-jdbc", install: "maven" })?.source, "maven-exasol-jdbc");
});

test("a registry coordinate resolves to that registry", () => {
  assert.deepEqual(
    versionSource({ id: "driver-ts", repo: "exasol/exasol-driver-ts", install: "package", source: { kind: "registry", registry: "npm", package: "@exasol/exasol-driver-ts" } }),
    { source: "npm", reference: "@exasol/exasol-driver-ts" },
  );
  assert.deepEqual(
    versionSource({ id: "driver-odbc", install: "package", source: { kind: "registry", registry: "exasol-downloads", package: "ODBC" } }),
    { source: "exasol-downloads", reference: "ODBC" },
  );
});

test("an item with no coordinate gets no version list, whatever its id", () => {
  // The websocket spec publishes no releases — a snapshot install with
  // nothing to list. It used to be absent from a table; now it simply has no
  // coordinate, and no id anywhere decides that.
  assert.equal(versionSource({ id: "driver-websocket", repo: "exasol/websocket-api", install: "package" }), null);
  assert.equal(versionSource({ id: "unknown-pkg", install: "package" }), null);
});

test("the bundled Exa Agent engine lists its release repo", () => {
  assert.deepEqual(versionSource({ id: "exa-agent", repo: "Sheetaldharshan200/exa-engine", install: "bundled" }), {
    source: "github",
    reference: "Sheetaldharshan200/exa-engine",
  });
  // Other bundled items (agent skills) still have no version list.
  assert.equal(versionSource({ id: "agent-skills", repo: "exasol-labs/exasol-agent-skills", install: "bundled" }), null);
});

test("Exasol Personal lists its official engine releases", () => {
  assert.deepEqual(versionSource({ id: "exasol-personal", repo: "exasol/exasol-personal", install: "personal-local" }), {
    source: "github",
    reference: "exasol/exasol-personal",
  });
});

test("items without a version-addressable install have no source", () => {
  assert.equal(versionSource({ id: "driver-odbc", install: "reference" }), null);
  assert.equal(versionSource({ id: "agent-skills", repo: "exasol-labs/exasol-agent-skills", install: "bundled" }), null);
  // A pip item whose package mapping is missing must not guess.
  assert.equal(versionSource({ id: "unknown-pip", install: "uv-pip" }), null);
  // A binary item with no repo has nowhere to list versions from.
  assert.equal(versionSource({ id: "no-repo", install: "binary" }), null);
});

test("managed components map to their own version sources", () => {
  assert.deepEqual(componentVersionSource("personal", "exasol/exasol-personal"), {
    source: "github",
    reference: "exasol/exasol-personal",
  });
  assert.deepEqual(componentVersionSource("exa-agent", "Sheetaldharshan200/exa-engine"), {
    source: "github",
    reference: "Sheetaldharshan200/exa-engine",
  });
  // mcp-server installs via pip — PyPI is its truth even though it has a repo.
  assert.equal(componentVersionSource("mcp-server", "exasol/mcp-server")?.source, "pypi");
  assert.equal(componentVersionSource("mcp-server")?.reference, "exasol-mcp-server");
  // Opaque DB-side revision → nothing to list; unknown repo → no guess.
  assert.equal(componentVersionSource("semantic-views", "exasol-labs/exasol-semantic-views"), null);
  assert.equal(componentVersionSource("personal"), null);
});


test("every item that used to be in an id table still resolves, from the catalogue itself", () => {
  // The real guarantee: the coordinates moved onto the items without losing
  // any. Constructing fake items by id would prove nothing now that ids mean
  // nothing to this function.
  const expected: Record<string, { source: string; reference: string }> = {
    pyexasol: { source: "pypi", reference: "pyexasol" },
    "sqlalchemy-exasol": { source: "pypi", reference: "sqlalchemy-exasol" },
    "mcp-server": { source: "pypi", reference: "exasol-mcp-server" },
    "dbt-exasol": { source: "pypi", reference: "dbt-exasol" },
    "notebook-connector": { source: "pypi", reference: "exasol-notebook-connector" },
    "driver-ts": { source: "npm", reference: "@exasol/exasol-driver-ts" },
    "driver-go": { source: "goproxy", reference: "github.com/exasol/exasol-driver-go" },
    "exarrow-rs": { source: "crates", reference: "exarrow-rs" },
    "driver-odbc": { source: "exasol-downloads", reference: "ODBC" },
    "driver-adonet": { source: "exasol-downloads", reference: "ADO.NET" },
    "driver-r": { source: "github", reference: "exasol/r-exasol" },
    "dash-server": { source: "github", reference: "exasol-labs/dash-server" },
  };
  for (const [id, want] of Object.entries(expected)) {
    const item = CATALOG.find((i) => i.id === id);
    assert.ok(item, `${id} is still in the catalogue`);
    assert.deepEqual(versionSource(item!), want, id);
  }
});

test("an item with no coordinate has no version list, rather than a guessed one", () => {
  assert.equal(versionSource({ id: "x", repo: "exasol/x", install: "reference" }), null);
  assert.equal(versionSource({ id: "y", install: "reference" }), null);
});
