import assert from "node:assert/strict";
import { test } from "node:test";
import { displayFingerprint, encryptionChoice, isSaasHost, trustOffer } from "./connect-flow.ts";

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
