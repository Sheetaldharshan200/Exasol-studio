import assert from "node:assert/strict";
import { test } from "node:test";
import { componentVersionSource, versionSource } from "./versions.ts";

test("pip items resolve to their real PyPI package", () => {
  assert.deepEqual(versionSource({ id: "mcp-server", repo: "exasol/mcp-server", install: "uv-tool" }), {
    source: "pypi",
    reference: "exasol-mcp-server",
  });
  assert.deepEqual(versionSource({ id: "notebook-connector", repo: "exasol/notebook-connector", install: "uv-pip" }), {
    source: "pypi",
    reference: "exasol-notebook-connector",
  });
});

test("binary items list GitHub release tags; maven lists Maven Central", () => {
  assert.deepEqual(versionSource({ id: "exasol-scheduler", repo: "exasol-labs/exasol-scheduler", install: "binary" }), {
    source: "github",
    reference: "exasol-labs/exasol-scheduler",
  });
  assert.equal(versionSource({ id: "driver-jdbc", install: "maven" })?.source, "maven-exasol-jdbc");
});

test("items without a version-addressable install have no source", () => {
  assert.equal(versionSource({ id: "driver-odbc", install: "reference" }), null);
  assert.equal(versionSource({ id: "exasol-community", repo: "exasol/docker-db", install: "community-docker" }), null);
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
