import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { EngineService, resolveEngineEnv } from "./engine-service.ts";

describe("resolveEngineEnv", () => {
  test("resolves when both vars are set", () => {
    assert.deepEqual(resolveEngineEnv({ EXA_ENGINE_BIN: "/opt/opencode", EXA_ENGINE_CONFIG_DIR: "/data/exa" }), {
      binary: "/opt/opencode",
      configDir: "/data/exa",
    });
  });
  test("null when either is missing/blank", () => {
    assert.equal(resolveEngineEnv({}), null);
    assert.equal(resolveEngineEnv({ EXA_ENGINE_BIN: "/x" }), null);
    assert.equal(resolveEngineEnv({ EXA_ENGINE_BIN: "  ", EXA_ENGINE_CONFIG_DIR: "/d" }), null);
  });
});

describe("EngineService (unprovisioned)", () => {
  const svc = new EngineService({}); // no engine env → not installed

  test("reports not-provisioned and a clean not-installed status", async () => {
    assert.equal(svc.provisioned, false);
    const s = await svc.status();
    assert.equal(s.binaryPresent, false);
    assert.match(s.reason ?? "", /not installed/i);
  });

  test("ops degrade instead of throwing when there is no engine", async () => {
    assert.deepEqual(await svc.listSessions(), []);
    assert.equal(await svc.createSession(), null);
    assert.equal(await svc.prompt("s", "hi"), false);
    await svc.abort("s"); // no throw
    await svc.respondPermission("s", "p", true); // no throw
    await svc.subscribe(() => {}); // no throw, returns immediately
  });
});
