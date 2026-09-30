import assert from "node:assert/strict";
import { test } from "node:test";
import { answer, frameOrigin, frameUrl, parseRequest } from "./bridge.ts";

const s = {
  proxyUrl: () => "ws://127.0.0.1:7000/database?token=t",
  deployments: async () => ({ installed: true, deployments: [] }),
  credentials: async (name: string) => ({ url: "wss://h:1", username: "u", password: `pw-${name}` }),
};

test("only the shim's requests are requests", () => {
  assert.deepEqual(parseRequest({ panoramaShell: 1, id: 3, cmd: "database_proxy", args: null }), { id: 3, cmd: "database_proxy", args: null });
  assert.equal(parseRequest({ id: 3, cmd: "x" }), null);
  assert.equal(parseRequest({ panoramaShell: 1, id: "3", cmd: "x" }), null);
  assert.equal(parseRequest("hello"), null);
});

test("the allow-listed commands are answered from Studio", async () => {
  assert.equal(await answer({ id: 1, cmd: "database_proxy", args: null }, s), "ws://127.0.0.1:7000/database?token=t");
  assert.deepEqual(await answer({ id: 1, cmd: "exasol_deployments", args: { detail: "names" } }, s), { installed: true, deployments: [] });
  assert.deepEqual(await answer({ id: 1, cmd: "exasol_deployment_credentials", args: { name: "Prod" } }, s), { url: "wss://h:1", username: "u", password: "pw-Prod" });
  assert.equal(await answer({ id: 1, cmd: "update_status", args: null }, s), null);
  assert.deepEqual(await answer({ id: 1, cmd: "agent_attach", args: {} }, s), {});
});

test("everything else is refused, and a missing proxy or name is a plain error", async () => {
  await assert.rejects(answer({ id: 1, cmd: "plugin:fs|write_file", args: {} }, s), /not available inside Studio/);
  await assert.rejects(answer({ id: 1, cmd: "exasol_deployment_credentials", args: {} }, s), /Which connection/);
  await assert.rejects(answer({ id: 1, cmd: "database_proxy", args: null }, { ...s, proxyUrl: () => null }), /not running/);
});

test("the frame URL follows the platform's spelling of a custom scheme", () => {
  assert.equal(frameUrl("Mozilla/5.0 (Macintosh)"), "panorama://localhost/");
  assert.equal(frameUrl("Mozilla/5.0 (Windows NT 10.0)"), "http://panorama.localhost/");
  assert.equal(frameOrigin("Mozilla/5.0 (Macintosh)"), "panorama://localhost");
});
