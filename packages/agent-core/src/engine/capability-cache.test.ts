import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  capKey,
  createCapabilityCache,
  getCapabilities,
  invalidate,
  setCapabilities,
} from "./capability-cache.ts";

describe("capability-cache", () => {
  test("miss then hit within TTL", () => {
    const c = createCapabilityCache();
    const k = capKey("ollama", "llama3");
    assert.equal(getCapabilities(c, k, 1000, 10_000), null);
    setCapabilities(c, k, true, 1000);
    assert.deepEqual(getCapabilities(c, k, 5000, 10_000), { toolCall: true, probedAt: 1000 });
  });

  test("expiry forces a re-probe and evicts the stale entry", () => {
    const c = createCapabilityCache();
    const k = capKey("lmstudio", "mixtral");
    setCapabilities(c, k, false, 0);
    assert.equal(getCapabilities(c, k, 20_000, 10_000), null); // 20s > 10s TTL
    assert.equal(c.size, 0);
  });

  test("invalidate: one key, one runtime, or all", () => {
    const c = createCapabilityCache();
    setCapabilities(c, capKey("ollama", "a"), true, 0);
    setCapabilities(c, capKey("ollama", "b"), true, 0);
    setCapabilities(c, capKey("lmstudio", "c"), true, 0);

    invalidate(c, { key: capKey("ollama", "a") });
    assert.equal(c.has(capKey("ollama", "a")), false);
    assert.equal(c.size, 2);

    invalidate(c, { runtimeId: "ollama" }); // removes ollama/b, keeps lmstudio/c
    assert.equal(c.has(capKey("ollama", "b")), false);
    assert.equal(c.has(capKey("lmstudio", "c")), true);

    invalidate(c); // clear all
    assert.equal(c.size, 0);
  });

  test("capKey namespaces by runtime", () => {
    assert.equal(capKey("ollama", "x"), "ollama/x");
    assert.notEqual(capKey("ollama", "x"), capKey("lmstudio", "x"));
  });
});
