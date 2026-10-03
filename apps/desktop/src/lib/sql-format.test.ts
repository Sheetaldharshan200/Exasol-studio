import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSql, formatStatement } from "./sql-format.ts";

test("one clause per line, the select list one per line", () => {
  assert.equal(
    formatStatement("select a, b, sum(c) as total from retail.orders o where o.id > 5 and o.status = 'open' group by a, b order by total desc limit 10"),
    [
      "SELECT",
      "  a,",
      "  b,",
      "  sum(c) AS total",
      "FROM retail.orders o",
      "WHERE o.id > 5",
      "  AND o.status = 'open'",
      "GROUP BY",
      "  a,",
      "  b",
      "ORDER BY",
      "  total DESC",
      "LIMIT 10",
    ].join("\n"),
  );
});

test("joins start their own line and ON conditions break at AND", () => {
  assert.equal(
    formatStatement("select * from a left outer join b on a.id = b.id and a.x = b.x join c on c.k = a.k"),
    ["SELECT", "  *", "FROM a", "LEFT OUTER JOIN b ON a.id = b.id", "  AND a.x = b.x", "JOIN c ON c.k = a.k"].join("\n"),
  );
});

test("a subquery is indented; function calls and IN lists stay inline", () => {
  assert.equal(
    formatStatement("select x from (select id as x from t where y in (1, 2)) s"),
    ["SELECT", "  x", "FROM (", "  SELECT", "    id AS x", "  FROM t", "  WHERE y IN (1, 2)", ") s"].join("\n"),
  );
});

test("strings, quoted names and comments are kept exactly", () => {
  const out = formatStatement(`select "Mixed Case", 'select from where' from "My Schema".t -- keep this\nwhere a = 1`);
  assert.match(out, /"Mixed Case"/);
  assert.match(out, /'select from where'/);
  assert.match(out, /FROM "My Schema"\.t -- keep this/);
  assert.match(out, /\nWHERE a = 1$/);
});

test("BETWEEN keeps its AND, CASE stays on one line", () => {
  const out = formatStatement("select case when a > 1 and b < 2 then 'x' else 'y' end as k from t where d between 1 and 5 and e = 2");
  assert.match(out, /CASE WHEN a > 1 AND b < 2 THEN 'x' ELSE 'y' END AS k/);
  assert.match(out, /WHERE d BETWEEN 1 AND 5\n  AND e = 2/);
});

test("a script block is never touched; statements are separated", () => {
  const sql = "select 1 from dual;\n--/\nCREATE LUA SCRIPT s.x() AS\nlocal a = 1; return   a\n/\nselect 2 from dual";
  const out = formatSql(sql);
  assert.match(out, /^SELECT\n  1\nFROM dual;\n\n--\/\nCREATE LUA SCRIPT s\.x\(\) AS\nlocal a = 1; return   a\n\/\n\nSELECT\n  2\nFROM dual;\n$/);
});

test("formatting twice changes nothing", () => {
  const samples = [
    "select a, b from t where x = 1 and y = 2 order by a",
    "insert into s.t (a, b) select a, b from u where c is not null",
    "update t set a = 1, b = 'x' where id = 3",
    "select x from (select id as x from t) s left join u on u.x = s.x",
    "with q as (select 1 as a from dual) select a from q",
  ];
  for (const s of samples) {
    const once = formatSql(s);
    assert.equal(formatSql(once), once, s);
  }
});

test("an empty buffer stays empty", () => {
  assert.equal(formatSql(""), "");
  assert.equal(formatSql("   "), "   ");
});
