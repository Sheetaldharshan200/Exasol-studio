import assert from "node:assert/strict";
import { test } from "node:test";
import { pickAsset } from "./assets.ts";
import type { MarketEnv, ReleaseAsset } from "@/lib/ipc";

const a = (name: string): ReleaseAsset => ({ name, url: `https://x/${name}`, size: 1 });
const mac = { os: "macos", arch: "aarch64" } as MarketEnv;
const linux = { os: "linux", arch: "x86_64" } as MarketEnv;

test("matches os+arch and skips checksum files (scheduler layout)", () => {
  const assets = [
    a("exasol_scheduler-v0.2-linux-x86_64.tar.gz"),
    a("exasol_scheduler-v0.2-linux-x86_64.tar.gz.sha256"),
    a("exasol_scheduler-v0.2-macos-arm64.tar.gz"),
    a("exasol_scheduler-v0.2-macos-arm64.tar.gz.sha256"),
  ];
  assert.equal(pickAsset(assets, mac)?.name, "exasol_scheduler-v0.2-macos-arm64.tar.gz");
  assert.equal(pickAsset(assets, linux)?.name, "exasol_scheduler-v0.2-linux-x86_64.tar.gz");
});

test("metadata-first releases still pick the artifact (tableau layout)", () => {
  const assets = [
    a("error_code_report.json"),
    a("error_code_report.json.sha256"),
    a("exasol_jdbc.taco"),
    a("exasol_jdbc.taco.sha256"),
    a("exasol_odbc.taco"),
  ];
  assert.equal(pickAsset(assets, mac)?.name, "exasol_jdbc.taco");
});

test("platform-specific release with no build for this host returns null (postgres-interface layout)", () => {
  const assets = [a("exa-postgres-interface-v0.2.12-linux-x86_64.tar.gz"), a("SHA256SUMS"), a("install.sh")];
  assert.equal(pickAsset(assets, mac), null);
  assert.equal(pickAsset(assets, linux)?.name, "exa-postgres-interface-v0.2.12-linux-x86_64.tar.gz");
});

test("platform-neutral artifact falls back to first (grafana plugin zip)", () => {
  const assets = [a("exasol-exasol-datasource-1.0.1.zip"), a("exasol-exasol-datasource-1.0.1.zip.sha1")];
  assert.equal(pickAsset(assets, mac)?.name, "exasol-exasol-datasource-1.0.1.zip");
});

test("empty or metadata-only releases return null", () => {
  assert.equal(pickAsset([], mac), null);
  assert.equal(pickAsset([a("SHA256SUMS"), a("report.json")], mac), null);
});
