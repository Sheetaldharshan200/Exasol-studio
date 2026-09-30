import assert from "node:assert/strict";
import { test } from "node:test";
import { appUrl } from "./apps.ts";

const base = "http://127.0.0.1:5100";

test("an app route resolves on the server's own origin", () => {
  assert.equal(appUrl(base, "/apps/demo"), "http://127.0.0.1:5100/apps/demo");
  assert.equal(appUrl(base, "/preview/sales/3"), "http://127.0.0.1:5100/preview/sales/3");
});

test("a route that would leave the server is not framed", () => {
  assert.equal(appUrl(base, "//attacker.example/apps/demo"), null);
  assert.equal(appUrl(base, "http://attacker.example/apps/demo"), null);
  assert.equal(appUrl(base, "/mcp"), null);
  assert.equal(appUrl(base, "/apps/../mcp"), null, "normalised away from /apps");
  assert.equal(appUrl(base, "/apps/demo?x=<script>"), "http://127.0.0.1:5100/apps/demo", "the query is dropped");
  assert.equal(appUrl("not a url", "/apps/demo"), null);
});
