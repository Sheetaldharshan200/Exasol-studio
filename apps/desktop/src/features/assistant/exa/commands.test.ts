import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { filterCommands, parseSlash, expandCommand, transcriptMarkdown, SLASH_COMMANDS } from "./commands.ts";
import type { ExaSnapshot } from "./context.ts";

function snapshot(over: Partial<ExaSnapshot> = {}): ExaSnapshot {
  return {
    connectionName: "EXAoneDB",
    schema: "SALES",
    schemas: ["SALES"],
    catalog: { schemas: new Map(), scripts: [] },
    editorSql: "SELECT 1",
    lastResult: null,
    history: [],
    ...over,
  };
}

describe("filterCommands", () => {
  test("empty query lists every command", () => {
    assert.equal(filterCommands("").length, SLASH_COMMANDS.length);
  });
  test("matches by title prefix and description, case-insensitive", () => {
    assert.deepEqual(filterCommands("opt").map((c) => c.id), ["optimize"]);
    assert.ok(filterCommands("MARKDOWN").some((c) => c.id === "share"));
  });
  test("no match yields empty list", () => {
    assert.deepEqual(filterCommands("zzz"), []);
  });
});

describe("parseSlash", () => {
  test("command with argument", () => {
    const r = parseSlash("/fix the join is wrong");
    assert.equal(r?.command.id, "fix");
    assert.equal(r?.arg, "the join is wrong");
  });
  test("command without argument", () => {
    const r = parseSlash("/explain");
    assert.equal(r?.command.id, "explain");
    assert.equal(r?.arg, "");
  });
  test("multiline argument is preserved", () => {
    const r = parseSlash("/generate top customers\nby revenue");
    assert.equal(r?.arg, "top customers\nby revenue");
  });
  test("unknown command returns null (sent verbatim)", () => {
    assert.equal(parseSlash("/frobnicate stuff"), null);
  });
  test("non-slash text returns null", () => {
    assert.equal(parseSlash("hello /explain"), null);
    assert.equal(parseSlash(""), null);
  });
  test("case-insensitive command name", () => {
    assert.equal(parseSlash("/EXPLAIN")?.command.id, "explain");
  });
});

describe("expandCommand", () => {
  test("generate embeds the description and attaches schema context", () => {
    const e = expandCommand("generate", "top 10 customers", snapshot());
    assert.match(e.text, /top 10 customers/);
    assert.ok(e.providerIds.includes("schema"));
  });
  test("explain attaches the query when the editor has SQL", () => {
    const e = expandCommand("explain", "", snapshot());
    assert.ok(e.providerIds.includes("query"));
  });
  test("explain skips the query provider when the editor is empty", () => {
    const e = expandCommand("explain", "", snapshot({ editorSql: "  " }));
    assert.ok(!e.providerIds.includes("query"));
  });
  test("fix includes the user's description and results context", () => {
    const e = expandCommand("fix", "wrong row count", snapshot());
    assert.match(e.text, /wrong row count/);
    assert.ok(e.providerIds.includes("results"));
  });
  test("review mentions safety and attaches schema", () => {
    const e = expandCommand("review", "", snapshot());
    assert.match(e.text, /safety/i);
    assert.ok(e.providerIds.includes("schema"));
  });
});

describe("transcriptMarkdown", () => {
  test("renders roles as headings in order", () => {
    const md = transcriptMarkdown([
      { role: "user", text: "hi" },
      { role: "assistant", text: "hello" },
    ]);
    assert.match(md, /## You\n\nhi\n\n## Exa\n\nhello/);
    assert.match(md, /^# Exa conversation/);
  });
  test("empty transcript is just the title", () => {
    assert.equal(transcriptMarkdown([]), "# Exa conversation\n");
  });
});
