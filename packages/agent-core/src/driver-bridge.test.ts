import { test } from "node:test";
import assert from "node:assert/strict";

process.env.EXA_DRIVER_BRIDGE_TEST = "1"; // importing must not block on stdin
const { toRows } = await import("./driver-bridge.ts");

test("column-major protocol data becomes rows", () => {
  // Exasol returns data[column][row]; the grid wants row-major.
  const data = [
    [1, 2, 3],
    ["a", "b", "c"],
  ];
  assert.deepEqual(toRows(data, 2, 3), [
    [1, "a"],
    [2, "b"],
    [3, "c"],
  ]);
});

test("takes only the rows present in this message", () => {
  const data = [[1, 2, 3], ["a", "b", "c"]];
  assert.deepEqual(toRows(data, 2, 2), [[1, "a"], [2, "b"]]);
  assert.deepEqual(toRows(data, 2, 0), []);
});

test("missing cells and missing data become NULL, never undefined", () => {
  assert.deepEqual(toRows(undefined, 2, 1), [[null, null]]);
  // a short column (protocol shouldn't, but never emit undefined into JSON)
  assert.deepEqual(toRows([[1], []], 2, 1), [[1, null]]);
  assert.deepEqual(toRows([[null], ["x"]], 2, 1), [[null, "x"]]);
});

test("protocol errors are plain objects — never render as [object Object]", async () => {
  const { errorText } = await import("./driver-bridge.ts");
  // what the driver actually rejects with
  assert.equal(errorText({ sqlCode: "42000", text: "object T not found" }), "42000: object T not found");
  assert.equal(errorText({ message: "Invalid credentials" }), "Invalid credentials");
  assert.equal(errorText(new Error("boom")), "boom");
  assert.equal(errorText("plain string"), "plain string");
  // no recognizable field: keep the payload rather than losing it
  assert.equal(errorText({ weird: 1 }), '{"weird":1}');
  assert.ok(!errorText({ weird: 1 }).includes("[object Object]"));
});

test("a failed statement is an ERROR, never a silent 0-row success", async () => {
  const { mapRawResult } = await import("./driver-bridge.ts");
  // live run caught this: SELECT on a missing table reported rowCount 0, ok
  const rejected = mapRawResult(
    { status: "error", exception: { sqlCode: "42000", text: "object T not found" }, responseData: undefined },
    100,
  );
  assert.equal(rejected.error, "42000: object T not found");
  assert.equal(rejected.rowCount, 0);
  // an exception without an error status still counts
  assert.ok(mapRawResult({ status: "ok", exception: { text: "boom" } }, 100).error);
  // no response / no results at all is an error, not success
  assert.match(mapRawResult(undefined, 100).error ?? "", /no response/);
  assert.match(mapRawResult({ status: "ok", responseData: { results: [] } }, 100).error ?? "", /no result/);
});

test("row counts and result sets map from the protocol's own discrimination", async () => {
  const { mapRawResult } = await import("./driver-bridge.ts");
  const counted = mapRawResult({ status: "ok", responseData: { results: [{ resultType: "rowCount", rowCount: 3 }] } }, 100);
  assert.deepEqual([counted.kind, counted.rowCount, counted.error], ["rowCount", 3, null]);

  const set = mapRawResult(
    { status: "ok", responseData: { results: [{ resultType: "resultSet", resultSet: {
      columns: [{ name: "A", dataType: { type: "DECIMAL" } }, { name: "B", dataType: { type: "VARCHAR" } }],
      data: [[1, 2], ["x", "y"]], numColumns: 2, numRows: 5, numRowsInMessage: 2,
    } }] } },
    100,
  );
  assert.equal(set.kind, "resultSet");
  assert.deepEqual(set.columns, [{ name: "A", typeName: "DECIMAL" }, { name: "B", typeName: "VARCHAR" }]);
  assert.deepEqual(set.rows, [[1, "x"], [2, "y"]]);
  // 5 rows exist but only 2 arrived — truncation must be reported
  assert.equal(set.truncated, true);
});
