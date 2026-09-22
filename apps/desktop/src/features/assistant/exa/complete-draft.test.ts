import test from "node:test";
import assert from "node:assert/strict";
import { completeDraft } from "./complete-draft.ts";

const sources = { catalogNames: ["RETAIL", "RETAIL.CUSTOMERS", "RETAIL.ORDERS", "SYS.EXA_ALL_TABLES"], recentPrompts: ["show revenue by city for 2025", "show me the top customers"] };

test("slash: completes the command word and stops once it is complete", () => {
  assert.deepEqual(completeDraft("/ex", sources), { text: "/explain ", ghost: "plain ", kind: "command" });
  assert.equal(completeDraft("/explain", sources), null);
  assert.equal(completeDraft("/explain the join", sources), null, "arguments are free text");
  assert.equal(completeDraft("/zzz", sources), null);
});

test("@mention: prefix on the full name or the table part, case-insensitive", () => {
  assert.deepEqual(completeDraft("join @cust", sources), { text: "join @RETAIL.CUSTOMERS", ghost: "RETAIL.CUSTOMERS".slice(4), kind: "mention" });
  assert.deepEqual(completeDraft("@ret", sources)?.text, "@RETAIL");
  assert.equal(completeDraft("@", sources), null, "nothing typed yet");
  assert.equal(completeDraft("@RETAIL.ORDERS", sources), null, "already complete");
  assert.equal(completeDraft("mail@example", sources)?.kind ?? null, null, "an e-mail is not a mention");
});

test("recent prompts: three characters or more, prefix match, newest first", () => {
  assert.deepEqual(completeDraft("show rev", sources), { text: "show revenue by city for 2025", ghost: "enue by city for 2025", kind: "recent" });
  assert.equal(completeDraft("show me the top customers", sources), null, "identical to a past prompt → nothing to add");
  assert.equal(completeDraft("sh", sources), null);
  assert.equal(completeDraft("", sources), null);
  assert.equal(completeDraft("delete everything", sources), null);
});
