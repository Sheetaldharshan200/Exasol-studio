import assert from "node:assert/strict";
import { test } from "node:test";
import { expectsChoice, needsReleaseAsset, pickAsset, pickAssetFor, variantForRelease, variantsOf } from "./assets.ts";
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

test("a pattern picks exactly the named artifact, ignoring the platform", () => {
  const assets = [
    a("error_code_report.json"),
    a("exasol-kafka-connector-extension-2.0.0.jar"),
    a("exasol-kafka-connector-extension-2.0.0.jar.sha256"),
  ];
  assert.equal(pickAsset(assets, mac, "^exasol-kafka-connector-extension-[\\d.]+\\.jar$")?.name, "exasol-kafka-connector-extension-2.0.0.jar");
  // Same answer on every host — a jar has no platform.
  assert.equal(pickAsset(assets, linux, "^exasol-kafka-connector-extension-[\\d.]+\\.jar$")?.name, "exasol-kafka-connector-extension-2.0.0.jar");
});

test("a pattern that matches nothing or several is not a pick", () => {
  // Zero: upstream renamed the file. Many: an ambiguous release. Either way
  // the card says unavailable rather than installing a guess.
  const assets = [a("spark-connector-jdbc_2.12-2.2.1-spark-3.3.2-assembly.jar"), a("spark-connector-jdbc_2.13-2.2.1-spark-3.4.1-assembly.jar")];
  assert.equal(pickAsset(assets, mac, "^spark-connector-jdbc_[\\d.]+-[\\d.]+-spark-[\\d.]+-assembly\\.jar$"), null);
  assert.equal(pickAsset(assets, mac, "^renamed-.*\\.jar$"), null);
});

test("a pattern that does not compile is not a pick either", () => {
  assert.equal(pickAsset([a("x.jar")], mac, "^(unclosed"), null);
});

test("pickAssetFor reads the pattern off the item and falls back to platform rules", () => {
  const assets = [a("tool-linux-x86_64"), a("tool-macos-arm64"), a("lib-1.0.jar")];
  assert.equal(pickAssetFor({ source: { kind: "gh-asset", assetPattern: "^lib-[\\d.]+\\.jar$" } }, assets, mac)?.name, "lib-1.0.jar");
  assert.equal(pickAssetFor({ source: { kind: "gh-asset", onPath: true } }, assets, mac)?.name, "tool-macos-arm64");
  assert.equal(pickAssetFor({}, assets, mac)?.name, "tool-macos-arm64");
});

test("the same OS in another architecture is unavailable, not a fallback", () => {
  // An aarch64 Mac used to be handed the x86_64 build when no arm64 one
  // existed. A universal or unarched OS build may still stand in.
  assert.equal(pickAsset([a("tool-macos-x86_64.zip")], mac), null);
  assert.equal(pickAsset([a("tool-macos-x86_64.zip"), a("tool-macos.zip")], mac)?.name, "tool-macos.zip");
  assert.equal(pickAsset([a("tool-macos-x86_64.zip"), a("tool-macos-arm64.zip")], mac)?.name, "tool-macos-arm64.zip");
});

test("win- and win_ names are Windows builds, not platform-neutral files", () => {
  assert.equal(pickAsset([a("tool-win-x64.zip")], linux), null);
  assert.equal(pickAsset([a("tool-win-x64.zip"), a("tool-linux-x86_64.tar.gz")], linux)?.name, "tool-linux-x86_64.tar.gz");
});

test("a host plugin's pattern picks its file the same way a jar's does", () => {
  const assets = [a("exasol-vscode-1.8.0.vsix"), a("exasol-vscode-1.8.0.vsix.sha256"), a("error_code_report.json")];
  assert.equal(
    pickAssetFor({ source: { kind: "host-plugin", assetPattern: "^exasol-vscode-[\\d.]+\\.vsix$", host: "vscode" } }, assets, mac)?.name,
    "exasol-vscode-1.8.0.vsix",
  );
});

test("a desktop build is picked by its installer extension (panorama layout)", () => {
  const assets = [
    a("Exasol-Panorama_0.2.0_amd64.AppImage"),
    a("Exasol-Panorama_0.2.0_amd64.AppImage.sig"),
    a("Exasol-Panorama_0.2.0_amd64.deb"),
    a("Exasol-Panorama_0.2.0_universal.dmg"),
    a("Exasol-Panorama_0.2.0_x64_en-US.msi"),
    a("Exasol-Panorama_0.2.0_x64-setup.exe"),
    a("exasol-panorama-pwa-0.2.0.zip"),
    a("exasol-panorama-pwa-0.2.0.zip.sha256"),
  ];
  assert.equal(pickAsset(assets, mac)?.name, "Exasol-Panorama_0.2.0_universal.dmg");
  assert.equal(pickAsset(assets, linux)?.name, "Exasol-Panorama_0.2.0_amd64.AppImage");
  assert.equal(pickAsset(assets, { os: "windows", arch: "x86_64" } as MarketEnv)?.name, "Exasol-Panorama_0.2.0_x64_en-US.msi");
  // An ARM Linux host gets no build, not the amd64 one.
  assert.equal(pickAsset(assets, { os: "linux", arch: "aarch64" } as MarketEnv), null);
});

test("only formats the release publishes need a release file", () => {
  assert.equal(needsReleaseAsset({ install: "deliver", source: { kind: "deliver", format: "rockspec", assetPattern: "^x$" } }), true);
  assert.equal(needsReleaseAsset({ install: "deliver", source: { kind: "deliver", format: "desktop-app" } }), true);
  assert.equal(needsReleaseAsset({ install: "deliver", source: { kind: "deliver", format: "source" } }), false);
  assert.equal(needsReleaseAsset({ install: "deliver", source: { kind: "deliver", format: "dbt-package" } }), false);
  assert.equal(needsReleaseAsset({ install: "binary" }), true);
  assert.equal(needsReleaseAsset({ install: "package", source: { kind: "repo-snapshot" } }), false);
});

const SPARK = [
  "spark-connector-jdbc_2.12-2.2.1-spark-3.3.2-assembly.jar",
  "spark-connector-jdbc_2.12-2.2.1-spark-3.3.2-assembly.jar.sha256",
  "spark-connector-jdbc_2.12-2.2.1-spark-3.3.2.jar",
  "spark-connector-jdbc_2.13-2.2.1-spark-3.5.1-assembly.jar",
  "spark-connector-s3_2.13-2.2.1-spark-3.5.1-assembly.jar",
  "error_code_report.zip",
].map(a);
const spark = { source: { kind: "gh-asset", assetPattern: "^spark-connector-(jdbc|s3)_[\\d.]+-[\\d.]+-spark-[\\d.]+-assembly\\.jar$", choose: true } as const };

test("a choosing item offers the pattern's matches and installs only the pick (spark layout)", () => {
  assert.deepEqual(
    variantsOf(spark, SPARK).map((v) => v.name),
    ["spark-connector-jdbc_2.12-2.2.1-spark-3.3.2-assembly.jar", "spark-connector-jdbc_2.13-2.2.1-spark-3.5.1-assembly.jar", "spark-connector-s3_2.13-2.2.1-spark-3.5.1-assembly.jar"],
  );
  assert.equal(pickAssetFor(spark, SPARK, linux), null, "no pick, nothing installs");
  assert.equal(pickAssetFor(spark, SPARK, linux, "spark-connector-s3_2.13-2.2.1-spark-3.5.1-assembly.jar")?.name, "spark-connector-s3_2.13-2.2.1-spark-3.5.1-assembly.jar");
  assert.equal(pickAssetFor(spark, SPARK, linux, "not-a-variant.jar"), null, "a pick outside the matches is not honoured");
  assert.equal(expectsChoice(spark.source), true);
  assert.equal(expectsChoice({ kind: "gh-asset", assetPattern: "^x$" }), false);
});

test("a single match needs no choice", () => {
  const one = [a("spark-connector-jdbc_2.13-2.2.1-spark-3.5.1-assembly.jar"), a("error_code_report.zip")];
  assert.equal(pickAssetFor(spark, one, linux)?.name, "spark-connector-jdbc_2.13-2.2.1-spark-3.5.1-assembly.jar");
  assert.equal(variantsOf(spark, []).length, 0);
});

test("a variant picked from one release is named for another by its tag", () => {
  assert.equal(
    variantForRelease("spark-connector-jdbc_2.13-2.2.1-spark-3.5.1-assembly.jar", "2.2.1", "2.2.0"),
    "spark-connector-jdbc_2.13-2.2.0-spark-3.5.1-assembly.jar",
  );
  assert.equal(variantForRelease("Tool_1.2.0.jar", "v1.2.0", "v1.3.0"), "Tool_1.3.0.jar", "a leading v on the tag is not in the file name");
  assert.equal(variantForRelease("plain.jar", "1.0", "2.0"), "plain.jar", "a name without the tag is unchanged");
});
