import assert from "node:assert/strict";
import { test } from "node:test";
import { picksFrom, selectionValues } from "./selection.ts";

const result = {
  statement: "",
  kind: "resultSet" as const,
  columns: [
    { name: "REGION", typeName: "VARCHAR(10)" },
    { name: "REVENUE", typeName: "DECIMAL(18,2)" },
  ],
  rows: [
    ["EMEA", 10],
    ["APAC", 20],
    ["AMER", 30],
  ],
  rowCount: 3,
  truncated: false,
  elapsedMs: 1,
  error: null,
};

test("a selection reads the by-column case-insensitively and takes the drawn name where the series has one", () => {
  assert.deepEqual(selectionValues(result, "region", [{ dataIndex: 0 }, { dataIndex: 2 }]), { field: "REGION", values: ["EMEA", "AMER"] });
  assert.deepEqual(selectionValues(result, undefined, [{ dataIndex: 1 }]), { field: "REGION", values: ["APAC"] }, "no by-field means the first column");
  assert.deepEqual(selectionValues(result, "REGION", [{ dataIndex: 0, name: "AMER" }]), { field: "REGION", values: ["AMER"] }, "a sorted pie/funnel index points elsewhere; its name is the truth");
  assert.equal(selectionValues(result, "NOPE", [{ dataIndex: 0 }]), null);
  assert.deepEqual(selectionValues(result, "REGION", [{ dataIndex: 0 }, { dataIndex: 0 }])?.values, ["EMEA"], "one value once");
  const withNull = { ...result, rows: [...result.rows, [null, 5]] };
  assert.deepEqual(selectionValues(withNull, "REGION", [{ dataIndex: 0, name: "" }])?.values, [null], "a NULL slice is drawn as '' and filters as NULL");
});

test("picks carry names only from series whose data items have them", () => {
  const named = [{ name: "AMER", value: 30 }, { name: "APAC", value: 20 }];
  assert.deepEqual(picksFrom([{ seriesIndex: 0, dataIndex: [1] }], [named]), [{ dataIndex: 1, name: "APAC" }]);
  assert.deepEqual(picksFrom([{ seriesIndex: 0, dataIndex: [2] }], [undefined]), [{ dataIndex: 2 }], "dataset-backed bars have no data items");
  assert.deepEqual(picksFrom([{ seriesIndex: 1, dataIndex: [0] }], [named, [[1, 2]]]), [{ dataIndex: 0 }]);
  assert.deepEqual(picksFrom([{ seriesIndex: 0, dataIndex: [1] }], [named], "gauge"), [{ dataIndex: 1 }], "only sorted named kinds read by name");
});
