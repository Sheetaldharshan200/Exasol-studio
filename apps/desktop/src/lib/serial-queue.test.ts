import assert from "node:assert/strict";
import { test } from "node:test";
import { createSerialQueue } from "./serial-queue.ts";

const defer = () => {
  let resolve!: (v: string) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

test("jobs on one key never overlap", async () => {
  const q = createSerialQueue();
  const log: string[] = [];
  const a = defer();
  const first = q.run("c", async () => {
    log.push("a:start");
    const v = await a.promise;
    log.push("a:end");
    return v;
  });
  const second = q.run("c", async () => {
    log.push("b:start");
    return "b";
  });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(log, ["a:start"], "the second job waits for the first");
  a.resolve("a");
  assert.equal(await first, "a");
  assert.equal(await second, "b");
  assert.deepEqual(log, ["a:start", "a:end", "b:start"]);
});

test("different keys run in parallel", async () => {
  const q = createSerialQueue();
  const log: string[] = [];
  const a = defer();
  const first = q.run("one", async () => {
    log.push("one:start");
    return a.promise;
  });
  await q.run("two", async () => {
    log.push("two:done");
    return "two";
  });
  assert.deepEqual(log, ["one:start", "two:done"]);
  a.resolve("a");
  await first;
});

test("a failed job does not break the queue behind it", async () => {
  const q = createSerialQueue();
  const failed = q.run("c", async () => {
    throw new Error("boom");
  });
  await assert.rejects(failed, /boom/);
  assert.equal(await q.run("c", async () => "after"), "after");
});

test("a rejection reaches the caller, not an unhandled rejection", async () => {
  const q = createSerialQueue();
  await assert.rejects(q.run("c", async () => Promise.reject(new Error("x"))), /x/);
});

test("settled keys are forgotten, so the queue does not grow forever", async () => {
  const q = createSerialQueue();
  await q.run("c", async () => "done");
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(q.pending(), []);
});

test("a key with work still queued is kept", async () => {
  const q = createSerialQueue();
  const a = defer();
  const held = q.run("c", () => a.promise);
  assert.deepEqual(q.pending(), ["c"]);
  a.resolve("a");
  await held;
});
