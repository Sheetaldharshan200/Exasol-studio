/**
 * Edge-case tests for the CSV/Parquet ingestion pipeline.
 *
 * This is the code path that turns an arbitrary user file into DDL and INSERT
 * statements, so its failure modes are data corruption and SQL injection, not
 * cosmetic bugs. Covers the cases CLAUDE.md calls out: empty input, nulls,
 * boundaries, Exasol identifier case-folding, and error paths.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  parseCsv,
  resolveHeader,
  normalizeColumns,
  inferType,
  typeToSql,
  cellToLiteral,
  buildPlan,
  objectsToTable,
  buildInsert,
} from "./csv-import.ts";

describe("parseCsv", () => {
  test("parses a simple comma file", () => {
    const t = parseCsv("a,b\n1,2\n3,4");
    assert.equal(t.delimiter, ",");
    assert.deepEqual(t.header, ["a", "b"]);
    assert.deepEqual(t.rows, [["1", "2"], ["3", "4"]]);
  });

  test("detects semicolon and tab and pipe delimiters", () => {
    assert.equal(parseCsv("a;b\n1;2").delimiter, ";");
    assert.equal(parseCsv("a\tb\n1\t2").delimiter, "\t");
    assert.equal(parseCsv("a|b\n1|2").delimiter, "|");
  });

  test("strips a UTF-8 BOM from the first header cell", () => {
    const t = parseCsv("﻿id,name\n1,x");
    assert.deepEqual(t.header, ["id", "name"]);
  });

  test("keeps delimiters that appear inside quoted fields", () => {
    const t = parseCsv('a,b\n"x,y",z');
    assert.deepEqual(t.rows, [["x,y", "z"]]);
  });

  test("unescapes doubled quotes inside quoted fields", () => {
    const t = parseCsv('a\n"he said ""hi"""');
    assert.deepEqual(t.rows, [['he said "hi"']]);
  });

  test("keeps newlines inside quoted fields", () => {
    const t = parseCsv('a,b\n"line1\nline2",z');
    assert.deepEqual(t.rows, [["line1\nline2", "z"]]);
  });

  test("handles CRLF line endings", () => {
    const t = parseCsv("a,b\r\n1,2\r\n3,4");
    assert.deepEqual(t.header, ["a", "b"]);
    assert.deepEqual(t.rows, [["1", "2"], ["3", "4"]]);
  });

  test("skips fully empty lines", () => {
    const t = parseCsv("a,b\n1,2\n\n3,4\n");
    assert.deepEqual(t.rows, [["1", "2"], ["3", "4"]]);
  });

  test("trims whitespace from header cells only", () => {
    const t = parseCsv(" a , b \n 1 , 2 ");
    assert.deepEqual(t.header, ["a", "b"]);
    assert.deepEqual(t.rows, [[" 1 ", " 2 "]]);
  });

  test("handles empty input without throwing", () => {
    const t = parseCsv("");
    assert.deepEqual(t.header, []);
    assert.deepEqual(t.rows, []);
  });

  test("handles a header-only file", () => {
    const t = parseCsv("a,b,c");
    assert.deepEqual(t.header, ["a", "b", "c"]);
    assert.deepEqual(t.rows, []);
  });

  test("preserves empty trailing fields", () => {
    const t = parseCsv("a,b,c\n1,,3");
    assert.deepEqual(t.rows, [["1", "", "3"]]);
  });
});

describe("resolveHeader", () => {
  test("keeps a real header row", () => {
    const got = resolveHeader({ delimiter: ",", header: ["id", "name"], rows: [["1", "x"]] });
    assert.deepEqual(got.header, ["id", "name"]);
    assert.equal(got.rows.length, 1);
  });

  test("synthesizes COL_n when the first row is numeric data", () => {
    const got = resolveHeader({ delimiter: ",", header: ["1", "2"], rows: [["3", "4"]] });
    assert.deepEqual(got.header, ["COL_1", "COL_2"]);
    // The misread row must be given back as data, not dropped.
    assert.deepEqual(got.rows, [["1", "2"], ["3", "4"]]);
  });

  test("synthesizes when the first row has duplicate labels", () => {
    const got = resolveHeader({ delimiter: ",", header: ["x", "x"], rows: [["1", "2"]] });
    assert.deepEqual(got.header, ["COL_1", "COL_2"]);
  });

  test("synthesizes when the first row is mostly blank", () => {
    const got = resolveHeader({ delimiter: ",", header: ["a", "", "", ""], rows: [["1", "2", "3", "4"]] });
    assert.deepEqual(got.header, ["COL_1", "COL_2", "COL_3", "COL_4"]);
  });

  test("handles an empty table", () => {
    const got = resolveHeader({ delimiter: ",", header: [], rows: [] });
    assert.deepEqual(got.header, ["COL_1"]);
  });
});

describe("normalizeColumns — Exasol identifier folding", () => {
  test("upper-cases unquoted names, as Exasol would", () => {
    assert.deepEqual(normalizeColumns(["id", "Name", "eMail"]), ["ID", "NAME", "EMAIL"]);
  });

  test("replaces illegal characters with underscores", () => {
    assert.deepEqual(normalizeColumns(["first name", "e-mail", "a.b", "x%y"]), [
      "FIRST_NAME",
      "E_MAIL",
      "A_B",
      "X_Y",
    ]);
  });

  test("trims leading and trailing underscores", () => {
    assert.deepEqual(normalizeColumns(["  spaced  ", "--x--"]), ["SPACED", "X"]);
  });

  test("prefixes names that would start with a digit", () => {
    assert.deepEqual(normalizeColumns(["1st", "2024"]), ["COL_1ST", "COL_2024"]);
  });

  test("names blank columns positionally", () => {
    assert.deepEqual(normalizeColumns(["", "   ", "ok"]), ["COL_1", "COL_2", "OK"]);
  });

  test("dedupes collisions deterministically", () => {
    // Case folding makes these collide — that is the Exasol-specific trap.
    assert.deepEqual(normalizeColumns(["name", "NAME", "Name"]), ["NAME", "NAME_2", "NAME_3"]);
    assert.deepEqual(normalizeColumns(["a b", "a-b"]), ["A_B", "A_B_2"]);
  });

  test("handles an empty header list", () => {
    assert.deepEqual(normalizeColumns([]), []);
  });
});

describe("inferType", () => {
  test("empty or all-blank columns fall back to varchar", () => {
    assert.deepEqual(inferType([]), { kind: "varchar", size: 100 });
    assert.deepEqual(inferType(["", "  ", ""]), { kind: "varchar", size: 100 });
  });

  test("detects booleans case-insensitively", () => {
    assert.deepEqual(inferType(["true", "FALSE", "True"]), { kind: "boolean" });
  });

  test("detects dates and timestamps", () => {
    assert.deepEqual(inferType(["2024-01-01", "1999-12-31"]), { kind: "date" });
    assert.deepEqual(inferType(["2024-01-01 10:00:00"]), { kind: "timestamp" });
    assert.deepEqual(inferType(["2024-01-01T10:00:00.123"]), { kind: "timestamp" });
    assert.deepEqual(inferType(["2024-02-29"]), { kind: "date" }); // real leap day
  });

  test("date-SHAPED but calendar-invalid values stay varchar so they survive", () => {
    // Shape-only matching used to infer DATE here, and cellToLiteral then
    // NULLed every value — the column silently emptied.
    assert.equal(inferType(["2024-99-99"]).kind, "varchar");
    assert.equal(inferType(["2024-02-30"]).kind, "varchar");
    assert.equal(inferType(["2023-02-29"]).kind, "varchar"); // not a leap year
    assert.equal(inferType(["2024-13-01"]).kind, "varchar");
    assert.equal(inferType(["2024-01-01 25:00:00"]).kind, "varchar");
    assert.equal(inferType(["2024-01-01 10:61:00"]).kind, "varchar");
  });

  test("sizes integer columns by their widest value", () => {
    assert.deepEqual(inferType(["1", "22", "333"]), { kind: "decimal", precision: 3, scale: 0 });
  });

  test("ignores the minus sign when counting digits", () => {
    assert.deepEqual(inferType(["-1", "-22"]), { kind: "decimal", precision: 2, scale: 0 });
  });

  test("sizes decimals from integer and fractional parts", () => {
    assert.deepEqual(inferType(["1.5", "22.25"]), { kind: "decimal", precision: 4, scale: 2 });
  });

  test("mixes integers and decimals into one decimal type", () => {
    const t = inferType(["1", "2.50"]);
    assert.equal(t.kind, "decimal");
    assert.equal((t as { scale: number }).scale, 2);
  });

  test("caps precision at the Exasol maximum of 36", () => {
    const huge = "9".repeat(40);
    assert.deepEqual(inferType([huge]), { kind: "varchar", size: 60 });
    // 18 digits is the widest INT_RE accepts, so 19+ is treated as text.
    assert.equal(inferType(["1".repeat(19)]).kind, "varchar");
  });

  test("guarantees precision exceeds scale", () => {
    const t = inferType(["0.123456"]) as { precision: number; scale: number };
    assert.ok(t.precision > t.scale, `precision ${t.precision} must exceed scale ${t.scale}`);
  });

  test("a single non-numeric value demotes the whole column to varchar", () => {
    assert.equal(inferType(["1", "2", "n/a"]).kind, "varchar");
    assert.equal(inferType(["2024-01-01", "not a date"]).kind, "varchar");
  });

  test("varchar size has headroom and a floor of 20", () => {
    assert.deepEqual(inferType(["ab"]), { kind: "varchar", size: 20 });
    const t = inferType(["x".repeat(100)]) as { size: number };
    assert.ok(t.size >= 150, `expected headroom, got ${t.size}`);
  });

  test("blank values do not defeat inference of the rest", () => {
    assert.deepEqual(inferType(["1", "", "3"]), { kind: "decimal", precision: 1, scale: 0 });
  });

  test("does not overflow the stack on very large columns", () => {
    // Regression guard for the documented Math.max(...spread) crash.
    const many = Array.from({ length: 200_000 }, (_, i) => String(i));
    assert.equal(inferType(many).kind, "decimal");
  });
});

describe("typeToSql", () => {
  test("renders each type", () => {
    assert.equal(typeToSql({ kind: "decimal", precision: 5, scale: 2 }), "DECIMAL(5,2)");
    assert.equal(typeToSql({ kind: "decimal", precision: 5, scale: 0 }), "DECIMAL(5,0)");
    assert.equal(typeToSql({ kind: "date" }), "DATE");
    assert.equal(typeToSql({ kind: "timestamp" }), "TIMESTAMP");
    assert.equal(typeToSql({ kind: "boolean" }), "BOOLEAN");
    assert.equal(typeToSql({ kind: "varchar", size: 42 }), "VARCHAR(42)");
  });
});

describe("cellToLiteral", () => {
  const varchar = { kind: "varchar", size: 10 } as const;

  test("empty and whitespace-only cells become NULL", () => {
    assert.equal(cellToLiteral("", varchar), "NULL");
    assert.equal(cellToLiteral("   ", varchar), "NULL");
  });

  test("escapes single quotes — SQL injection guard", () => {
    assert.equal(cellToLiteral("O'Brien", varchar), "'O''Brien'");
    assert.equal(
      cellToLiteral("'; DROP TABLE X; --", { kind: "varchar", size: 100 }),
      "'''; DROP TABLE X; --'",
    );
  });

  test("emits an over-long value in FULL rather than silently truncating it", () => {
    // Type inference samples at most 500k rows, so a long value beyond the
    // sample WILL exceed its column. Truncating here corrupted data with no
    // error anywhere; now the oversized literal reaches Exasol, which rejects
    // it and the caller's per-row retry reports the offending row.
    assert.equal(cellToLiteral("abcdefghijklmno", varchar), "'abcdefghijklmno'");
  });

  test("renders typed literals with their keyword", () => {
    assert.equal(cellToLiteral("2024-01-01", { kind: "date" }), "DATE '2024-01-01'");
    assert.equal(
      cellToLiteral("2024-01-01T10:00:00", { kind: "timestamp" }),
      "TIMESTAMP '2024-01-01 10:00:00'",
    );
    assert.equal(cellToLiteral("true", { kind: "boolean" }), "TRUE");
    assert.equal(cellToLiteral("123", { kind: "decimal", precision: 3, scale: 0 }), "123");
  });

  test("a calendar-invalid date is NULL rather than a value Exasol would reject", () => {
    assert.equal(cellToLiteral("2024-99-99", { kind: "date" }), "NULL");
    assert.equal(cellToLiteral("2023-02-29", { kind: "date" }), "NULL");
    assert.equal(cellToLiteral("2024-01-01 25:00:00", { kind: "timestamp" }), "NULL");
    // Real ones still render.
    assert.equal(cellToLiteral("2024-02-29", { kind: "date" }), "DATE '2024-02-29'");
  });

  test("a value that does not fit its inferred type becomes NULL, never invalid SQL", () => {
    assert.equal(cellToLiteral("abc", { kind: "decimal", precision: 3, scale: 0 }), "NULL");
    assert.equal(cellToLiteral("nope", { kind: "date" }), "NULL");
    assert.equal(cellToLiteral("maybe", { kind: "boolean" }), "NULL");
    // Critically: the bad value must not leak into the statement.
    assert.ok(!cellToLiteral("'; DROP", { kind: "decimal", precision: 3, scale: 0 }).includes("DROP"));
  });
});

describe("buildPlan", () => {
  const csv = { delimiter: ",", header: ["id", "name"], rows: [["1", "ann"], ["2", "bob"]] };

  test("upper-cases schema and table and quotes identifiers", () => {
    const p = buildPlan(csv, "mart", "people");
    assert.equal(p.schema, "MART");
    assert.equal(p.table, "PEOPLE");
    assert.match(p.createTableSql, /"MART"\."PEOPLE"/);
    assert.equal(p.createSchemaSql, 'CREATE SCHEMA IF NOT EXISTS "MART"');
  });

  test("emits a DROP only when replacing", () => {
    assert.equal(buildPlan(csv, "s", "t").dropSql, null);
    assert.equal(buildPlan(csv, "s", "t", { replace: true }).dropSql, 'DROP TABLE IF EXISTS "S"."T"');
  });

  test("infers a column type per column", () => {
    const p = buildPlan(csv, "s", "t");
    assert.deepEqual(p.columns.map((c) => c.name), ["ID", "NAME"]);
    assert.equal(p.columns[0].type.kind, "decimal");
    assert.equal(p.columns[1].type.kind, "varchar");
    assert.equal(p.rowCount, 2);
  });

  test("assumeHeader skips the sniffing heuristic", () => {
    // Numeric-looking headers would normally be treated as data.
    const numeric = { delimiter: ",", header: ["1", "2"], rows: [["3", "4"]] };
    assert.deepEqual(buildPlan(numeric, "s", "t", { assumeHeader: true }).columns.map((c) => c.name), [
      "COL_1",
      "COL_2",
    ]);
    assert.equal(buildPlan(numeric, "s", "t", { assumeHeader: true }).rowCount, 1);
  });

  test("does not under-size types by sampling only the head", () => {
    // Regression guard: sorted keys used to infer DECIMAL(3,0) from the head.
    const sorted = {
      delimiter: ",",
      header: ["k"],
      rows: Array.from({ length: 2000 }, (_, i) => [String(i + 1)]),
    };
    const p = buildPlan(sorted, "s", "t");
    assert.deepEqual(p.columns[0].type, { kind: "decimal", precision: 4, scale: 0 });
  });

  test("handles a table with no data rows", () => {
    const p = buildPlan({ delimiter: ",", header: ["a"], rows: [] }, "s", "t");
    assert.equal(p.rowCount, 0);
    assert.equal(p.columns[0].type.kind, "varchar");
  });
});

describe("objectsToTable", () => {
  test("unions keys across rows, preserving first-appearance order", () => {
    const t = objectsToTable([{ a: 1 }, { b: 2 }, { a: 3, c: 4 }]);
    assert.deepEqual(t.header, ["a", "b", "c"]);
    assert.deepEqual(t.rows, [["1", "", ""], ["", "2", ""], ["3", "", "4"]]);
  });

  test("renders each scalar kind the CSV pipeline expects", () => {
    const t = objectsToTable([{ n: null, u: undefined, b: true, big: 10n, o: { x: 1 } }]);
    assert.deepEqual(t.rows[0], ["", "", "true", "10", '{"x":1}']);
  });

  test("serializes a NESTED bigint instead of throwing", () => {
    // Parquet rows routinely nest bigints; a bare JSON.stringify threw
    // "Do not know how to serialize a BigInt" and aborted the whole import.
    const t = objectsToTable([{ o: { id: 1n, nested: { n: 2n } } }]);
    assert.equal(t.rows[0][0], '{"id":"1","nested":{"n":"2"}}');
  });

  test("formats dates and drops invalid ones", () => {
    const t = objectsToTable([{ d: new Date("2024-01-01T10:00:00Z") }, { d: new Date("nope") }]);
    assert.equal(t.rows[0][0], "2024-01-01 10:00:00");
    assert.equal(t.rows[1][0], "");
  });

  test("handles an empty list", () => {
    assert.deepEqual(objectsToTable([]), { delimiter: ",", header: [], rows: [] });
  });
});

describe("buildInsert", () => {
  const plan = buildPlan(
    { delimiter: ",", header: ["id", "name"], rows: [["1", "ann"]] },
    "mart",
    "people",
  );

  test("emits one multi-row INSERT with quoted identifiers", () => {
    const sql = buildInsert(plan, [["1", "ann"], ["2", "bob"]]);
    assert.match(sql, /^INSERT INTO "MART"\."PEOPLE" \("ID", "NAME"\) VALUES/);
    assert.match(sql, /\(1, 'ann'\),\n\(2, 'bob'\)/);
  });

  test("pads short rows with NULL instead of misaligning columns", () => {
    assert.match(buildInsert(plan, [["1"]]), /\(1, NULL\)/);
  });

  test("escapes quotes in values", () => {
    assert.match(buildInsert(plan, [["1", "O'Brien"]]), /'O''Brien'/);
  });

  test("refuses an empty batch instead of emitting invalid SQL", () => {
    // `INSERT INTO t (cols) VALUES` with no tuples is not valid SQL.
    assert.throws(() => buildInsert(plan, []), /no rows/);
  });
});
