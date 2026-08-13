import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EngineService, resolveEngineEnv } from "./engine-service.ts";

const bin = () => (process.platform === "win32" ? "opencode.exe" : "opencode");

describe("resolveEngineEnv", () => {
  test("resolves the installed component copy from the data root", () => {
    const root = mkdtempSync(join(tmpdir(), "exa-root-"));
    const dir = join(root, "personal-local", "components", "exa-agent", "bin");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, bin()), "#!/bin/sh\n");
    const r = resolveEngineEnv({ EXA_ENGINE_DATA_ROOT: root });
    assert.ok(r);
    assert.equal(r.binary, join(dir, bin()));
    assert.equal(r.configDir, join(root, "personal-local", "components", "exa-agent", "config"));
  });

  test("falls back to the bundled baseline when no component copy exists", () => {
    const base = mkdtempSync(join(tmpdir(), "exa-base-"));
    const b = join(base, bin());
    writeFileSync(b, "#!/bin/sh\n");
    const r = resolveEngineEnv({ EXA_ENGINE_BIN: b, EXA_ENGINE_CONFIG_DIR: base });
    assert.deepEqual(r, { binary: b, configDir: base });
  });

  test("null when nothing is present", () => {
    assert.equal(resolveEngineEnv({}), null);
    assert.equal(resolveEngineEnv({ EXA_ENGINE_DATA_ROOT: "/nope/does/not/exist" }), null);
    // env points at a non-existent baseline → not usable
    assert.equal(resolveEngineEnv({ EXA_ENGINE_BIN: "/nope/opencode", EXA_ENGINE_CONFIG_DIR: "/tmp" }), null);
  });
});

describe("EngineService (unprovisioned)", () => {
  const svc = new EngineService({}); // no engine → not installed

  test("reports not-provisioned and a clean not-installed status", async () => {
    assert.equal(svc.provisioned, false);
    const s = await svc.status();
    assert.equal(s.binaryPresent, false);
    assert.match(s.reason ?? "", /not installed/i);
  });

  test("ops degrade instead of throwing when there is no engine", async () => {
    assert.deepEqual(await svc.listSessions(), []);
    assert.equal(await svc.deleteSession("s"), false);
    assert.equal(await svc.compact("s"), false);
  });
});
