import { test } from "node:test";
import assert from "node:assert/strict";
import { pinMatches, rejectUnauthorized } from "./tls-pin.ts";

const PIN = "AB".repeat(32);

test("a pin is compared with Node's fingerprint in any spelling", () => {
  assert.equal(pinMatches(PIN.match(/../g)!.join(":"), PIN), true);
  assert.equal(pinMatches(PIN.toLowerCase(), PIN), true);
  assert.equal(pinMatches("CD".repeat(32), PIN), false);
  assert.equal(pinMatches(undefined, PIN), false, "no certificate: no match");
  assert.equal(pinMatches("", PIN), false);
});

test("only an unpinned verify mode lets Node verify; a pin is checked by fingerprint", () => {
  assert.equal(rejectUnauthorized({ verify: true }), true);
  assert.equal(rejectUnauthorized({ verify: false }), false);
  assert.equal(rejectUnauthorized({}), false);
  assert.equal(rejectUnauthorized({ verify: true, fingerprint: PIN }), false);
});
