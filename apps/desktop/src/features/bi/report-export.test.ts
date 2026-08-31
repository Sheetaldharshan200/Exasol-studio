/**
 * Edge-case tests for the dashboard report/export helpers.
 *
 * `mdToHtml` and `mdTable` turn user- and DATABASE-derived text into an exported
 * document. If mdToHtml fails to escape, a table value or panel title containing
 * markup becomes live HTML in the exported report — so the escaping cases below
 * are the point of this file, not an afterthought.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  slugify,
  fmtNumber,
  kpiText,
  mdTable,
  mdToHtml,
  buildMarkdownReport,
  MD_ROW_CAP,
} from "./report-export.ts";

const result = (columns: string[], rows: unknown[][]) =>
  ({
    columns: columns.map((name) => ({ name, typeName: "VARCHAR" })),
    rows,
    rowCount: rows.length,
  }) as never;

describe("slugify", () => {
  test("lower-cases and hyphenates", () => {
    assert.equal(slugify("My Dashboard"), "my-dashboard");
    assert.equal(slugify("Q4 Revenue / 2024"), "q4-revenue-2024");
  });

  test("trims leading and trailing separators", () => {
    assert.equal(slugify("  --Hello--  "), "hello");
  });

  test("falls back to 'dashboard' when nothing survives", () => {
    assert.equal(slugify(""), "dashboard");
    assert.equal(slugify("!!!"), "dashboard");
    assert.equal(slugify("   "), "dashboard");
  });
});

describe("fmtNumber", () => {
  test("abbreviates by magnitude", () => {
    assert.equal(fmtNumber(2_500_000_000), "2.50B");
    assert.equal(fmtNumber(1_500_000), "1.50M");
    assert.equal(fmtNumber(1_500), "1.5K");
  });

  test("keeps small integers exact and rounds small floats", () => {
    assert.equal(fmtNumber(42), "42");
    assert.equal(fmtNumber(0), "0");
    assert.equal(fmtNumber(3.14159), "3.14");
  });

  test("handles negatives by magnitude", () => {
    assert.equal(fmtNumber(-1_500_000), "-1.50M");
    assert.equal(fmtNumber(-42), "-42");
  });

  test("parses numeric strings", () => {
    assert.equal(fmtNumber("1500"), "1.5K");
  });

  test("non-numeric input falls back to its text", () => {
    assert.equal(fmtNumber("abc"), "abc");
    assert.equal(fmtNumber(NaN), "NaN");
    assert.equal(fmtNumber(Infinity), "Infinity");
  });

  test("NULL and empty render as unknown, NEVER as zero", () => {
    // Number(null) and Number("") are both 0 and finite, so these used to show
    // "0" in a KPI tile — a NULL revenue reading as zero is the wrong answer,
    // not a cosmetic issue.
    assert.equal(fmtNumber(null), "—");
    assert.equal(fmtNumber(undefined), "—");
    assert.equal(fmtNumber(""), "—");
    // A genuine zero must still read as zero.
    assert.equal(fmtNumber(0), "0");
    assert.equal(fmtNumber("0"), "0");
  });
});

describe("kpiText", () => {
  const panel = (valueField?: string, unit?: string) =>
    ({ viz: { type: "kpi", valueField, unit } }) as never;

  test("reads the named field, matching Exasol's upper-cased identifiers", () => {
    const r = result(["TOTAL", "OTHER"], [[1_500, 9]]);
    assert.equal(kpiText(panel("total"), r), "1.5K");
  });

  test("defaults to the first column when no field is named", () => {
    assert.equal(kpiText(panel(), result(["A"], [[42]])), "42");
  });

  test("falls back to the first column when the named field is missing", () => {
    assert.equal(kpiText(panel("nope"), result(["A"], [[7]])), "7");
  });

  test("appends the unit when set", () => {
    assert.equal(kpiText(panel("A", "rows"), result(["A"], [[5]])), "5 rows");
  });

  test("an empty result set does not throw", () => {
    assert.equal(kpiText(panel("A"), result(["A"], [])), "—");
  });
});

describe("mdTable", () => {
  test("renders a header, separator, and rows", () => {
    const got = mdTable(result(["A", "B"], [[1, 2]]));
    assert.equal(got, "| A | B |\n| --- | --- |\n| 1 | 2 |");
  });

  test("escapes pipes so a value cannot forge a column", () => {
    const got = mdTable(result(["A"], [["a|b"]]));
    assert.ok(got.includes("a\\|b"), got);
  });

  test("flattens newlines so a value cannot forge a row", () => {
    const got = mdTable(result(["A"], [["line1\nline2"]]));
    assert.ok(got.includes("line1 line2"), got);
    assert.equal(got.split("\n").length, 3);
  });

  test("renders nullish cells as empty", () => {
    assert.ok(mdTable(result(["A"], [[null]])).endsWith("|  |"));
  });

  test("caps rows and says how many were withheld", () => {
    const rows = Array.from({ length: MD_ROW_CAP + 5 }, (_, i) => [i]);
    const got = mdTable(result(["A"], rows));
    assert.ok(got.includes("5 more rows not shown"), got.slice(-80));
    // header + separator + capped rows + blank + note
    assert.equal(got.split("\n").length, 2 + MD_ROW_CAP + 2);
  });

  test("a result with no rows still renders a valid empty table", () => {
    assert.equal(mdTable(result(["A"], [])), "| A |\n| --- |");
  });
});

describe("mdToHtml — escaping is security-relevant", () => {
  test("escapes HTML in prose", () => {
    assert.equal(mdToHtml("<script>alert(1)</script>"), "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  });

  test("escapes HTML inside headings and list items", () => {
    assert.ok(!mdToHtml("# <img onerror=x>").includes("<img"));
    assert.ok(!mdToHtml("- <img onerror=x>").includes("<img"));
  });

  test("escapes ampersands before tags so entities cannot be smuggled", () => {
    assert.equal(mdToHtml("a & b"), "<p>a &amp; b</p>");
    // &lt;script&gt; in the source must stay inert, not become <script>.
    assert.ok(!mdToHtml("&lt;script&gt;").includes("<script>"));
  });

  test("renders headings h2..h5", () => {
    assert.equal(mdToHtml("# T"), "<h2>T</h2>");
    assert.equal(mdToHtml("#### T"), "<h5>T</h5>");
  });

  test("renders bold, italic and inline code", () => {
    assert.equal(mdToHtml("**b**"), "<p><strong>b</strong></p>");
    assert.equal(mdToHtml("*i*"), "<p><em>i</em></p>");
    assert.equal(mdToHtml("`c`"), "<p><code>c</code></p>");
  });

  test("groups consecutive list items into one ul and closes it", () => {
    const got = mdToHtml("- a\n- b\ntext");
    assert.equal(got, "<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n<p>text</p>");
  });

  test("closes a trailing unterminated list", () => {
    assert.equal(mdToHtml("- a"), "<ul>\n<li>a</li>\n</ul>");
  });

  test("drops blank lines and handles empty input", () => {
    assert.equal(mdToHtml(""), "");
    assert.equal(mdToHtml("\n\n  \n"), "");
  });
});

describe("buildMarkdownReport", () => {
  const dash = (over = {}) => ({ title: "My Dash", ...over }) as never;
  const panel = (over: Record<string, unknown> = {}) =>
    ({ id: "p1", title: "Panel 1", viz: { type: "table" }, ...over }) as never;
  const NOW = new Date("2024-01-01T10:00:00Z");

  test("leads with the title and export stamp", () => {
    const md = buildMarkdownReport(dash(), [], new Map(), NOW);
    assert.ok(md.startsWith("# My Dash"), md.slice(0, 40));
    assert.ok(md.includes("Exported from Exasol Studio"));
  });

  test("includes the description when present", () => {
    const md = buildMarkdownReport(dash({ description: "Weekly numbers" }), [], new Map(), NOW);
    assert.ok(md.includes("Weekly numbers"));
  });

  test("inlines a markdown panel's content verbatim", () => {
    const p = panel({ viz: { type: "markdown", content: "## Notes" } });
    assert.ok(buildMarkdownReport(dash(), [p], new Map(), NOW).includes("## Notes"));
  });

  test("says so when a panel has no data", () => {
    const md = buildMarkdownReport(dash(), [panel()], new Map(), NOW);
    assert.ok(md.includes("No data"), md);
  });

  test("renders a KPI panel in bold and a table panel as a table", () => {
    const data = new Map([["p1", result(["A"], [[1_500]])]]);
    const kpi = panel({ viz: { type: "kpi", valueField: "A" } });
    assert.ok(buildMarkdownReport(dash(), [kpi], data as never, NOW).includes("**1.5K**"));
    assert.ok(buildMarkdownReport(dash(), [panel()], data as never, NOW).includes("| A |"));
  });

  test("appends the panel's SQL in a fenced block", () => {
    const data = new Map([["p1", result(["A"], [[1]])]]);
    const p = panel({ query: { sql: "  SELECT 1  " } });
    const md = buildMarkdownReport(dash(), [p], data as never, NOW);
    assert.ok(md.includes("```sql\nSELECT 1\n```"), md);
  });

  test("falls back to a placeholder title for an untitled panel", () => {
    const md = buildMarkdownReport(dash(), [panel({ title: "" })], new Map(), NOW);
    assert.ok(md.includes("## Panel"), md);
  });
});
