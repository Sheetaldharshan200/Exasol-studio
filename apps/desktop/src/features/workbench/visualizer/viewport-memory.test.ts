import assert from "node:assert/strict";
import { test } from "node:test";
import { createViewportMemory, isUserMove } from "./viewport-memory.ts";

const V = (x: number) => ({ x, y: 0, zoom: 1 });

test("nothing is remembered to begin with", () => {
  const m = createViewportMemory<{ x: number }>();
  assert.equal(m.has(), false);
  assert.equal(m.take(), null);
});

test("what was remembered comes back", () => {
  const m = createViewportMemory<ReturnType<typeof V>>();
  m.remember(V(10));
  assert.equal(m.has(), true);
  assert.deepEqual(m.take(), V(10));
});

test("the first place wins: two zooms in a row still return to the start", () => {
  const m = createViewportMemory<ReturnType<typeof V>>();
  m.remember(V(1));
  m.remember(V(2));
  assert.deepEqual(m.take(), V(1));
});

test("coming back forgets, so a second tap outside does not jump again", () => {
  const m = createViewportMemory<ReturnType<typeof V>>();
  m.remember(V(5));
  m.take();
  assert.equal(m.has(), false);
  assert.equal(m.take(), null);
});

test("after coming back, the next zoom remembers afresh", () => {
  const m = createViewportMemory<ReturnType<typeof V>>();
  m.remember(V(1));
  m.take();
  m.remember(V(9));
  assert.deepEqual(m.take(), V(9));
});

test("a diagram that changed under us has nothing to return to", () => {
  const m = createViewportMemory<ReturnType<typeof V>>();
  m.remember(V(3));
  m.clear();
  assert.equal(m.has(), false);
  assert.equal(m.take(), null);
});

test("a move the user made replaces where they came from; ours does not", () => {
  // React Flow hands us the causing event, or null when it moved the canvas
  // for us (a fitBounds animation).
  assert.equal(isUserMove(null), false);
  assert.equal(isUserMove(undefined), false);
  assert.equal(isUserMove({ type: "wheel" }), true);
});
