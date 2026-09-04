import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore, DEFAULT_AGENT_SETTINGS } from "./config.ts";

function freshStore(): { store: ConfigStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "exa-cfg-"));
  return { store: new ConfigStore(dir), dir };
}

test("appControl defaults to ON via settings()", () => {
  const { store, dir } = freshStore();
  try {
    assert.equal(store.settings().appControl, true);
    assert.equal(DEFAULT_AGENT_SETTINGS.appControl, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("appControl toggle persists and is read back through settings()", () => {
  const { store, dir } = freshStore();
  try {
    store.update((cfg) => { cfg.agent = { ...cfg.agent, appControl: false }; });
    assert.equal(store.settings().appControl, false);
    store.update((cfg) => { cfg.agent = { ...cfg.agent, appControl: true }; });
    assert.equal(store.settings().appControl, true);
    // A brand-new store over the same dir must see the persisted value.
    assert.equal(new ConfigStore(dir).settings().appControl, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Regression guard: appControl is an AgentSettings field (under config.agent),
// NOT a top-level AgentConfig field. The server's action gate once read
// `config.get().appControl` (always undefined ⇒ every action rejected even with
// the toggle ON). It must read `config.settings().appControl` instead.
test("appControl is NOT a top-level config field — must go through settings()", () => {
  const { store, dir } = freshStore();
  try {
    store.update((cfg) => { cfg.agent = { ...cfg.agent, appControl: true }; });
    assert.equal((store.get() as unknown as { appControl?: boolean }).appControl, undefined);
    assert.equal(store.settings().appControl, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
