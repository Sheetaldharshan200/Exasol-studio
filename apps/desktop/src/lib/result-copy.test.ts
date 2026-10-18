import assert from "node:assert/strict";
import { test } from "node:test";
import { columnText, formatRows, prettyCell, sqlLiteral } from "./result-copy.ts";

const cols = [
  { name: "ID", typeName: "DECIMAL(18,0)" },
  { name: "Name", typeName: "VARCHAR(20) UTF8" },
  { name: "D", typeName: "DATE" },
];
const rows = [
  [1, "a\tb", "2026-10-04"],
  ["12345678901234567890", "it's |x|", null],
];

test("tab-separated text quotes only what needs it", () => {
  assert.equal(formatRows("tsv", cols, rows), 'ID\tName\tD\n1\t"a\tb"\t2026-10-04\n12345678901234567890\tit\'s |x|\t');
  assert.equal(formatRows("tsv", cols, [[1, 'say "hi"', null]], { header: false }), '1\t"say ""hi"""\t');
});

test("CSV keeps NULL and empty apart and does not guard formulas", () => {
  assert.equal(formatRows("csv", cols.slice(0, 2), [[null, ""], [1, "=1+1"]]), 'ID,Name\r\n,""\r\n1,=1+1');
});

test("Markdown escapes pipes and newlines and shows NULL", () => {
  assert.equal(formatRows("markdown", cols, [[1, "a|b\nc", null]]), "| ID | Name | D |\n| --- | --- | --- |\n| 1 | a\\|b<br>c | NULL |");
});

test("INSERT literals follow the column type; mixed-case names are quoted", () => {
  assert.equal(
    formatRows("insert", cols, rows, { table: "S.T" }),
    `INSERT INTO S.T (ID, "Name", D) VALUES (1, 'a\tb', DATE '2026-10-04');\nINSERT INTO S.T (ID, "Name", D) VALUES (12345678901234567890, 'it''s |x|', NULL);`,
  );
  assert.match(formatRows("insert", cols, [[1, "x", null]]), /^INSERT INTO TABLE_NAME /);
  assert.equal(formatRows("insert", cols, []), "");
});

test("sqlLiteral edge cases", () => {
  assert.equal(sqlLiteral(true, "BOOLEAN"), "TRUE");
  assert.equal(sqlLiteral("false", "BOOLEAN"), "FALSE");
  assert.equal(sqlLiteral("12abc", "DECIMAL(5,0)"), "'12abc'", "not a number: quoted");
  assert.equal(sqlLiteral("1.5E+3", "DOUBLE"), "1.5E+3");
  assert.equal(sqlLiteral(Number.NaN, "DOUBLE"), "NULL");
  assert.equal(sqlLiteral("2026-10-04 10:00:00.000", "TIMESTAMP"), "TIMESTAMP '2026-10-04 10:00:00.000'");
  assert.equal(sqlLiteral("42", "VARCHAR(5)"), "'42'", "text stays text");
});

test("JSON keeps values exact and NULL as null", () => {
  assert.deepEqual(JSON.parse(formatRows("json", cols, rows)), [
    { ID: 1, Name: "a\tb", D: "2026-10-04" },
    { ID: "12345678901234567890", Name: "it's |x|", D: null },
  ]);
  assert.equal(formatRows("json", cols, [[10n, "x", null]]).includes('"10"'), true, "bigint as text");
});

test("columnText and prettyCell", () => {
  assert.equal(columnText(rows, 0), "1\n12345678901234567890");
  assert.equal(columnText(rows, 2), "2026-10-04\n");
  assert.deepEqual(prettyCell('{"a":[1,2]}'), { text: '{\n  "a": [\n    1,\n    2\n  ]\n}', json: true });
  assert.deepEqual(prettyCell("{not json}"), { text: "{not json}", json: false });
  assert.deepEqual(prettyCell(null), { text: "", json: false });
});
