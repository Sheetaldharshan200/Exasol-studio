import assert from "node:assert/strict";
import { test } from "node:test";
import { checkHost, checkPort, parseDsn } from "./dsn.ts";

const FP = "AB".repeat(32);

test("a single host is one host", () => {
  assert.deepEqual(checkHost(" db.example.com "), { ok: true, hosts: ["db.example.com"] });
  assert.deepEqual(checkHost(`db.example.com/${FP}`), { ok: true, hosts: ["db.example.com"] }, "the pin is not part of the host");
  assert.deepEqual(checkHost("10.0.0.5"), { ok: true, hosts: ["10.0.0.5"] });
});

test("a host range expands the way the driver reads it", () => {
  assert.deepEqual(checkHost("db1..3.example.com"), { ok: true, hosts: ["db1.example.com", "db2.example.com", "db3.example.com"] });
  assert.deepEqual(checkHost("10.0.0.11..13"), { ok: true, hosts: ["10.0.0.11", "10.0.0.12", "10.0.0.13"] });
  assert.deepEqual(checkHost("n08..10"), { ok: true, hosts: ["n08", "n09", "n10"] }, "zero padding kept");
});

test("ranges and lists that cannot work are refused with the reason", () => {
  assert.match((checkHost("db4..1") as { error: string }).error, /counts up/);
  assert.match((checkHost("db1..200") as { error: string }).error, /typo/);
  assert.match((checkHost("db1,db2") as { error: string }).error, /range/);
  assert.equal(checkHost("").ok, false);
  assert.equal(checkHost("db one").ok, false);
  assert.deepEqual(checkHost("a..b.example.com"), { ok: true, hosts: ["a..b.example.com"] }, "not a range");
});

test("the port is 1–65535", () => {
  assert.deepEqual(checkPort("8563"), { ok: true, port: 8563 });
  assert.deepEqual(checkPort(1), { ok: true, port: 1 });
  assert.equal(checkPort("0").ok, false);
  assert.equal(checkPort("65536").ok, false);
  assert.equal(checkPort("85a3").ok, false);
  assert.equal(checkPort("").ok, false);
  assert.equal(checkPort("-1").ok, false);
});

test("a JDBC URL fills host, port, schema, user and the pin", () => {
  assert.deepEqual(parseDsn(`jdbc:exa:db1..3.example.com/${FP}:8563;schema=RETAIL;user=analyst`), {
    host: "db1..3.example.com",
    fingerprint: FP,
    port: "8563",
    schema: "RETAIL",
    username: "analyst",
  });
  assert.deepEqual(parseDsn("jdbc:exa:db:8563;validateservercertificate=0"), { host: "db", port: "8563", sslMode: "required" });
  assert.deepEqual(parseDsn("JDBC:EXA:db:9000;password=secret"), { host: "db", port: "9000" }, "passwords are never read");
});

test("an exa:// URL and a pyexasol DSN", () => {
  assert.deepEqual(parseDsn("exa://sys@db.example.com:8563/HR?ssl-mode=verify_ca"), {
    host: "db.example.com",
    port: "8563",
    username: "sys",
    schema: "HR",
    sslMode: "verify_ca",
  });
  assert.deepEqual(parseDsn(`db.example.com/${FP.toLowerCase()}:8563`), { host: "db.example.com", fingerprint: FP, port: "8563" });
  assert.deepEqual(parseDsn("localhost:8563"), { host: "localhost", port: "8563" });
  const colons = FP.match(/../g)!.join(":");
  assert.deepEqual(parseDsn(`db/${colons}:8563`), { host: "db", fingerprint: FP, port: "8563" }, "colon-separated pin");
});

test("anything else is not an address", () => {
  assert.equal(parseDsn(""), null);
  assert.equal(parseDsn("select * from t"), null);
  assert.equal(parseDsn("just-a-host"), null, "too little to call it a DSN");
});
