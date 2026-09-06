import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SkillStore } from "./skills.ts";

function store(): { s: SkillStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "exa-skills-"));
  return { s: new SkillStore(dir), dir };
}

test("every builtin skill parses with a name and a non-empty description", () => {
  const { s, dir } = store();
  try {
    const skills = s.list().filter((sk) => sk.source === "builtin");
    assert.ok(skills.length > 10, `expected the bundled skill set, got ${skills.length}`);
    for (const sk of skills) {
      assert.ok(sk.name.trim(), "skill with empty name");
      // References inherit a generated description; top-level skills must carry their own.
      if (!sk.name.includes("/")) {
        assert.ok(sk.description.trim(), `skill "${sk.name}" has no description (semantic recall would never surface it)`);
        assert.ok(sk.body.trim(), `skill "${sk.name}" has an empty body`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("skill names are unique after user-over-builtin merge", () => {
  const { s, dir } = store();
  try {
    const names = s.list().map((sk) => sk.name);
    assert.equal(new Set(names).size, names.length, "duplicate skill names");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the master scenario skillset is present", () => {
  const { s, dir } = store();
  try {
    for (const name of [
      "scenario-router",
      "exasol-federation",
      "exasol-scheduling",
      "exasol-dbt",
      "exasol-etl-orchestration",
      "exasol-community-upgrade",
      "data-loading-playbook",
      "dashboard-builder",
    ]) {
      assert.ok(s.get(name), `missing builtin skill: ${name}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("router skills cross-reference existing skills, not phantom ones", () => {
  const { s, dir } = store();
  try {
    const names = new Set(s.list().map((sk) => sk.name));
    const referenced = new Set<string>();
    for (const sk of s.list()) {
      for (const m of sk.body.matchAll(/load_skill\('([^']+)'\)/g)) referenced.add(m[1]);
    }
    for (const name of referenced) {
      assert.ok(
        [...names].some((n) => n === name || n.includes(name)),
        `skill body references load_skill('${name}') but no such skill exists`,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
