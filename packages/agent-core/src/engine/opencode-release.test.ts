import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { OPENCODE_REPO, assetFor, binaryName, downloadUrl, versionFromTag } from "./opencode-release.ts";

describe("assetFor", () => {
  test("maps every supported platform to a real release asset", () => {
    assert.equal(assetFor({ os: "darwin", arch: "arm64" }), "opencode-darwin-arm64.zip");
    assert.equal(assetFor({ os: "darwin", arch: "x64" }), "opencode-darwin-x64.zip");
    assert.equal(assetFor({ os: "linux", arch: "arm64" }), "opencode-linux-arm64.tar.gz");
    assert.equal(assetFor({ os: "linux", arch: "x64" }), "opencode-linux-x64.tar.gz");
    assert.equal(assetFor({ os: "win32", arch: "x64" }), "opencode-windows-x64.zip");
    assert.equal(assetFor({ os: "windows", arch: "arm64" }), "opencode-windows-arm64.zip");
  });
  test("accepts x86_64 as an alias for x64", () => {
    assert.equal(assetFor({ os: "linux", arch: "x86_64" }), "opencode-linux-x64.tar.gz");
  });
  test("unsupported os/arch → null", () => {
    assert.equal(assetFor({ os: "freebsd", arch: "x64" }), null);
    assert.equal(assetFor({ os: "linux", arch: "riscv" }), null);
  });
});

test("binaryName is .exe only on Windows", () => {
  assert.equal(binaryName("darwin"), "opencode");
  assert.equal(binaryName("linux"), "opencode");
  assert.equal(binaryName("win32"), "opencode.exe");
});

test("downloadUrl points at the opencode releases path", () => {
  assert.equal(
    downloadUrl("v1.18.12", "opencode-darwin-arm64.zip"),
    `https://github.com/${OPENCODE_REPO}/releases/download/v1.18.12/opencode-darwin-arm64.zip`,
  );
});

test("versionFromTag strips a leading v", () => {
  assert.equal(versionFromTag("v1.18.12"), "1.18.12");
  assert.equal(versionFromTag("1.18.12"), "1.18.12");
  assert.equal(versionFromTag("  v2.0.0  "), "2.0.0");
});
