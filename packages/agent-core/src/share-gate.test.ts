import assert from "node:assert/strict";
import { test } from "node:test";
import { newShareToken, tokensMatch, parseSharePath, authorize, type ShareEntry } from "./share-gate.ts";

test("newShareToken is 48 hex chars and unique", () => {
  const a = newShareToken();
  const b = newShareToken();
  assert.match(a, /^[0-9a-f]{48}$/);
  assert.notEqual(a, b);
});

test("tokensMatch is true only for equal tokens", () => {
  const t = newShareToken();
  assert.equal(tokensMatch(t, t), true);
  assert.equal(tokensMatch(t, newShareToken()), false);
});

test("tokensMatch handles length mismatch without throwing", () => {
  assert.equal(tokensMatch("short", "muchlongertoken"), false);
  assert.equal(tokensMatch("", "x"), false);
});

test("parseSharePath accepts only /s/<id>?t=<token>", () => {
  assert.deepEqual(parseSharePath("/s/default?t=abc"), { id: "default", token: "abc" });
  assert.deepEqual(parseSharePath("/s/dash-1"), { id: "dash-1", token: "" });
  assert.equal(parseSharePath("/"), null);
  assert.equal(parseSharePath("/s/"), null);
  assert.equal(parseSharePath("/other/default?t=abc"), null);
  assert.equal(parseSharePath("/s/../etc/passwd?t=x"), null); // no traversal
  assert.equal(parseSharePath("/gateway/action"), null); // never the gateway
});

test("authorize allows only the correct token and returns the html", () => {
  const shares = new Map<string, ShareEntry>([["d1", { token: "secret-token", html: "<h1>hi</h1>" }]]);
  const ok = authorize(shares, { id: "d1", token: "secret-token" });
  assert.equal(ok.ok, true);
  assert.equal(ok.html, "<h1>hi</h1>");
});

test("authorize denies a wrong token", () => {
  const shares = new Map<string, ShareEntry>([["d1", { token: "secret-token", html: "x" }]]);
  assert.deepEqual(authorize(shares, { id: "d1", token: "wrong" }), { ok: false });
});

test("authorize denies an unknown share identically to a wrong token (no existence leak)", () => {
  const shares = new Map<string, ShareEntry>([["d1", { token: "secret", html: "x" }]]);
  const unknown = authorize(shares, { id: "nope", token: "secret" });
  const wrong = authorize(shares, { id: "d1", token: "nope" });
  assert.deepEqual(unknown, wrong); // same denial shape
  assert.equal(unknown.ok, false);
});

test("authorize denies a null (unparseable) request", () => {
  assert.deepEqual(authorize(new Map(), null), { ok: false });
});

test("a rotated token invalidates the old one", () => {
  const shares = new Map<string, ShareEntry>([["d1", { token: "old", html: "x" }]]);
  assert.equal(authorize(shares, { id: "d1", token: "old" }).ok, true);
  shares.set("d1", { token: "new", html: "x" }); // rotate
  assert.equal(authorize(shares, { id: "d1", token: "old" }).ok, false);
  assert.equal(authorize(shares, { id: "d1", token: "new" }).ok, true);
});
