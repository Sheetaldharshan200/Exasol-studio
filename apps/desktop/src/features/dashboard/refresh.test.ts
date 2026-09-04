import assert from "node:assert/strict";
import { test } from "node:test";
import { effectiveIntervalMs, MIN_INTERVAL_SEC } from "./refresh.ts";
import type { RefreshConfig } from "./store.ts";

const cfg = (over?: Partial<RefreshConfig>): RefreshConfig => ({ enabled: false, intervalSec: 30, ...over });

test("no config → no refresh", () => {
  assert.equal(effectiveIntervalMs("w1", undefined), null);
});

test("dashboard off, no per-widget opt-in → no refresh", () => {
  assert.equal(effectiveIntervalMs("w1", cfg({ enabled: false })), null);
});

test("dashboard on → widgets refresh at the dashboard interval (ms)", () => {
  assert.equal(effectiveIntervalMs("w1", cfg({ enabled: true, intervalSec: 30 })), 30_000);
});

test("a widget can opt out while the dashboard refreshes", () => {
  const c = cfg({ enabled: true, intervalSec: 30, perWidget: { w1: { enabled: false } } });
  assert.equal(effectiveIntervalMs("w1", c), null);
  assert.equal(effectiveIntervalMs("w2", c), 30_000);
});

test("a widget can override the interval", () => {
  const c = cfg({ enabled: true, intervalSec: 30, perWidget: { w1: { intervalSec: 60 } } });
  assert.equal(effectiveIntervalMs("w1", c), 60_000);
});

test("a widget can opt IN while the dashboard is off", () => {
  const c = cfg({ enabled: false, intervalSec: 30, perWidget: { w1: { enabled: true, intervalSec: 15 } } });
  assert.equal(effectiveIntervalMs("w1", c), 15_000);
  assert.equal(effectiveIntervalMs("w2", c), null);
});

test("the floor is enforced against too-frequent refresh", () => {
  const c = cfg({ enabled: true, intervalSec: 1 });
  assert.equal(effectiveIntervalMs("w1", c), MIN_INTERVAL_SEC * 1000);
});

test("a non-positive interval means no refresh", () => {
  assert.equal(effectiveIntervalMs("w1", cfg({ enabled: true, intervalSec: 0 })), null);
});
