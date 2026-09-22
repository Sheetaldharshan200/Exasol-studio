import test from "node:test";
import assert from "node:assert/strict";
import { GROUP_HEADER, GROUP_PAD, layoutSchemas, mergeSchemaGraphs, splitColKey, splitTableId, tableId, whereSchemas } from "./connection-graph.ts";

const T = (name: string, n = 2) => ({ name, columns: Array.from({ length: n }, (_, i) => ({ name: `C${i}`, dataType: "INT", pk: i === 0 })) });

test("keys: the last dot separates the column, the first the schema", () => {
  assert.deepEqual(splitColKey("RETAIL.CUSTOMERS.ID"), { table: "RETAIL.CUSTOMERS", column: "ID" });
  assert.deepEqual(splitColKey("MYSQL_VS.sales.customer_id"), { table: "MYSQL_VS.sales", column: "customer_id" });
  assert.deepEqual(splitTableId("RETAIL.CUSTOMERS"), { schema: "RETAIL", table: "CUSTOMERS" });
  assert.equal(tableId("A", "B"), "A.B");
});

test("merging per-schema graphs qualifies tables and their links with the schema", () => {
  const g = mergeSchemaGraphs([
    { schema: "PG", graph: { tables: [T("CUSTOMERS"), T("ORDERS")], links: [{ source: "ORDERS", sourceColumn: "C0", target: "CUSTOMERS", targetColumn: "C0" }] } },
    { schema: "MY", graph: { tables: [T("sales")], links: [] } },
  ]);
  assert.deepEqual(g.tables.map((t) => t.id), ["PG.CUSTOMERS", "PG.ORDERS", "MY.sales"]);
  assert.equal(g.tables[2].schema, "MY");
  assert.deepEqual(g.links, [{ source: "PG.ORDERS", sourceColumn: "C0", target: "PG.CUSTOMERS", targetColumn: "C0" }]);
  const cross = mergeSchemaGraphs([{ schema: "SALES", graph: { tables: [T("ORDERS")], links: [{ source: "ORDERS", sourceColumn: "C0", target: "CUSTOMERS", targetColumn: "C0", targetSchema: "CRM" }] } }]);
  assert.deepEqual(cross.links, [{ source: "SALES.ORDERS", sourceColumn: "C0", target: "CRM.CUSTOMERS", targetColumn: "C0" }], "a declared cross-schema FK keeps its real target schema");
});

test("layout: tables sit inside their box with header and padding; boxes go left to right and wrap", () => {
  const h = (t: { columns: unknown[] }) => 30 + t.columns.length * 10;
  const mk = (schema: string, n: number) => ({ schema, tables: Array.from({ length: n }, (_, i) => ({ ...T(`T${i}`), id: `${schema}.T${i}`, schema })) });
  const L = layoutSchemas([mk("A", 1), mk("B", 4), mk("C", 1), mk("D", 1)], 200, h, { perRow: 3, gapX: 20, gapY: 10, groupGap: 50 });
  assert.equal(L.groups.length, 4);
  assert.deepEqual(L.groups[0].box, { x: 0, y: 0, width: 260, height: GROUP_HEADER + GROUP_PAD * 2 + 60 });
  // B: 4 tables → 2×2 grid
  assert.equal(L.groups[1].box.width, GROUP_PAD * 2 + 2 * 200 + 20);
  assert.equal(L.groups[1].box.x, L.groups[0].box.width + 50);
  assert.deepEqual(L.tables["B.T3"], { x: GROUP_PAD + 220, y: GROUP_HEADER + GROUP_PAD + 50 + 10 });
  assert.deepEqual(L.absolute["B.T3"], { x: L.groups[1].box.x + GROUP_PAD + 220, y: GROUP_HEADER + GROUP_PAD + 60 });
  // D wraps to the second row, under the first
  assert.equal(L.groups[3].box.x, 0);
  assert.ok(L.groups[3].box.y > 0);
  // every table has a position in both coordinate systems
  assert.equal(Object.keys(L.tables).length, 7);
  assert.equal(Object.keys(L.absolute).length, 7);
});

test("layout of an empty schema still yields a box", () => {
  const L = layoutSchemas([{ schema: "EMPTY", tables: [] }], 200, () => 50);
  assert.equal(L.groups[0].box.width, 260);
  assert.deepEqual(L.tables, {});
});

test("whereSchemas finds every schema a nested WHERE group names, and nothing else", () => {
  const group = { combinator: "and", rules: [
    { field: '"RETAIL"."ORDERS"."AMOUNT"', operator: ">", value: 10 },
    { combinator: "or", rules: [{ field: '"MYSQL_VS"."sales"."qty"', operator: ">", value: 1 }, { field: "no-quotes", operator: "=", value: 1 }] },
  ] };
  assert.deepEqual(whereSchemas(group).sort(), ["MYSQL_VS", "RETAIL"]);
  assert.deepEqual(whereSchemas({ rules: [] }), []);
});
