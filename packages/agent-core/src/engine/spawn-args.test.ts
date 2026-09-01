import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { baseUrlFor, serveSpawnPlan } from "./spawn-args.ts";

describe("serveSpawnPlan", () => {
  const plan = serveSpawnPlan({ binary: "/opt/exa/exa", port: 4123, configDir: "/data/exa", workspaceDir: "/home/u/ExasolStudio" });

  test("serves on localhost + the chosen port", () => {
    assert.equal(plan.command, "/opt/exa/exa");
    assert.deepEqual(plan.args, ["serve", "--hostname", "127.0.0.1", "--port", "4123"]);
  });

  test("runs IN the user workspace — sessions and MCP roots key off cwd", () => {
    assert.equal(plan.cwd, "/home/u/ExasolStudio");
  });

  test("pins config/data to Studio's isolated dir (no user config leak)", () => {
    assert.equal(plan.env.EXA_CONFIG_DIR, "/data/exa");
    assert.equal(plan.env.XDG_DATA_HOME, "/data/exa");
    assert.equal(plan.env.XDG_CONFIG_HOME, "/data/exa");
  });
});

test("baseUrlFor is localhost-scoped", () => {
  assert.equal(baseUrlFor(4123), "http://127.0.0.1:4123");
});
