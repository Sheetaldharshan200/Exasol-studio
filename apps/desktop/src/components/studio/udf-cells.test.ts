import assert from "node:assert/strict";
import { test } from "node:test";
import { udfCellsKey, udfCellsOf, type UdfCell } from "./udf-cells.ts";

/** Line numbers the way Monaco counts them: 1-based, from the offset. */
const lineOf = (sql: string) => (offset: number) => sql.slice(0, offset).split("\n").length;

const BLOCK = `SELECT 1;
--/
CREATE OR REPLACE LUA SCALAR SCRIPT MY_UDF (a DOUBLE)
RETURNS DOUBLE AS
function run(ctx)
    return ctx.a
end
/
`;

test("a closed block yields one cell, at its opening line", () => {
  const cells = udfCellsOf(BLOCK, lineOf(BLOCK));
  assert.equal(cells.length, 1);
  assert.equal(cells[0].line, 2, "the --/ line");
  assert.equal(cells[0].language, "LUA");
  assert.equal(cells[0].name, "MY_UDF");
  assert.equal(cells[0].kind, "SCALAR");
});

test("a block still being typed has no cell yet", () => {
  const open = "--/\nCREATE OR REPLACE LUA SCALAR SCRIPT F(";
  assert.deepEqual(udfCellsOf(open, lineOf(open)), []);
});

test("a buffer with no block asks for no cells", () => {
  assert.deepEqual(udfCellsOf("SELECT 1;", lineOf("SELECT 1;")), []);
});

test("two blocks yield two cells in order", () => {
  const two = `${BLOCK}\n--/\nCREATE PYTHON3 SET SCRIPT AGG(a INT) EMITS (b INT) AS\nx\n/\n`;
  const cells = udfCellsOf(two, lineOf(two));
  assert.equal(cells.length, 2);
  assert.deepEqual(cells.map((c) => c.language), ["LUA", "PYTHON3"]);
  assert.ok(cells[1].line > cells[0].line);
});

test("the key changes only when a cell would look different", () => {
  const a: UdfCell[] = [{ line: 2, language: "LUA", name: "F", kind: "SCALAR" }];
  const same: UdfCell[] = [{ line: 2, language: "LUA", name: "F", kind: "SCALAR" }];
  assert.equal(udfCellsKey(a), udfCellsKey(same), "identical cells must not rebuild the zones");
  assert.notEqual(udfCellsKey(a), udfCellsKey([{ ...a[0], line: 3 }]));
  assert.notEqual(udfCellsKey(a), udfCellsKey([{ ...a[0], name: "G" }]));
  assert.notEqual(udfCellsKey(a), udfCellsKey([]));
});
