import assert from "node:assert/strict";
import { test } from "node:test";
import { displayFingerprint, encryptionChoice, hookNotice, importNotice, isSaasHost, trustOffer } from "./connect-flow.ts";

const FP = "AB".repeat(32);
const OLD = "CD".repeat(32);

test("an untrusted or changed certificate becomes a trust offer", () => {
  assert.deepEqual(trustOffer({ kind: "untrusted-certificate", message: "…", fingerprint: FP }), { fingerprint: FP });
  assert.deepEqual(trustOffer({ kind: "certificate-changed", message: "…", fingerprint: FP, expected: OLD }), { fingerprint: FP, changedFrom: OLD });
});

test("anything else is a plain failure", () => {
  assert.equal(trustOffer({ kind: "database", message: "login failed" }), null);
  assert.equal(trustOffer({ kind: "untrusted-certificate", fingerprint: "nope" }), null, "malformed");
  assert.equal(trustOffer({ kind: "certificate-changed", fingerprint: FP }), null, "no previous pin");
  assert.equal(trustOffer("boom"), null);
  assert.equal(trustOffer(null), null);
});

test("fingerprints read in groups of four", () => {
  assert.equal(displayFingerprint("ABCDEFGH12"), "ABCD EFGH 12");
  assert.equal(displayFingerprint(FP).split(" ").length, 16);
});

test("stored modes map onto the offered, always-encrypted choices", () => {
  assert.equal(encryptionChoice("verify_identity"), "verify_identity");
  assert.equal(encryptionChoice("verify_ca"), "verify_ca");
  assert.equal(encryptionChoice("disabled"), "required");
  assert.equal(encryptionChoice("preferred"), "required");
  assert.equal(encryptionChoice(undefined), "required");
});

test("SaaS hosts are recognised by their domain", () => {
  assert.ok(isSaasHost("abc123.clusters.exasol.com"));
  assert.ok(isSaasHost("abc.clusters.exasol.com:8563"));
  assert.ok(!isSaasHost("exasol.example.com"));
  assert.ok(!isSaasHost("10.0.0.1"));
});

test("failed hooks become one notice; none, none", () => {
  assert.equal(hookNotice(undefined, "connect"), null);
  assert.equal(hookNotice([], "disconnect"), null);
  const n = hookNotice(["ALTER SESSION … — invalid"], "connect")!;
  assert.equal(n.title, "1 connection hook statement failed");
  assert.match(n.body, /^Connected, but/);
  assert.equal(hookNotice(["a", "b"], "disconnect")!.title, "2 connection hook statements failed");
});

test("an import says what was added, skipped and refused", () => {
  const n = importNotice({ added: ["A", "B"], skipped: ["C"], failed: [] });
  assert.equal(n.kind, "success");
  assert.equal(n.title, "2 connections imported");
  assert.match(n.body, /Added: A, B\. Already there: C\..*asks on its first connect/);
  assert.equal(importNotice({ added: [], skipped: ["C"], failed: [] }).title, "Nothing new to import");
  assert.equal(importNotice({ added: ["A"], skipped: [], failed: ["D: bad port"] }).kind, "warning");
  assert.equal(importNotice({ added: [], skipped: [], failed: [] }).body, "The file has no connections.");
});
