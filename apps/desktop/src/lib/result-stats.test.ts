import { test } from "node:test";
import assert from "node:assert/strict";
import { cellText, filterRows, toCsv, computeStats, resultTabLabel, resultSummary, rowTotal, statementVerb } from "./result-stats.ts";

test("resultTabLabel describes each result kind", () => {
  assert.equal(resultTabLabel({ kind: "resultSet", rowCount: 42, error: null }, 1), "Result 2 · 42 rows");
  assert.equal(resultTabLabel({ kind: "resultSet", rowCount: 1, error: null }, 0), "Result 1 · 1 row");
  assert.equal(resultTabLabel({ kind: "rowCount", rowCount: 5, error: null }, 2), "Result 3 · 5 affected");
  assert.equal(resultTabLabel({ kind: "resultSet", rowCount: 0, error: "boom" }, 0), "Result 1 · error");
});

test("an unknown affected-row count never renders as zero", () => {
  // The R driver cannot report affected rows — r-exasol hardcodes 0 for every
  // non-SELECT. "0 affected" for an INSERT that wrote three is a wrong answer,
  // so "executed" is a distinct kind that carries no number to misread.
  assert.equal(resultTabLabel({ kind: "executed", rowCount: 0, error: null }, 0), "Result 1 · executed");
  assert.equal(
    resultTabLabel({ kind: "executed", rowCount: 0, error: null }, 1, "INSERT"),
    "2] INSERT · executed",
  );
  // An error still wins: the statement did not run at all.
  assert.equal(resultTabLabel({ kind: "executed", rowCount: 0, error: "boom" }, 0), "Result 1 · error");
});

test("resultTabLabel shows the statement verb with editor-style numbering", () => {
  assert.equal(resultTabLabel({ kind: "resultSet", rowCount: 3, error: null }, 7, "SELECT"), "8] SELECT · 3 rows");
  assert.equal(resultTabLabel({ kind: "rowCount", rowCount: 12, error: null }, 3, "INSERT"), "4] INSERT · 12 affected");
  assert.equal(resultTabLabel({ kind: "rowCount", rowCount: 0, error: "boom" }, 0, "DROP"), "1] DROP · error");
});

test("statementVerb finds the leading keyword, skipping comments", () => {
  assert.equal(statementVerb("SELECT * FROM T"), "SELECT");
  assert.equal(statementVerb("  create or replace table T (x int)"), "CREATE");
  assert.equal(statementVerb("-- note\nINSERT INTO T VALUES (1)"), "INSERT");
  assert.equal(statementVerb("/* block */ DELETE FROM T"), "DELETE");
  assert.equal(statementVerb("-- only a comment"), undefined);
  assert.equal(statementVerb(""), undefined);
  assert.equal(statementVerb(undefined), undefined);
});

const cols = [
  { name: "ID", typeName: "DECIMAL" },
  { name: "NAME", typeName: "VARCHAR" },
];

test("cellText renders values and blanks null/undefined", () => {
  assert.equal(cellText(null), "");
  assert.equal(cellText(undefined), "");
  assert.equal(cellText("hi"), "hi");
  assert.equal(cellText(0), "0");
  assert.equal(cellText(false), "false");
});

test("filterRows keeps every row for an empty or whitespace query", () => {
  const rows = [[1, "a"], [2, "b"]];
  assert.deepEqual(filterRows(rows, ""), rows);
  assert.deepEqual(filterRows(rows, "   "), rows);
});

test("filterRows matches case-insensitively across all cells", () => {
  const rows = [[1, "Alice"], [2, "Bob"], [3, "Carol"]];
  assert.deepEqual(filterRows(rows, "bo"), [[2, "Bob"]]);
  assert.deepEqual(filterRows(rows, "3"), [[3, "Carol"]]); // matches numeric cell
  assert.deepEqual(filterRows(rows, "zzz"), []);
});

test("filterRows treats NULL cells as non-matching, never crashes", () => {
  const rows = [[1, null], [2, "x"]];
  assert.deepEqual(filterRows(rows, "x"), [[2, "x"]]);
  assert.deepEqual(filterRows(rows, "1"), [[1, null]]);
});

test("toCsv emits a header even with no rows", () => {
  assert.equal(toCsv(cols, []), "ID,NAME");
});

test("toCsv quotes fields containing comma, quote, or newline", () => {
  const rows = [["a,b", 'he said "hi"'], ["line1\nline2", "plain"]];
  assert.equal(
    toCsv(cols, rows),
    'ID,NAME\r\n"a,b","he said ""hi"""\r\n"line1\nline2",plain',
  );
});

test("toCsv blanks null cells and stringifies numbers", () => {
  assert.equal(toCsv(cols, [[42, null]]), "ID,NAME\r\n42,");
});

test("computeStats returns the plain numbers for a normal query", () => {
  const s = computeStats({ timeMs: 100, rows: 50, cols: 4 });
  assert.equal(s.timeMs, 100);
  assert.equal(s.rows, 50);
  assert.equal(s.cols, 4);
  assert.equal(s.throughputPerSec, 500); // 50 rows / 0.1s
  assert.equal(s.avgPerRowMs, 2); // 100ms / 50 rows
});

test("computeStats never divides by zero", () => {
  const noRows = computeStats({ timeMs: 20, rows: 0, cols: 3 });
  assert.equal(noRows.throughputPerSec, 0);
  assert.equal(noRows.avgPerRowMs, 0);
  const noTime = computeStats({ timeMs: 0, rows: 10, cols: 3 });
  assert.equal(noTime.throughputPerSec, 0);
  assert.equal(noTime.avgPerRowMs, 0);
});

test("computeStats clamps negative inputs to zero", () => {
  const s = computeStats({ timeMs: -5, rows: -2, cols: -1 });
  assert.equal(s.timeMs, 0);
  assert.equal(s.rows, 0);
  assert.equal(s.cols, 0);
  assert.equal(s.throughputPerSec, 0);
  assert.equal(s.avgPerRowMs, 0);
});

test("resultSummary says what a result did without inventing a number", () => {
  assert.equal(resultSummary({ kind: "resultSet", rowCount: 42 }), "42 rows");
  assert.equal(resultSummary({ kind: "resultSet", rowCount: 1 }), "1 row");
  assert.equal(resultSummary({ kind: "rowCount", rowCount: 3 }), "3 rows affected");
  assert.equal(resultSummary({ kind: "rowCount", rowCount: 1 }), "1 row affected");
  // The R driver's writes: it ran, the count is unknown, and no "0" appears.
  assert.equal(resultSummary({ kind: "executed", rowCount: 0 }), "Statement executed");
});

test("rowTotal keeps unknown counts visible instead of folding them in as zero", () => {
  const known = [
    { kind: "resultSet" as const, rowCount: 5 },
    { kind: "rowCount" as const, rowCount: 3 },
  ];
  assert.deepEqual(rowTotal(known), { rows: 8, withoutCount: 0 });

  // One R-driver INSERT in the run: it must not silently subtract from the
  // truth by contributing 0 — it is counted as a statement without a count.
  const mixed = [...known, { kind: "executed" as const, rowCount: 0 }];
  assert.deepEqual(rowTotal(mixed), { rows: 8, withoutCount: 1 });

  assert.deepEqual(rowTotal([]), { rows: 0, withoutCount: 0 });
});
