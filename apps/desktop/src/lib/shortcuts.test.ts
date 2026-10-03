import assert from "node:assert/strict";
import { test } from "node:test";
import { SHORTCUTS, formatKeys, matchShortcut, matchesKeys } from "./shortcuts.ts";

const ev = (code: string, mods: Partial<{ meta: boolean; ctrl: boolean; shift: boolean; alt: boolean }> = {}) => ({
  key: "",
  code,
  metaKey: !!mods.meta,
  ctrlKey: !!mods.ctrl,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
});
const SHELL = { inEditor: false, inDialog: false };
const EDITOR = { inEditor: true, inDialog: false };
const DIALOG = { inEditor: false, inDialog: true };

test("Mod is Cmd on macOS and Ctrl elsewhere", () => {
  assert.equal(matchesKeys(ev("KeyS", { meta: true }), "Mod+S", true), true);
  assert.equal(matchesKeys(ev("KeyS", { ctrl: true }), "Mod+S", true), false);
  assert.equal(matchesKeys(ev("KeyS", { ctrl: true }), "Mod+S", false), true);
  assert.equal(matchesKeys(ev("KeyS", { meta: true, shift: true }), "Mod+S", true), false, "extra modifiers do not match");
});

test("the shell finds its shortcuts, never the editor's", () => {
  assert.equal(matchShortcut(ev("KeyT", { meta: true }), true, SHELL)?.id, "tab.new");
  assert.equal(matchShortcut(ev("Digit3", { meta: true }), true, SHELL)?.id, "tab.3");
  assert.equal(matchShortcut(ev("Tab", { ctrl: true, shift: true }), true, SHELL)?.id, "tab.prev");
  assert.equal(matchShortcut(ev("Period", { meta: true, shift: true }), true, SHELL)?.id, "run.cancel");
  assert.equal(matchShortcut(ev("Period", { meta: true }), true, EDITOR), null, "run current belongs to the editor");
  assert.equal(matchShortcut(ev("Slash", { meta: true, shift: true }), true, SHELL)?.id, "help.shortcuts");
});

test("Mod+K leaves the editor's chords alone", () => {
  assert.equal(matchShortcut(ev("KeyK", { meta: true }), true, SHELL)?.id, "find.everything");
  assert.equal(matchShortcut(ev("KeyK", { meta: true }), true, EDITOR), null, "inside Monaco, Cmd+K starts a chord");
});

test("no two shell shortcuts share a combination", () => {
  const seen = new Set<string>();
  for (const s of SHORTCUTS) {
    assert.ok(!seen.has(s.keys), `${s.keys} is used twice`);
    seen.add(s.keys);
  }
});

test("combinations read naturally per platform", () => {
  assert.equal(formatKeys("Mod+Shift+.", true), "⌘⇧.");
  assert.equal(formatKeys("Mod+Shift+.", false), "Ctrl+Shift+.");
  assert.equal(formatKeys("Ctrl+Tab", true), "⌃⇥");
});

test("while a dialog is open only Stop is taken", () => {
  assert.equal(matchShortcut(ev("KeyW", { meta: true }), true, DIALOG), null, "Cmd+W in a search box closes no tab");
  assert.equal(matchShortcut(ev("Period", { meta: true, shift: true }), true, DIALOG)?.id, "run.cancel");
});

test("a held key repeats only tab cycling", () => {
  assert.equal(matchShortcut({ ...ev("KeyT", { meta: true }), repeat: true }, true, SHELL), null, "holding Cmd+T opens one tab");
  assert.equal(matchShortcut({ ...ev("Tab", { ctrl: true }), repeat: true }, true, SHELL)?.id, "tab.next");
});

test("AltGr typing is never a shortcut", () => {
  assert.equal(matchShortcut({ ...ev("Digit2", { ctrl: true, alt: true }), altGraph: true }, false, SHELL), null);
  assert.equal(matchShortcut(ev("Digit2", { ctrl: true, alt: true }), false, SHELL)?.id, "focus.editor");
});
