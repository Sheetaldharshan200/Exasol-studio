import assert from "node:assert/strict";
import { test } from "node:test";
import { ddlExtrasSql, tableDdl, tableExtrasFromRows, viewDdl } from "./ddl.ts";

const cols = [
  { name: "ID", dataType: "DECIMAL(18,0)", nullable: false, isDistributionKey: true, comment: "Meter id" },
  { name: "Day", dataType: "DATE", nullable: true, default: "CURRENT_DATE", comment: null },
  { name: "V", dataType: "VARCHAR(10) UTF8", comment: "it's" },
];
const cons = [
  { name: "PK_T", constraintType: "PRIMARY KEY", columns: [{ column: "ID", referencedSchema: null, referencedTable: null, referencedColumn: null }] },
  { name: "FK_X", constraintType: "FOREIGN KEY", columns: [{ column: "V", referencedSchema: "S", referencedTable: "X", referencedColumn: "C" }] },
] as never;

test("a table's DDL has keys, distribution, partition and comments", () => {
  assert.equal(
    tableDdl("S", "T", cols, cons, { comment: "Meters", partitionBy: ["Day"] }),
    [
      'CREATE TABLE "S"."T" (',
      `  "ID" DECIMAL(18,0) NOT NULL COMMENT IS 'Meter id',`,
      '  "Day" DATE DEFAULT CURRENT_DATE,',
      `  "V" VARCHAR(10) UTF8 COMMENT IS 'it''s',`,
      '  CONSTRAINT "PK_T" PRIMARY KEY ("ID"),',
      '  CONSTRAINT "FK_X" FOREIGN KEY ("V") REFERENCES "S"."X" ("C"),',
      '  DISTRIBUTE BY "ID",',
      '  PARTITION BY "Day"',
      ") COMMENT IS 'Meters';",
    ].join("\n"),
  );
});

test("without extras: no partition and no table comment", () => {
  assert.equal(tableDdl(undefined, 'a"b', [cols[1]], []), 'CREATE TABLE "a""b" (\n  "Day" DATE DEFAULT CURRENT_DATE\n);');
});

test("a view's DDL is its own text", () => {
  assert.equal(viewDdl("S", "V", "CREATE VIEW S.V AS SELECT 1 FROM DUAL;"), "CREATE VIEW S.V AS SELECT 1 FROM DUAL;");
  assert.equal(viewDdl("S", "V", "SELECT 1 FROM DUAL"), 'CREATE OR REPLACE VIEW "S"."V" AS\nSELECT 1 FROM DUAL;');
  assert.match(viewDdl("S", "V", null), /not available/);
});

test("the extras query escapes names; rows become extras in key order", () => {
  assert.match(ddlExtrasSql("table", "S", "it's"), /TABLE_NAME = 'it''s'/);
  assert.equal(ddlExtrasSql("view", "S", "V"), "SELECT VIEW_TEXT FROM SYS.EXA_ALL_VIEWS WHERE VIEW_SCHEMA = 'S' AND VIEW_NAME = 'V'");
  assert.deepEqual(tableExtrasFromRows([["P", "B", 2], ["C", "Hi", null], ["P", "A", 1]]), { comment: "Hi", partitionBy: ["A", "B"] });
  assert.deepEqual(tableExtrasFromRows([["C", null, null]]), { comment: null, partitionBy: [] });
  assert.deepEqual(tableExtrasFromRows([]), { comment: null, partitionBy: [] });
});
