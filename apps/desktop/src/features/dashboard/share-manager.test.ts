import assert from "node:assert/strict";
import { test } from "node:test";
import { shareUrl } from "./share-url.ts";

test("shareUrl composes base + path + token", () => {
  assert.equal(
    shareUrl({ base: "https://x.trycloudflare.com", id: "default", token: "abc123" }),
    "https://x.trycloudflare.com/s/default?t=abc123",
  );
});

test("shareUrl url-encodes id and token", () => {
  assert.equal(
    shareUrl({ base: "http://127.0.0.1:5000", id: "my dash", token: "a/b+c" }),
    "http://127.0.0.1:5000/s/my%20dash?t=a%2Fb%2Bc",
  );
});
