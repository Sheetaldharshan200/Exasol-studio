import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mapReplayMessage, mapReplayMessages } from "./replay-map.ts";

describe("mapReplayMessage", () => {
  test("maps a user text message", () => {
    const m = mapReplayMessage({ info: { role: "user" }, parts: [{ type: "text", text: "hi" }] });
    assert.deepEqual(m, { role: "user", parts: [{ type: "text", text: "hi" }] });
  });

  test("merges consecutive text parts", () => {
    const m = mapReplayMessage({
      info: { role: "assistant" },
      parts: [
        { type: "text", text: "```sql\nSELECT" },
        { type: "text", text: " 1\n```" },
      ],
    });
    assert.equal(m?.parts.length, 1);
    assert.deepEqual(m?.parts[0], { type: "text", text: "```sql\nSELECT 1\n```" });
  });

  test("maps tool parts with status → ok, keeping order between texts", () => {
    const m = mapReplayMessage({
      info: { role: "assistant" },
      parts: [
        { type: "text", text: "checking" },
        { type: "tool", tool: "run_sql", callID: "c1", state: { status: "completed" } },
        { type: "tool", tool: "run_sql", callID: "c2", state: { status: "error" } },
        { type: "tool", tool: "run_sql", callID: "c3", state: { status: "running" } },
        { type: "text", text: "done" },
      ],
    });
    assert.deepEqual(m?.parts, [
      { type: "text", text: "checking" },
      { type: "tool", callId: "c1", name: "run_sql", ok: true },
      { type: "tool", callId: "c2", name: "run_sql", ok: false },
      { type: "tool", callId: "c3", name: "run_sql", ok: undefined },
      { type: "text", text: "done" },
    ]);
  });

  test("tool part falls back to id then a synthetic call id", () => {
    const m = mapReplayMessage({
      info: { role: "assistant" },
      parts: [
        { type: "tool", tool: "a", id: "p1" },
        { type: "tool", tool: "b" },
      ],
    });
    assert.equal((m?.parts[0] as { callId: string }).callId, "p1");
    assert.equal((m?.parts[1] as { callId: string }).callId, "b-1");
  });

  test("drops empty text, unknown part types, and non-chat roles", () => {
    assert.equal(mapReplayMessage({ info: { role: "user" }, parts: [{ type: "text", text: "" }] }), null);
    assert.equal(mapReplayMessage({ info: { role: "system" }, parts: [{ type: "text", text: "x" }] }), null);
    assert.equal(mapReplayMessage({ info: { role: "assistant" }, parts: [{ type: "step-start" }] }), null);
    assert.equal(mapReplayMessage({}), null);
  });
});

describe("mapReplayMessages", () => {
  test("maps a conversation and drops empties", () => {
    const out = mapReplayMessages([
      { info: { role: "user" }, parts: [{ type: "text", text: "q" }] },
      { info: { role: "assistant" }, parts: [] },
      { info: { role: "assistant" }, parts: [{ type: "text", text: "a" }] },
    ]);
    assert.equal(out.length, 2);
    assert.equal(out[0].role, "user");
    assert.equal(out[1].role, "assistant");
  });
});
