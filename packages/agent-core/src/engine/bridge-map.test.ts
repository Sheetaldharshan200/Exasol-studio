import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mapEngineEvent } from "./bridge-map.ts";

describe("mapEngineEvent (v1.18 verified shapes)", () => {
  test("message.updated maps to message.upsert with role", () => {
    const e = mapEngineEvent(
      { type: "message.updated", properties: { info: { id: "msg_1", sessionID: "ses_1", role: "assistant" } } },
      "",
    );
    assert.deepEqual(e, { type: "message.upsert", sessionId: "ses_1", messageId: "msg_1", role: "assistant" });
  });

  test("message.part.updated text part maps to a text snapshot", () => {
    const e = mapEngineEvent(
      {
        type: "message.part.updated",
        properties: { sessionID: "ses_1", part: { id: "prt_1", messageID: "msg_1", sessionID: "ses_1", type: "text", text: "Hello wor" } },
      },
      "",
    );
    assert.deepEqual(e, {
      type: "part.snapshot",
      sessionId: "ses_1",
      messageId: "msg_1",
      partId: "prt_1",
      part: { kind: "text", text: "Hello wor" },
    });
  });

  test("message.part.updated tool part carries call id, name and status", () => {
    const e = mapEngineEvent(
      {
        type: "message.part.updated",
        properties: {
          sessionID: "ses_1",
          part: { id: "prt_2", messageID: "msg_1", type: "tool", callID: "call_9", tool: "run_sql", state: { status: "completed" } },
        },
      },
      "",
    );
    assert.deepEqual(e, {
      type: "part.snapshot",
      sessionId: "ses_1",
      messageId: "msg_1",
      partId: "prt_2",
      part: { kind: "tool", callId: "call_9", name: "run_sql", status: "completed" },
    });
  });

  test("non-chat part types (step markers) are ignored", () => {
    const e = mapEngineEvent(
      { type: "message.part.updated", properties: { sessionID: "ses_1", part: { id: "p", messageID: "m", type: "step-start" } } },
      "",
    );
    assert.equal(e, null);
  });
});

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
