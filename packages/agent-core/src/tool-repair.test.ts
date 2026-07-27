/**
 * Edge-case tests for the deterministic tool-call repair layer.
 *
 * This module exists to rescue weak local models that get the INTENT right and
 * the MECHANICS wrong. It is pure string/JSON manipulation with no I/O, which
 * makes it exactly the kind of logic CLAUDE.md's "keep it small enough to test"
 * rule is about — and it had no tests at all.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  resolveToolName,
  parseLooseArgs,
  repairArgs,
  extractTextToolCalls,
  zodSchemaish,
  repairCall,
  rescueTextCalls,
} from "./tool-repair.ts";

const TOOLS = ["run_sql", "list_schemas", "list_tables", "describe_table", "remember"];

describe("resolveToolName", () => {
  test("returns the exact name when it already exists", () => {
    assert.equal(resolveToolName("run_sql", TOOLS), "run_sql");
  });

  test("normalizes case and separators", () => {
    assert.equal(resolveToolName("Run_SQL", TOOLS), "run_sql");
    assert.equal(resolveToolName("run-sql", TOOLS), "run_sql");
    assert.equal(resolveToolName("RUNSQL", TOOLS), "run_sql");
    assert.equal(resolveToolName("run sql", TOOLS), "run_sql");
  });

  test("maps known hallucinated aliases to the real tool", () => {
    assert.equal(resolveToolName("execute_sql", TOOLS), "run_sql");
    assert.equal(resolveToolName("executeQuery", TOOLS), "run_sql");
    assert.equal(resolveToolName("show_tables", TOOLS), "list_tables");
    assert.equal(resolveToolName("getSchemas", TOOLS), "list_schemas");
  });

  test("refuses an alias whose target is not exposed this turn", () => {
    // "execute_sql" aliases to run_sql, but run_sql is not available here.
    assert.equal(resolveToolName("execute_sql", ["list_schemas"]), null);
  });

  test("resolves an unambiguous prefix or substring", () => {
    assert.equal(resolveToolName("list_tabl", TOOLS), "list_tables");
    assert.equal(resolveToolName("describe_table_extra", TOOLS), "describe_table");
  });

  test("refuses an ambiguous substring rather than guessing", () => {
    // "list" matches both list_schemas and list_tables.
    assert.equal(resolveToolName("list", TOOLS), null);
  });

  test("does not substring-match inputs shorter than 4 chars", () => {
    assert.equal(resolveToolName("rem", TOOLS), null);
    assert.equal(resolveToolName("run", TOOLS), null);
  });

  // Boundary + empty-input paths.
  test("handles empty inputs without throwing", () => {
    assert.equal(resolveToolName("", TOOLS), null);
    assert.equal(resolveToolName("run_sql", []), null);
    assert.equal(resolveToolName("", []), null);
  });

  test("ignores punctuation-only noise", () => {
    assert.equal(resolveToolName("!!!", TOOLS), null);
  });
});

describe("parseLooseArgs", () => {
  test("treats null and undefined as empty args", () => {
    assert.deepEqual(parseLooseArgs(null), {});
    assert.deepEqual(parseLooseArgs(undefined), {});
  });

  test("passes an object straight through", () => {
    const o = { sql: "SELECT 1" };
    assert.deepEqual(parseLooseArgs(o), o);
  });

  test("treats blank and null-ish strings as empty args", () => {
    assert.deepEqual(parseLooseArgs(""), {});
    assert.deepEqual(parseLooseArgs("   "), {});
    assert.deepEqual(parseLooseArgs("null"), {});
    assert.deepEqual(parseLooseArgs("undefined"), {});
  });

  test("parses plain JSON", () => {
    assert.deepEqual(parseLooseArgs('{"sql":"SELECT 1"}'), { sql: "SELECT 1" });
  });

  test("strips markdown fences", () => {
    assert.deepEqual(parseLooseArgs('```json\n{"sql":"SELECT 1"}\n```'), { sql: "SELECT 1" });
    assert.deepEqual(parseLooseArgs('```\n{"a":1}\n```'), { a: 1 });
  });

  test("unwraps double-encoded JSON", () => {
    assert.deepEqual(parseLooseArgs(JSON.stringify(JSON.stringify({ sql: "SELECT 1" }))), {
      sql: "SELECT 1",
    });
  });

  test("recovers an object buried in trailing prose", () => {
    assert.deepEqual(
      parseLooseArgs('{"sql":"SELECT 1"} — I hope this helps!'),
      { sql: "SELECT 1" },
    );
  });

  test("rejects arrays and non-object JSON", () => {
    assert.equal(parseLooseArgs("[1,2,3]"), null);
    assert.equal(parseLooseArgs("42"), null);
    assert.equal(parseLooseArgs("true"), null);
  });

  test("rejects unparseable junk", () => {
    assert.equal(parseLooseArgs("{not json at all"), null);
    assert.equal(parseLooseArgs("<<<>>>"), null);
  });

  test("rejects non-string, non-object input", () => {
    assert.equal(parseLooseArgs(42), null);
    assert.equal(parseLooseArgs(true), null);
  });
});

describe("repairArgs", () => {
  const sqlSchema = { properties: { sql: { type: "string" } }, required: ["sql"] };

  test("keeps a correct argument untouched", () => {
    assert.deepEqual(repairArgs({ sql: "SELECT 1" }, sqlSchema), { sql: "SELECT 1" });
  });

  test("renames a known aliased key", () => {
    assert.deepEqual(repairArgs({ query: "SELECT 1" }, sqlSchema), { sql: "SELECT 1" });
    assert.deepEqual(repairArgs({ statement: "SELECT 1" }, sqlSchema), { sql: "SELECT 1" });
  });

  test("matches keys case-insensitively", () => {
    assert.deepEqual(repairArgs({ SQL: "SELECT 1" }, sqlSchema), { sql: "SELECT 1" });
  });

  test("never lets an alias overwrite the canonical key", () => {
    assert.deepEqual(
      repairArgs({ sql: "GOOD", query: "BAD" }, sqlSchema),
      { sql: "GOOD" },
    );
  });

  test("drops keys the schema does not declare", () => {
    assert.deepEqual(
      repairArgs({ sql: "SELECT 1", nonsense: "drop me" }, sqlSchema),
      { sql: "SELECT 1" },
    );
  });

  test("returns null when a required key cannot be recovered", () => {
    assert.equal(repairArgs({ unrelated: 1 }, sqlSchema), null);
    assert.equal(repairArgs({}, sqlSchema), null);
  });

  test("coerces string digits to number and integer", () => {
    const s = { properties: { limit: { type: "number" } }, required: [] };
    assert.deepEqual(repairArgs({ limit: "10" }, s), { limit: 10 });
    const i = { properties: { limit: { type: "integer" } }, required: [] };
    assert.deepEqual(repairArgs({ limit: "7" }, i), { limit: 7 });
  });

  test("leaves non-numeric strings alone rather than producing NaN", () => {
    const s = { properties: { limit: { type: "number" } }, required: [] };
    assert.deepEqual(repairArgs({ limit: "abc" }, s), { limit: "abc" });
    assert.deepEqual(repairArgs({ limit: "" }, s), { limit: "" });
  });

  test("coerces boolean strings", () => {
    const s = { properties: { flag: { type: "boolean" } }, required: [] };
    assert.deepEqual(repairArgs({ flag: "true" }, s), { flag: true });
    assert.deepEqual(repairArgs({ flag: "false" }, s), { flag: false });
    // Anything else is left as-is rather than guessed at.
    assert.deepEqual(repairArgs({ flag: "yes" }, s), { flag: "yes" });
  });

  test("stringifies numbers and booleans for string params", () => {
    const s = { properties: { note: { type: "string" } }, required: [] };
    assert.deepEqual(repairArgs({ note: 42 }, s), { note: "42" });
    assert.deepEqual(repairArgs({ note: true }, s), { note: "true" });
  });

  test("accepts a union type by using its first member", () => {
    const s = { properties: { limit: { type: ["number", "null"] } }, required: [] };
    assert.deepEqual(repairArgs({ limit: "5" }, s), { limit: 5 });
  });

  test("empty schema drops everything but still succeeds", () => {
    assert.deepEqual(repairArgs({ a: 1 }, {}), {});
    assert.deepEqual(repairArgs({}, {}), {});
  });
});

describe("extractTextToolCalls", () => {
  test("returns nothing for text with no braces", () => {
    assert.deepEqual(extractTextToolCalls("just a sentence"), []);
    assert.deepEqual(extractTextToolCalls(""), []);
  });

  test("extracts a bare call object", () => {
    const got = extractTextToolCalls('{"name":"run_sql","arguments":{"sql":"SELECT 1"}}');
    assert.deepEqual(got, [{ name: "run_sql", args: { sql: "SELECT 1" } }]);
  });

  test("unwraps <tool_call> markers", () => {
    const got = extractTextToolCalls(
      '<tool_call>{"name":"list_tables","arguments":{}}</tool_call>',
    );
    assert.deepEqual(got, [{ name: "list_tables", args: {} }]);
  });

  test("unwraps fenced json blocks", () => {
    const got = extractTextToolCalls('```json\n{"name":"list_schemas","arguments":{}}\n```');
    assert.deepEqual(got, [{ name: "list_schemas", args: {} }]);
  });

  test("accepts each supported name key", () => {
    for (const key of ["name", "tool", "function", "tool_name"]) {
      const got = extractTextToolCalls(`{"${key}":"run_sql","arguments":{"sql":"S"}}`);
      assert.deepEqual(got, [{ name: "run_sql", args: { sql: "S" } }], `name key: ${key}`);
    }
  });

  test("accepts each supported args key", () => {
    for (const key of ["arguments", "parameters", "args", "input", "params"]) {
      const got = extractTextToolCalls(`{"name":"run_sql","${key}":{"sql":"S"}}`);
      assert.deepEqual(got, [{ name: "run_sql", args: { sql: "S" } }], `args key: ${key}`);
    }
  });

  test("defaults to empty args when none are supplied", () => {
    assert.deepEqual(extractTextToolCalls('{"name":"list_tables"}'), [
      { name: "list_tables", args: {} },
    ]);
  });

  test("finds several calls in one message", () => {
    const got = extractTextToolCalls(
      '{"name":"list_schemas","arguments":{}} then {"name":"list_tables","arguments":{}}',
    );
    assert.equal(got.length, 2);
    assert.deepEqual(got.map((c) => c.name), ["list_schemas", "list_tables"]);
  });

  test("caps runaway output at 4 calls", () => {
    const one = '{"name":"list_tables","arguments":{}}';
    assert.equal(extractTextToolCalls(one.repeat(10)).length, 4);
  });

  test("is not fooled by braces inside string values", () => {
    const got = extractTextToolCalls('{"name":"run_sql","arguments":{"sql":"SELECT \'{}\' AS x"}}');
    assert.deepEqual(got, [{ name: "run_sql", args: { sql: "SELECT '{}' AS x" } }]);
  });

  test("is not fooled by escaped quotes inside string values", () => {
    const got = extractTextToolCalls('{"name":"run_sql","arguments":{"sql":"a \\" b"}}');
    assert.deepEqual(got, [{ name: "run_sql", args: { sql: 'a " b' } }]);
  });

  test("skips malformed blocks and keeps the good ones", () => {
    const got = extractTextToolCalls('{broken} {"name":"run_sql","arguments":{"sql":"S"}}');
    assert.deepEqual(got, [{ name: "run_sql", args: { sql: "S" } }]);
  });

  test("skips objects that are not shaped like a call", () => {
    assert.deepEqual(extractTextToolCalls('{"foo":"bar"}'), []);
    // A non-string name is not a name.
    assert.deepEqual(extractTextToolCalls('{"name":123,"arguments":{}}'), []);
    assert.deepEqual(extractTextToolCalls('{"name":"","arguments":{}}'), []);
  });

  test("recovers from unbalanced closing braces", () => {
    const got = extractTextToolCalls('}} {"name":"run_sql","arguments":{"sql":"S"}}');
    assert.deepEqual(got, [{ name: "run_sql", args: { sql: "S" } }]);
  });
});

describe("zodSchemaish", () => {
  test("reads a plain JSON Schema directly", () => {
    const got = zodSchemaish({
      properties: { sql: { type: "string" } },
      required: ["sql"],
    });
    assert.deepEqual(got, { properties: { sql: { type: "string" } }, required: ["sql"] });
  });

  test("defaults required to an empty list when absent", () => {
    const got = zodSchemaish({ properties: { sql: { type: "string" } } });
    assert.deepEqual(got?.required, []);
  });

  test("returns null for shapes it cannot read", () => {
    assert.equal(zodSchemaish(null), null);
    assert.equal(zodSchemaish(undefined), null);
    assert.equal(zodSchemaish({}), null);
    assert.equal(zodSchemaish("nope"), null);
    assert.equal(zodSchemaish(42), null);
  });

  // The zod branch is reached via `.shape`. These fakes mimic just the v3
  // internals the function reads, so the test does not depend on zod itself.
  const zodField = (typeName: string, optional = false) => ({
    _def: { typeName },
    isOptional: () => optional,
  });

  test("reads a zod object shape and maps primitive types", () => {
    const got = zodSchemaish({
      shape: {
        sql: zodField("ZodString"),
        limit: zodField("ZodNumber"),
        flag: zodField("ZodBoolean"),
        mode: zodField("ZodEnum"),
      },
    });
    assert.deepEqual(got?.properties, {
      sql: { type: "string" },
      limit: { type: "number" },
      flag: { type: "boolean" },
      mode: { type: "string" },
    });
    assert.deepEqual(got?.required, ["sql", "limit", "flag", "mode"]);
  });

  test("omits optional fields from required", () => {
    const got = zodSchemaish({
      shape: { a: zodField("ZodString"), b: zodField("ZodString", true) },
    });
    assert.deepEqual(got?.required, ["a"]);
  });

  test("unwraps Optional/Default wrappers to find the base type", () => {
    const wrapped = {
      _def: { typeName: "ZodOptional", innerType: { _def: { typeName: "ZodString" } } },
      isOptional: () => true,
    };
    const got = zodSchemaish({ shape: { sql: wrapped } });
    assert.deepEqual(got?.properties.sql, { type: "string" });
  });

  test("leaves an unrecognized zod type untyped rather than guessing", () => {
    const got = zodSchemaish({ shape: { blob: zodField("ZodRecord") } });
    assert.deepEqual(got?.properties.blob, {});
  });

  test("stops unwrapping instead of looping forever on a cyclic wrapper", () => {
    const cyclic: Record<string, unknown> = { _def: { typeName: "ZodOptional" } };
    (cyclic._def as Record<string, unknown>).innerType = cyclic;
    const got = zodSchemaish({ shape: { x: cyclic } });
    assert.deepEqual(got?.properties.x, {});
  });
});

describe("repairCall", () => {
  const tools = { run_sql: {}, list_tables: {} };
  const getSchema = () => ({ properties: { sql: { type: "string" } }, required: ["sql"] });

  test("repairs a hallucinated name and an aliased key together", () => {
    const got = repairCall({
      requestedName: "execute_sql",
      rawInput: '{"query":"SELECT 1"}',
      tools,
      getSchema,
    });
    assert.deepEqual(got, {
      toolName: "run_sql",
      input: '{"sql":"SELECT 1"}',
      note: "execute_sql → run_sql",
    });
  });

  test("reports args-only repair when the name was already right", () => {
    const got = repairCall({ requestedName: "run_sql", rawInput: '{"query":"S"}', tools, getSchema });
    assert.equal(got?.note, "args repaired");
    assert.equal(got?.toolName, "run_sql");
  });

  test("gives up when the tool name cannot be resolved", () => {
    assert.equal(
      repairCall({ requestedName: "totally_unknown", rawInput: "{}", tools, getSchema }),
      null,
    );
  });

  test("gives up when the arguments cannot be parsed", () => {
    assert.equal(
      repairCall({ requestedName: "run_sql", rawInput: "{not json", tools, getSchema }),
      null,
    );
  });

  test("gives up rather than invent a missing required argument", () => {
    assert.equal(repairCall({ requestedName: "run_sql", rawInput: "{}", tools, getSchema }), null);
  });

  test("a schema lookup that throws must not discard the arguments", () => {
    const got = repairCall({
      requestedName: "run_sql",
      rawInput: '{"sql":"S"}',
      tools,
      getSchema: () => {
        throw new Error("boom");
      },
    });
    // Without a schema we cannot repair keys — but dropping them turned a
    // perfectly good call into a misleading "missing required argument".
    assert.equal(got?.toolName, "run_sql");
    assert.equal(got?.input, '{"sql":"S"}');
  });

  test("a schema lookup that returns nothing also preserves the arguments", () => {
    const got = repairCall({
      requestedName: "run_sql",
      rawInput: '{"sql":"S"}',
      tools,
      getSchema: () => undefined as unknown as ReturnType<typeof getSchema>,
    });
    assert.equal(got?.toolName, "run_sql");
    assert.equal(got?.input, '{"sql":"S"}');
  });

  test("an empty-properties schema also preserves the arguments", () => {
    const got = repairCall({
      requestedName: "run_sql",
      rawInput: '{"sql":"S"}',
      tools,
      getSchema: () => ({ properties: {}, required: [] }),
    });
    assert.equal(got?.input, '{"sql":"S"}');
  });

  test("returns null when no tools are exposed", () => {
    assert.equal(repairCall({ requestedName: "run_sql", rawInput: "{}", tools: {}, getSchema }), null);
  });
});

describe("rescueTextCalls", () => {
  test("returns nothing for ordinary prose", () => {
    assert.deepEqual(rescueTextCalls("Here are your tables: A, B and C."), []);
    assert.deepEqual(rescueTextCalls(""), []);
  });

  test("rescues a narrated IMPORT_CSV procedure call", () => {
    const got = rescueTextCalls("I'll run CALL IMPORT_CSV('doc-1','MART','PEOPLE','replace');");
    assert.deepEqual(got, [
      { name: "import_csv", args: { docId: "doc-1", schema: "MART", table: "PEOPLE", replace: true } },
    ]);
  });

  test("omits the optional table and replace flag when absent", () => {
    const got = rescueTextCalls("CALL LOAD_CSV('doc-9','MART')");
    assert.deepEqual(got, [{ name: "import_csv", args: { docId: "doc-9", schema: "MART" } }]);
  });

  test("requires both a doc id and a schema", () => {
    assert.deepEqual(rescueTextCalls("CALL IMPORT_CSV('only-one')"), []);
    assert.deepEqual(rescueTextCalls("CALL IMPORT_CSV()"), []);
  });

  test("rescues a narrated dashboard save with a valid spec", () => {
    const spec = { title: "Sales", panels: [{ kind: "bar" }] };
    const got = rescueTextCalls(`CALL DASHBOARD_SAVE('${JSON.stringify(spec)}')`);
    assert.deepEqual(got, [{ name: "dashboard_save", args: { dashboard: spec } }]);
  });

  test("ignores a dashboard call whose payload is not a valid spec", () => {
    assert.deepEqual(rescueTextCalls("CALL DASHBOARD_SAVE('not json')"), []);
    // Missing panels.
    assert.deepEqual(rescueTextCalls(`CALL DASHBOARD_SAVE('{"title":"X"}')`), []);
    // Empty panels array is not a dashboard.
    assert.deepEqual(rescueTextCalls(`CALL DASHBOARD_SAVE('{"title":"X","panels":[]}')`), []);
  });

  test("rescues a narrated dashboard list", () => {
    assert.deepEqual(rescueTextCalls("CALL DASHBOARD_LIST()"), [{ name: "dashboard_list", args: {} }]);
  });

  test("finds a bare dashboard spec the model printed instead of saving", () => {
    const text = 'Here is your dashboard:\n```json\n{"title":"Rev","panels":[{"kind":"line"}]}\n```';
    assert.deepEqual(rescueTextCalls(text), [
      { name: "dashboard_save", args: { dashboard: { title: "Rev", panels: [{ kind: "line" }] } } },
    ]);
  });

  test("unwraps a {dashboard:{...}} envelope", () => {
    const text = '{"dashboard":{"title":"Rev","panels":[{"k":1}]}}';
    assert.deepEqual(rescueTextCalls(text), [
      { name: "dashboard_save", args: { dashboard: { title: "Rev", panels: [{ k: 1 }] } } },
    ]);
  });

  test("does not add a bare spec when an explicit save was already rescued", () => {
    const spec = { title: "S", panels: [{ k: 1 }] };
    const got = rescueTextCalls(`CALL DASHBOARD_SAVE('${JSON.stringify(spec)}') ${JSON.stringify(spec)}`);
    assert.equal(got.filter((c) => c.name === "dashboard_save").length, 1);
  });

  test("deduplicates identical rescued calls", () => {
    const one = "CALL IMPORT_CSV('d','S','T')";
    assert.equal(rescueTextCalls(`${one} ${one} ${one}`).length, 1);
  });

  test("caps the number of rescued calls", () => {
    const many = Array.from({ length: 12 }, (_, i) => `CALL IMPORT_CSV('d${i}','S','T')`).join(" ");
    assert.ok(rescueTextCalls(many).length <= 6);
  });

  test("ignores a CALL to something it does not recognize", () => {
    assert.deepEqual(rescueTextCalls("CALL SOME_RANDOM_PROC('a','b')"), []);
  });

  test("handles panels text that is not part of any valid JSON", () => {
    assert.deepEqual(rescueTextCalls('the word "panels" appears but there is no object'), []);
  });
});
