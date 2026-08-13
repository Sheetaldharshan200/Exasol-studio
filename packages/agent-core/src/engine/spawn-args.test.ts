import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { baseUrlFor, serveSpawnPlan } from "./spawn-args.ts";

describe("serveSpawnPlan", () => {
  const plan = serveSpawnPlan({ binary: "/opt/exa/opencode", port: 4123, configDir: "/data/exa" });

  test("serves on localhost + the chosen port", () => {
    assert.equal(plan.command, "/opt/exa/opencode");
    assert.deepEqual(plan.args, ["serve", "--hostname", "127.0.0.1", "--port", "4123"]);
  });

  test("pins config/data to Studio's isolated dir (no user config leak)", () => {
    assert.equal(plan.env.OPENCODE_CONFIG_DIR, "/data/exa");
    assert.equal(plan.env.XDG_DATA_HOME, "/data/exa");
    assert.equal(plan.env.XDG_CONFIG_HOME, "/data/exa");
  });
});

test("baseUrlFor is localhost-scoped", () => {
  assert.equal(baseUrlFor(4123), "http://127.0.0.1:4123");
});
