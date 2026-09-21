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

// "I have data here and there" must land on the federation skill and that skill
// must default to a virtual schema — the hub's promise, pinned so a rewrite of
// the skill text cannot quietly drop either half.
test("the federation skill triggers on multi-source phrasing and defaults to a virtual schema", () => {
  const { s, dir } = store();
  try {
    const skill = s.get("exasol-federation");
    assert.ok(skill, "exasol-federation is a builtin skill");
    const description = skill!.description.toLowerCase();
    for (const cue of ["multiple sources", "here", "there", "postgres", "s3"]) {
      assert.ok(description.includes(cue), `description must carry the trigger word "${cue}"`);
    }
    assert.ok(/default to a virtual schema/i.test(skill!.description), "the description must name the default");
    assert.ok(/Add a data source/.test(skill!.body), "the body must point at Studio's add-data-source flow");
    assert.ok(/created means\s+proved/i.test(skill!.body), "the body must carry the created-means-proved rule");
    assert.ok(/virtual-schemas\//.test(skill!.body), "the body must reference the adapter catalog directory");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
