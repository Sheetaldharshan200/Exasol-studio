import assert from "node:assert/strict";
import { test } from "node:test";
import { humanizeEngineError } from "./humanize-error.ts";

test("dead refresh tokens become a reconnect instruction", () => {
  assert.match(humanizeEngineError("Token refresh failed: 401")!.title, /sign-in expired/);
  assert.match(humanizeEngineError("Token refresh failed: 400")!.action, /Reconnect in Providers/);
  assert.match(humanizeEngineError("Anthropic sign-in expired — the saved session was rotated")!.title, /sign-in expired/);
});

test("context overflow, rate limits and overload each get their own guidance", () => {
  assert.match(humanizeEngineError("Session too large to compact - context exceeds model limit")!.title, /context window/);
  assert.match(humanizeEngineError("429 Too Many Requests")!.title, /rate-limiting/);
  assert.match(humanizeEngineError("upstream overloaded_error 529")!.title, /overloaded/);
});

test("bad keys and network failures are actionable", () => {
  assert.match(humanizeEngineError("invalid_api_key: incorrect API key provided")!.action, /Re-enter the key/);
  assert.match(humanizeEngineError("fetch failed: ECONNREFUSED 127.0.0.1:11434")!.title, /Can't reach/);
});

test("unknown and empty errors pass through untouched", () => {
  assert.equal(humanizeEngineError("some entirely novel failure"), null);
  assert.equal(humanizeEngineError(""), null);
  assert.equal(humanizeEngineError(undefined), null);
});
