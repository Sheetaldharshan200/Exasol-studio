import assert from "node:assert/strict";
import { test } from "node:test";
import {
  arrowsOf,
  byId,
  compileSql,
  lineage,
  overlaps,
  compilePagedSql,
  dependantsOf,
  replaceIdentifier,
  upstreamOf,
  placeBox,
  rowsBehindSql,
  seedSql,
  sqlLiteral,
  suggestViz,
  type Box,
  type CanvasDoc,
  GAP,
  SIZES,
} from "./model.ts";

const conn = { profileId: "p1", connectionName: "Local" };
const table = (id: string, x = 0, y = 0): Box => ({ id, kind: "table", ...conn, schema: "RETAIL", table: `T_${id.toUpperCase()}`, rect: { x, y, ...SIZES.table } });
const query = (id: string, sources: string[], sql: string, extra: Partial<Extract<Box, { kind: "query" }>> = {}): Box => ({
  id,
  kind: "query",
  ...conn,
  name: `Q ${id}`,
  sql,
  sources,
  rect: { x: 0, y: 0, ...SIZES.query },
  ...extra,
});
const chart = (id: string, source: string): Box => ({ id, kind: "chart", ...conn, name: `Chart ${id}`, source, chart: "bar", viz: { xField: "REGION", yFields: ["REVENUE"] }, rect: { x: 0, y: 0, ...SIZES.chart } });

test("a step on one table reads it directly; a step on a step becomes a CTE chain in dependency order", () => {
  const doc: CanvasDoc = {
    version: 1,
    boxes: [
      table("a"),
      query("q1", ["a"], "SELECT region, SUM(amount) AS revenue FROM derived_table GROUP BY region"),
      query("q2", ["q1"], "SELECT * FROM derived_table WHERE revenue > 10;"),
      chart("c", "q2"),
    ],
  };
  const boxes = byId(doc);
  assert.equal(compileSql(boxes.get("q1")!, boxes), 'SELECT region, SUM(amount) AS revenue FROM "RETAIL"."T_A" GROUP BY region');
  const q2 = compileSql(boxes.get("q2")!, boxes);
  assert.equal(q2, 'WITH cte_q1 AS (\nSELECT region, SUM(amount) AS revenue FROM "RETAIL"."T_A" GROUP BY region\n)\nSELECT * FROM cte_q1 WHERE revenue > 10');
  assert.equal(compileSql(boxes.get("c")!, boxes), q2, "a chart compiles to the rows it draws");
});

test("several sources are source_1, source_2; a missing source and a cycle are named errors", () => {
  const doc: CanvasDoc = {
    version: 1,
    boxes: [table("a"), table("b"), query("j", ["a", "b"], "SELECT * FROM source_1 JOIN source_2 ON source_1.id = source_2.id")],
  };
  const boxes = byId(doc);
  assert.equal(
    compileSql(boxes.get("j")!, boxes),
    'SELECT * FROM "RETAIL"."T_A" JOIN "RETAIL"."T_B" ON "RETAIL"."T_A".id = "RETAIL"."T_B".id',
  );
  const gone = byId({ version: 1, boxes: [query("q", ["nope"], "SELECT * FROM derived_table")] });
  assert.throws(() => compileSql(gone.get("q")!, gone), /Source 1 of "Q q" is gone/);
  const loop = byId({ version: 1, boxes: [query("x", ["y"], "SELECT * FROM derived_table"), query("y", ["x"], "SELECT * FROM derived_table")] });
  assert.throws(() => compileSql(loop.get("x")!, loop), /built on itself/);
  assert.equal(seedSql(1), "SELECT * FROM derived_table");
  assert.match(seedSql(2), /source_1[\s\S]*source_2/);
});

test("placeholders are replaced only where they are identifiers", () => {
  const sql = `SELECT 'derived_table' AS label, "derived_table", x -- derived_table here\nFROM derived_table /* derived_table */ JOIN Derived_Table d ON d.id = derived_table_id`;
  assert.equal(
    replaceIdentifier(sql, "derived_table", "T"),
    `SELECT 'derived_table' AS label, "derived_table", x -- derived_table here\nFROM T /* derived_table */ JOIN T d ON d.id = derived_table_id`,
  );
  assert.equal(replaceIdentifier("select * from source_1 where s='it''s source_1'", "source_1", "A"), "select * from A where s='it''s source_1'");
});

test("the rows behind a chart of a TABLE read the table; sources on two connections are refused", () => {
  const doc: CanvasDoc = {
    version: 1,
    boxes: [table("a"), chart("c", "a"), query("r", ["c"], 'SELECT * FROM derived_table WHERE "REGION" IN (\'EMEA\')', { rowsBehind: true })],
  };
  const boxes = byId(doc);
  assert.equal(compileSql(boxes.get("r")!, boxes), `SELECT * FROM "RETAIL"."T_A" WHERE "REGION" IN ('EMEA')`);
  const other: Box = { ...table("b"), profileId: "p2", connectionName: "Other" };
  const mixed = byId({ version: 1, boxes: [table("a"), other, query("j", ["a", "b"], "SELECT * FROM source_1, source_2")] });
  assert.throws(() => compileSql(mixed.get("j")!, mixed), /another connection/);
});

test("arrows are derived from sources and carry their kind", () => {
  const doc: CanvasDoc = { version: 1, boxes: [table("a"), query("q", ["a"], "x"), chart("c", "q"), query("r", ["c"], "x", { rowsBehind: true }), query("dangling", ["zzz"], "x")] };
  assert.deepEqual(
    arrowsOf(doc).map((a) => [a.from, a.to, a.kind]),
    [
      ["a", "q", "sql"],
      ["q", "c", "chart"],
      ["c", "r", "rows"],
    ],
  );
});

test("dependants are everything built on a box, nearest first", () => {
  const doc: CanvasDoc = { version: 1, boxes: [table("a"), query("q", ["a"], "x"), chart("c", "q"), query("r", ["c"], "x", { rowsBehind: true }), table("b")] };
  assert.deepEqual(dependantsOf(doc, "a"), ["q", "c", "r"]);
  assert.deepEqual(dependantsOf(doc, "c"), ["r"]);
  assert.deepEqual(dependantsOf(doc, "b"), []);
  assert.deepEqual([...upstreamOf(doc, "r")].sort(), ["a", "c", "q", "r"], "the trail behind a box, itself included");
  assert.deepEqual([...upstreamOf(doc, "b")], ["b"]);
});

test("lineage runs from the roots to the box, each step once", () => {
  const doc: CanvasDoc = { version: 1, boxes: [table("a"), query("q", ["a"], "SELECT 1 FROM derived_table"), chart("c", "q")] };
  const steps = lineage("c", byId(doc));
  assert.deepEqual(steps.map((s) => s.kind), ["table", "query", "chart"]);
  assert.deepEqual(steps[2], { kind: "chart", label: "Chart c", chart: "bar", by: "REGION", measures: ["REVENUE"] });
});

test("placement: flush right of the anchor, then below, then further right; explorer opens fill in reading order", () => {
  const a = table("a", 100, 100);
  const right = placeBox([a], SIZES.query, { anchor: a.rect });
  assert.deepEqual(right, { x: 100 + SIZES.table.w + GAP, y: 100 });
  const taken: Box = { ...query("q", ["a"], "x"), rect: { ...right, ...SIZES.query } };
  const below = placeBox([a, taken], SIZES.chart, { anchor: a.rect });
  assert.deepEqual(below, { x: 100, y: 100 + SIZES.table.h + GAP });
  const viewport = { x: 0, y: 0, w: 2000, h: 1000 };
  const first = placeBox([], SIZES.table, { viewport });
  assert.deepEqual(first, { x: GAP, y: GAP });
  const second = placeBox([{ ...a, rect: { ...first, ...SIZES.table } }], SIZES.table, { viewport });
  assert.deepEqual(second, { x: GAP + SIZES.table.w + GAP, y: GAP });
  assert.ok(!overlaps({ ...first, ...SIZES.table }, { ...second, ...SIZES.table }));
});

test("rows behind a selection: IN for values, IS NULL for a null pick, literals escaped", () => {
  assert.equal(rowsBehindSql("region", ["EMEA", "O'Brien"]), `SELECT * FROM derived_table\nWHERE "region" IN ('EMEA', 'O''Brien')`);
  assert.equal(rowsBehindSql("n", [1, null]), `SELECT * FROM derived_table\nWHERE "n" IN (1) OR "n" IS NULL`);
  assert.equal(rowsBehindSql("n", []), `SELECT * FROM derived_table\nWHERE FALSE`);
  assert.equal(sqlLiteral(true), "TRUE");
});

test("a page of rows: a table read takes LIMIT directly; a step is wrapped so its own ORDER BY / LIMIT stay intact", () => {
  const doc: CanvasDoc = {
    version: 1,
    boxes: [table("a"), query("q1", ["a"], "SELECT * FROM derived_table ORDER BY id LIMIT 10"), query("q2", ["q1"], "SELECT COUNT(*) AS n FROM derived_table")],
  };
  const boxes = byId(doc);
  assert.equal(compilePagedSql(boxes.get("a")!, boxes, 500, 0), 'SELECT * FROM "RETAIL"."T_A"\nLIMIT 500');
  assert.equal(compilePagedSql(boxes.get("a")!, boxes, 500, 1000), 'SELECT * FROM "RETAIL"."T_A"\nLIMIT 500 OFFSET 1000');
  assert.equal(
    compilePagedSql(boxes.get("q1")!, boxes, 500, 0),
    'SELECT * FROM (\nSELECT * FROM "RETAIL"."T_A" ORDER BY id LIMIT 10\n) AS step_rows\nLIMIT 500',
  );
  assert.equal(
    compilePagedSql(boxes.get("q2")!, boxes, 500, 500),
    'WITH cte_q1 AS (\nSELECT * FROM "RETAIL"."T_A" ORDER BY id LIMIT 10\n)\nSELECT * FROM (\nSELECT COUNT(*) AS n FROM cte_q1\n) AS step_rows\nLIMIT 500 OFFSET 500',
  );
});

test("a first chart uses the first text column as the axis and the numeric columns as measures", () => {
  const cols = [
    { name: "REGION", typeName: "VARCHAR(20) UTF8" },
    { name: "REVENUE", typeName: "DECIMAL(18,2)" },
    { name: "ORDERS", typeName: "DECIMAL(18,0)" },
    { name: "NOTE", typeName: "VARCHAR(200)" },
  ];
  assert.deepEqual(suggestViz(cols), { chart: "bar", viz: { xField: "REGION", yFields: ["REVENUE", "ORDERS"] } });
  assert.deepEqual(suggestViz([{ name: "A", typeName: "DOUBLE" }, { name: "B", typeName: "DOUBLE" }]), { chart: "bar", viz: { xField: "A", yFields: ["B"] } });
});
