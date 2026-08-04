import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SUPERVISOR,
  backoffFor,
  isTerminal,
  nextState,
  pickPort,
  type SupervisorConfig,
} from "./supervisor-policy.ts";

const cfg: SupervisorConfig = { portCandidates: [10, 11, 12], maxRestarts: 3, backoffMs: [100, 200, 400] };

describe("pickPort", () => {
  test("first free candidate", () => {
    assert.equal(pickPort(cfg, []), 10);
    assert.equal(pickPort(cfg, [10]), 11);
    assert.equal(pickPort(cfg, [10, 11]), 12);
  });
  test("null when all taken", () => {
    assert.equal(pickPort(cfg, [10, 11, 12]), null);
  });
});

describe("backoffFor", () => {
  test("indexes the schedule and clamps to the tail", () => {
    assert.equal(backoffFor(cfg, 0), 100);
    assert.equal(backoffFor(cfg, 2), 400);
    assert.equal(backoffFor(cfg, 9), 400); // beyond schedule → last value
    assert.equal(backoffFor(cfg, -1), 100); // negative → first
  });
  test("empty schedule → 0", () => {
    assert.equal(backoffFor({ ...cfg, backoffMs: [] }, 0), 0);
  });
});

describe("nextState", () => {
  test("start → starting, ready → running, stop → stopped", () => {
    assert.equal(nextState(cfg, "stopped", "start", 0).state, "starting");
    assert.equal(nextState(cfg, "starting", "ready", 0).state, "running");
    assert.equal(nextState(cfg, "running", "stop", 0).state, "stopped");
  });

  test("crash within budget → backoff with the attempt's delay and reason", () => {
    const t = nextState(cfg, "running", "crash", 0);
    assert.equal(t.state, "backoff");
    assert.equal(t.waitMs, 100);
    assert.match(t.reason ?? "", /attempt 1 of 3/);
    assert.equal(nextState(cfg, "running", "crash", 2).waitMs, 400);
  });

  test("crash at the restart budget → failed, terminal", () => {
    const t = nextState(cfg, "backoff", "crash", 3);
    assert.equal(t.state, "failed");
    assert.match(t.reason ?? "", /did not recover after 3/);
    assert.ok(isTerminal(t.state));
  });
});

describe("isTerminal", () => {
  test("failed and stopped are terminal; running/starting/backoff are not", () => {
    assert.ok(isTerminal("failed"));
    assert.ok(isTerminal("stopped"));
    assert.ok(!isTerminal("running"));
    assert.ok(!isTerminal("starting"));
    assert.ok(!isTerminal("backoff"));
  });
});

test("defaults are sane: 5 localhost ports, 5 restarts, ascending backoff", () => {
  assert.equal(DEFAULT_SUPERVISOR.portCandidates.length, 5);
  assert.equal(DEFAULT_SUPERVISOR.maxRestarts, 5);
  for (let i = 1; i < DEFAULT_SUPERVISOR.backoffMs.length; i++) {
    assert.ok(DEFAULT_SUPERVISOR.backoffMs[i] >= DEFAULT_SUPERVISOR.backoffMs[i - 1]);
  }
});
