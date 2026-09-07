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

test("ai-lab lists Docker Hub tags — it is an image, not a pip package", () => {
  assert.deepEqual(versionSource({ id: "ai-lab", repo: "exasol/ai-lab", install: "uv-pip" }), {
    source: "dockerhub",
    reference: "exasol/ai-lab",
  });
});

test("binary items list GitHub release tags; maven lists Maven Central", () => {
  assert.deepEqual(versionSource({ id: "exasol-scheduler", repo: "exasol-labs/exasol-scheduler", install: "binary" }), {
    source: "github",
    reference: "exasol-labs/exasol-scheduler",
  });
  assert.equal(versionSource({ id: "driver-jdbc", install: "maven" })?.source, "maven-exasol-jdbc");
});

test("package drivers list their NATIVE registry", () => {
  assert.deepEqual(versionSource({ id: "driver-ts", repo: "exasol/exasol-driver-ts", install: "package" }), {
    source: "npm",
    reference: "@exasol/exasol-driver-ts",
  });
  assert.deepEqual(versionSource({ id: "driver-go", repo: "exasol/exasol-driver-go", install: "package" }), {
    source: "goproxy",
    reference: "github.com/exasol/exasol-driver-go",
  });
  assert.equal(versionSource({ id: "exarrow-rs", repo: "exasol-labs/exarrow-rs", install: "package" })?.source, "crates");
  assert.equal(versionSource({ id: "driver-r", repo: "exasol/r-exasol", install: "package" })?.source, "github");
  // ODBC and ADO.NET list the official Exasol downloads portal.
  assert.deepEqual(versionSource({ id: "driver-odbc", install: "package" }), {
    source: "exasol-downloads",
    reference: "ODBC",
  });
  assert.equal(versionSource({ id: "driver-adonet", install: "package" })?.reference, "ADO.NET");
  // The websocket spec has no releases — snapshot install, no version list.
  assert.equal(versionSource({ id: "driver-websocket", repo: "exasol/websocket-api", install: "package" }), null);
  // A package id with no registry mapping must not guess.
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
