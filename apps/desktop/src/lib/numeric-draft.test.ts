import { test } from "node:test";
import assert from "node:assert/strict";
import { clampToRange, draftCommitValue, normalizeNumericDraft } from "./numeric-draft.ts";

test("normalizeNumericDraft strips leading zeros after a clear-and-retype", () => {
  assert.equal(normalizeNumericDraft("05"), "5");
  assert.equal(normalizeNumericDraft("0500"), "500");
  assert.equal(normalizeNumericDraft("0"), "0"); // a lone zero stays
  assert.equal(normalizeNumericDraft(""), "");
});

test("normalizeNumericDraft drops non-digits", () => {
  assert.equal(normalizeNumericDraft("12a3"), "123");
  assert.equal(normalizeNumericDraft("-15"), "15");
  assert.equal(normalizeNumericDraft("1.5"), "15"); // no decimals unless allowed
});

test("normalizeNumericDraft keeps decimals when allowed", () => {
  assert.equal(normalizeNumericDraft("0.5", true), "0.5"); // NOT stripped to ".5"
  assert.equal(normalizeNumericDraft("00.5", true), "0.5");
  assert.equal(normalizeNumericDraft("1.2.3", true), "1.23"); // one dot only
  assert.equal(normalizeNumericDraft("05.0", true), "5.0");
});

test("draftCommitValue defers empty, bare-dot, and out-of-range drafts", () => {
  assert.equal(draftCommitValue(""), null);
  assert.equal(draftCommitValue("."), null);
  assert.equal(draftCommitValue("5", 10, 100), null); // typing toward "50"
  assert.equal(draftCommitValue("50", 10, 100), 50);
  assert.equal(draftCommitValue("500", 10, 100), null); // blur clamps instead
  assert.equal(draftCommitValue("42"), 42);
});

test("clampToRange handles missing bounds", () => {
  assert.equal(clampToRange(5, 10, 100), 10);
  assert.equal(clampToRange(500, 10, 100), 100);
  assert.equal(clampToRange(50), 50);
});
