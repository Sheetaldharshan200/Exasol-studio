import assert from "node:assert/strict";
import { test } from "node:test";
import { connectionUrl } from "./connection-url.ts";

const base = { host: "db.example.com", port: 8563, username: "sys" };

test("the native URL carries what connect really sends, password masked", () => {
  assert.deepEqual(connectionUrl(base), { url: "exa://sys:••••@db.example.com:8563?compression=disabled", driver: "Native websocket" });
  assert.equal(
    connectionUrl({ ...base, sslMode: "required", compression: true, schema: "RETAIL" }).url,
    "exa://sys:••••@db.example.com:8563?ssl-mode=required&compression=required&schema=RETAIL",
  );
});

test("names are encoded, blanks dropped, and the fingerprint pins the host", () => {
  assert.equal(connectionUrl({ ...base, username: "a b@c", schema: "  " }).url, "exa://a%20b%40c:••••@db.example.com:8563?compression=disabled");
  assert.equal(connectionUrl({ ...base, username: "" }).url, "exa://db.example.com:8563?compression=disabled");
  assert.equal(connectionUrl({ ...base, fingerprint: "AB12CD" }).url, "exa://sys:••••@db.example.com/AB12CD:8563?compression=disabled");
});

test("another driver shows its target and its name", () => {
  assert.deepEqual(connectionUrl({ ...base, driverId: "jdbc", schema: "S" }), { url: "db.example.com:8563 · schema S", driver: "Exasol JDBC" });
  assert.equal(connectionUrl({ ...base, driverId: "unknown-driver" }).driver, "Native websocket");
});

test("the password never appears", () => {
  const u = connectionUrl({ ...base, password: "hunter2" } as never).url;
  assert.ok(!u.includes("hunter2"));
});
