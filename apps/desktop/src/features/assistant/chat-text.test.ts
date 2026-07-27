/**
 * Edge-case tests for the assistant chat text helpers.
 *
 * `hasLeakedToolCall` / `stripToolJson` / `cleanAssistant` decide what the USER
 * sees when a model misfires its chat template and emits tool-call JSON as
 * prose. A false negative shows raw JSON in the chat; an over-eager strip eats
 * the real answer. Both are user-visible failures, so the boundaries are pinned
 * here rather than eyeballed.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  TOOL_LABELS,
  splitFences,
  relTime,
  argPreview,
  hasLeakedToolCall,
  stripToolJson,
  reflowMarkdownTables,
  cleanAssistant,
} from "./chat-text.ts";

describe("splitFences", () => {
  test("plain prose is one non-code region", () => {
    assert.deepEqual(splitFences("hello world"), [{ code: false, text: "hello world" }]);
  });

  test("empty input yields nothing", () => {
    assert.deepEqual(splitFences(""), []);
  });

  test("splits prose around a closed fence, keeping the markers in the code region", () => {
    assert.deepEqual(splitFences("a ```x``` b"), [
      { code: false, text: "a " },
      { code: true, text: "```x```" },
      { code: false, text: " b" },
    ]);
  });

  test("an unterminated fence runs to end-of-text (still typing)", () => {
    assert.deepEqual(splitFences("a ```x"), [
      { code: false, text: "a " },
      { code: true, text: "```x" },
    ]);
  });

  test("''' is a fence too, and does not close a ``` fence", () => {
    assert.deepEqual(splitFences("'''y'''"), [{ code: true, text: "'''y'''" }]);
    // A ''' inside a ``` fence is content, not a terminator.
    assert.deepEqual(splitFences("```a'''b```"), [{ code: true, text: "```a'''b```" }]);
  });
});

describe("relTime", () => {
  const now = 1_700_000_000_000;
  test("buckets by magnitude", () => {
    assert.equal(relTime(now - 1_000, now), "just now");
    assert.equal(relTime(now - 59_999, now), "just now");
    assert.equal(relTime(now - 60_000, now), "1m ago");
    assert.equal(relTime(now - 5 * 60_000, now), "5m ago");
    assert.equal(relTime(now - 3_600_000, now), "1h ago");
    assert.equal(relTime(now - 86_400_000, now), "1d ago");
    assert.equal(relTime(now - 3 * 86_400_000, now), "3d ago");
  });

  test("a future timestamp does not produce a negative age", () => {
    assert.equal(relTime(now + 10_000, now), "just now");
  });
});

describe("argPreview", () => {
  test("non-objects yield nothing", () => {
    assert.equal(argPreview(null), "");
    assert.equal(argPreview(undefined), "");
    assert.equal(argPreview("nope"), "");
    assert.equal(argPreview(42), "");
  });

  test("picks known keys in priority order, at most two", () => {
    assert.equal(argPreview({ schema: "MART", table: "ORDERS" }), "MART · ORDERS");
    assert.equal(argPreview({ query: "q", schema: "s", table: "t" }), "q · s");
  });

  test("ignores blank and non-string values", () => {
    assert.equal(argPreview({ schema: "   ", table: "T" }), "T");
    assert.equal(argPreview({ schema: 5, table: "T" }), "T");
    assert.equal(argPreview({ unrelated: "x" }), "");
  });

  test("collapses whitespace and truncates sql", () => {
    assert.equal(argPreview({ sql: "SELECT\n  a\n FROM t" }), "SELECT a FROM t");
    assert.equal(argPreview({ sql: "x".repeat(100) }).length, 60);
  });
});

describe("hasLeakedToolCall", () => {
  test("detects a known tool name", () => {
    assert.equal(hasLeakedToolCall('{"name":"run_sql"}'), true);
    assert.equal(hasLeakedToolCall('here you go {"name":"list_tables"} ok'), true);
  });

  test("detects an unknown tool name when an arguments key is present", () => {
    assert.equal(hasLeakedToolCall('{"name":"mystery","arguments":{}}'), true);
    assert.equal(hasLeakedToolCall('{"name":"mystery","parameters":{}}'), true);
  });

  test("does not fire on prose or unrelated JSON", () => {
    assert.equal(hasLeakedToolCall("just a normal answer"), false);
    assert.equal(hasLeakedToolCall(""), false);
    assert.equal(hasLeakedToolCall('{"name":"Alice"}'), false);
    assert.equal(hasLeakedToolCall('{"title":"run_sql"}'), false);
  });
});

describe("stripToolJson", () => {
  test("removes a complete tool-call object, keeping surrounding prose", () => {
    assert.equal(stripToolJson('before {"name":"run_sql","arguments":{"sql":"S"}} after'), "before  after");
  });

  test("removes several", () => {
    assert.equal(stripToolJson('a{"name":"run_sql"}b{"name":"list_tables"}c'), "abc");
  });

  test("is not confused by braces or escaped quotes inside strings", () => {
    assert.equal(stripToolJson('x {"name":"run_sql","arguments":{"sql":"a{}b"}} y'), "x  y");
    assert.equal(stripToolJson('x {"name":"run_sql","arguments":{"sql":"a\\"b"}} y'), "x  y");
  });

  test("an UNTERMINATED call drops the tail — a truncated stream must not leak JSON", () => {
    assert.equal(stripToolJson('good prose {"name":"run_sql","arguments":{"sql":'), "good prose ");
  });

  test("leaves text with no tool call untouched", () => {
    assert.equal(stripToolJson("nothing to strip"), "nothing to strip");
    assert.equal(stripToolJson(""), "");
  });
});

describe("reflowMarkdownTables", () => {
  test("leaves text without a separator row untouched", () => {
    assert.equal(reflowMarkdownTables("no pipes here"), "no pipes here");
    assert.equal(reflowMarkdownTables("| a | b |"), "| a | b |");
  });

  test("leaves an already-correct multi-line table untouched", () => {
    const t = "| a | b |\n| --- | --- |\n| 1 | 2 |";
    assert.equal(reflowMarkdownTables(t), t);
  });

  test("reflows a table collapsed onto one line", () => {
    const got = reflowMarkdownTables("| a | b | --- | --- | 1 | 2 | 3 | 4 |");
    assert.equal(got, "| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |");
  });

  test("pads a short trailing row rather than misaligning columns", () => {
    const got = reflowMarkdownTables("| a | b | --- | --- | 1 |");
    assert.equal(got, "| a | b |\n| --- | --- |\n| 1 |  |");
  });

  test("refuses when header count and separator count disagree", () => {
    // 1 header cell but 2 separators — ambiguous, so leave it alone.
    const line = "| a | --- | --- | 1 | 2 |";
    assert.equal(reflowMarkdownTables(line), line);
  });
});

describe("cleanAssistant", () => {
  test("empty input passes through", () => {
    assert.equal(cleanAssistant(""), "");
  });

  test("clean prose is returned unchanged", () => {
    assert.equal(cleanAssistant("The table has 12 columns."), "The table has 12 columns.");
  });

  test("strips a leaked tool call and the fences it tangled", () => {
    const raw = '```json\n{"name":"run_sql","arguments":{"sql":"SELECT 1"}}\n```\nHere are your rows.';
    const got = cleanAssistant(raw);
    assert.ok(!got.includes('"name"'), `tool JSON leaked: ${got}`);
    assert.ok(!got.includes("```"), `fence leaked: ${got}`);
    assert.ok(got.includes("Here are your rows."));
  });

  test("collapses the blank-line run left behind and trims", () => {
    const got = cleanAssistant('{"name":"run_sql"}\n\n\n\nAnswer.');
    assert.equal(got, "Answer.");
  });

  test("keeps a prose word glued to a closing fence", () => {
    // The two-step fence strip exists so "```It" does not lose "It".
    const got = cleanAssistant('{"name":"run_sql"} ```It worked.');
    assert.ok(got.includes("It worked."), got);
  });

  test("reflows a collapsed table even when there is no tool call", () => {
    const got = cleanAssistant("| a | b | --- | --- | 1 | 2 |");
    assert.equal(got, "| a | b |\n| --- | --- |\n| 1 | 2 |");
  });
});

describe("TOOL_LABELS", () => {
  test("every label is a non-empty human-readable string", () => {
    for (const [name, label] of Object.entries(TOOL_LABELS)) {
      assert.ok(label.trim().length > 0, `${name} has an empty label`);
      assert.ok(!label.includes("_"), `${name} label looks like an identifier: ${label}`);
    }
  });

  test("covers the tools most likely to appear in a turn", () => {
    for (const t of ["run_sql", "list_schemas", "list_tables", "describe_table"]) {
      assert.ok(t in TOOL_LABELS, `missing label for ${t}`);
    }
  });
});
