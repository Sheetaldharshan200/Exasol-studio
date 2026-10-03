import assert from "node:assert/strict";
import { test } from "node:test";
import { NAMES_CAP, catalogFromNames, changesCatalog, columnsSql, schemasToLoad, withSchemaColumns } from "./sql-catalog.ts";

test("names load complete, with no columns yet", () => {
  const c = catalogFromNames([["RETAIL", "ORDERS"], ["RETAIL", "Line Items"], ["HR", "STAFF"]], [["RETAIL", "CLEAN", "LUA"]]);
  assert.equal(c.complete, true);
  assert.deepEqual([...c.schemas.get("RETAIL")!.keys()], ["ORDERS", "Line Items"]);
  assert.deepEqual(c.schemas.get("HR")!.get("STAFF"), []);
  assert.deepEqual(c.scripts, [{ schema: "RETAIL", name: "CLEAN", type: "LUA" }]);
  assert.equal(c.loaded!.size, 0);
});

test("past the cap the catalog says it is incomplete", () => {
  const rows = Array.from({ length: NAMES_CAP + 1 }, (_, i) => ["S", `T${i}`]);
  const c = catalogFromNames(rows, []);
  assert.equal(c.complete, false);
  assert.equal(c.schemas.get("S")!.size, NAMES_CAP);
});

test("a schema's columns fill in without touching the rest", () => {
  const c = catalogFromNames([["RETAIL", "ORDERS"], ["HR", "STAFF"]], []);
  const d = withSchemaColumns(c, "RETAIL", [["ORDERS", "ID", "DECIMAL(18,0)"], ["ORDERS", "AMOUNT", "DOUBLE"]]);
  assert.deepEqual(d.schemas.get("RETAIL")!.get("ORDERS")!.map((x) => x.name), ["ID", "AMOUNT"]);
  assert.deepEqual(d.schemas.get("HR")!.get("STAFF"), []);
  assert.ok(d.loaded!.has("RETAIL"));
  assert.deepEqual(c.schemas.get("RETAIL")!.get("ORDERS"), [], "the old catalog is not changed");
});

test("completion loads only the schemas its tables are in", () => {
  const c = catalogFromNames([["RETAIL", "ORDERS"], ["HR", "ORDERS"], ["HR", "STAFF"], ["X", "Y"]], []);
  assert.deepEqual(schemasToLoad(c, [{ schema: "retail", table: "ORDERS" }]), ["RETAIL"]);
  assert.deepEqual(schemasToLoad(c, [{ schema: "", table: "orders" }]).sort(), ["HR", "RETAIL"]);
  assert.deepEqual(schemasToLoad(withSchemaColumns(c, "RETAIL", []), [{ schema: "RETAIL", table: "ORDERS" }]), [], "already loaded");
  assert.deepEqual(schemasToLoad(c, [{ schema: "NOPE", table: "T" }]), []);
});

test("only statements that change structure reload the catalog", () => {
  assert.equal(changesCatalog("SELECT * FROM t"), false);
  assert.equal(changesCatalog("INSERT INTO t VALUES (1); UPDATE t SET a = 2"), false);
  assert.equal(changesCatalog("SELECT 1; CREATE TABLE x (a INT)"), true);
  assert.equal(changesCatalog("-- note\nDROP VIEW v"), true);
  assert.equal(changesCatalog("ALTER TABLE t ADD c INT"), true);
  assert.equal(changesCatalog("EXECUTE SCRIPT s.build()"), true);
  assert.equal(changesCatalog("SELECT 'CREATE TABLE x'"), false);
});

test("a schema name is escaped in the columns query", () => {
  assert.match(columnsSql("O'Brien"), /COLUMN_SCHEMA = 'O''Brien'/);
});
