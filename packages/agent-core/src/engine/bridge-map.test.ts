import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mapEngineEvent } from "./bridge-map.ts";

describe("mapEngineEvent", () => {
  test("streaming message deltas across field-name variants", () => {
    assert.deepEqual(mapEngineEvent({ type: "message.delta", text: "hi", sessionId: "s1" }, "s0"), {
      type: "message.delta",
      sessionId: "s1",
      text: "hi",
    });
    // alias field names + session fallback
    assert.deepEqual(mapEngineEvent({ type: "message.part", delta: "yo" }, "s0"), {
      type: "message.delta",
      sessionId: "s0",
      text: "yo",
    });
    // empty delta is noise
    assert.equal(mapEngineEvent({ type: "message.delta", text: "" }, "s0"), null);
  });

  test("message completion", () => {
    assert.deepEqual(mapEngineEvent({ type: "message.done", session_id: "s2" }, "s0"), { type: "message.done", sessionId: "s2" });
    assert.equal(mapEngineEvent({ type: "message.complete" }, "s0")?.type, "message.done");
  });

  test("tool start carries name/args/callId", () => {
    assert.deepEqual(mapEngineEvent({ type: "tool.call", id: "c1", name: "query", input: { sql: "SELECT 1" } }, "s0"), {
      type: "tool.start",
      sessionId: "s0",
      callId: "c1",
      name: "query",
      args: { sql: "SELECT 1" },
    });
    // missing name defaults, missing args → {}
    assert.deepEqual(mapEngineEvent({ type: "tool.invoke", call_id: "c2" }, "s0"), {
      type: "tool.start",
      sessionId: "s0",
      callId: "c2",
      name: "tool",
      args: {},
    });
  });

  test("tool result ok vs error", () => {
    assert.deepEqual(mapEngineEvent({ type: "tool.result", id: "c1", result: { rows: 3 } }, "s0"), {
      type: "tool.result",
      sessionId: "s0",
      callId: "c1",
      ok: true,
      result: { rows: 3 },
    });
    const err = mapEngineEvent({ type: "tool.result", id: "c1", error: "boom" }, "s0");
    assert.equal(err?.type === "tool.result" && err.ok, false);
    assert.equal(err?.type === "tool.result" && err.result, "boom");
    // ok:false flag also marks failure
    const f = mapEngineEvent({ type: "tool.output", id: "c9", ok: false, output: null }, "s0");
    assert.equal(f?.type === "tool.result" && f.ok, false);
  });

  test("permission requests map to the review gate", () => {
    assert.deepEqual(mapEngineEvent({ type: "permission.request", id: "p1", title: "Run DROP?", command: "DROP TABLE t" }, "s0"), {
      type: "permission.request",
      sessionId: "s0",
      requestId: "p1",
      title: "Run DROP?",
      detail: "DROP TABLE t",
    });
    assert.equal(mapEngineEvent({ type: "approval.needed", id: "p2" }, "s0")?.type, "permission.request");
  });

  test("errors and idle", () => {
    assert.deepEqual(mapEngineEvent({ type: "error", message: "nope", sessionId: "s3" }, "s0"), { type: "error", sessionId: "s3", message: "nope" });
    assert.equal(mapEngineEvent({ type: "session.idle" }, "s0")?.type, "session.idle");
    assert.equal(mapEngineEvent({ type: "run.finish" }, "s0")?.type, "session.idle");
  });

  test("unrecognized/heartbeat events are ignored", () => {
    assert.equal(mapEngineEvent({ type: "ping" }, "s0"), null);
    assert.equal(mapEngineEvent({}, "s0"), null);
    assert.equal(mapEngineEvent({ type: "server.heartbeat" }, "s0"), null);
  });
});
