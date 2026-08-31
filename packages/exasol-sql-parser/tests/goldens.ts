/** Data-driven caret goldens: sql with `¦` marking the caret. */
export type Golden = {
  name: string;
  sql: string; // contains exactly one ¦ caret marker
  kinds?: string[]; // must all be present
  keywords?: string[]; // must all be present
  notKeywords?: string[]; // must all be absent
};

export const GOLDENS: Golden[] = [
  // SELECT core
  { name: "select list start", sql: "SELECT ¦ FROM T", kinds: ["column"] },
  { name: "select second item", sql: "SELECT A, ¦ FROM T", kinds: ["column"] },
  { name: "after select list", sql: "SELECT A ¦", keywords: ["FROM"] },
  { name: "FROM target", sql: "SELECT * FROM ¦", kinds: ["table", "schema"] },
  { name: "second FROM item", sql: "SELECT * FROM A.T1, ¦", kinds: ["table", "schema"] },
  { name: "JOIN target", sql: "SELECT * FROM T a JOIN ¦", kinds: ["table", "schema"] },
  { name: "after join table", sql: "SELECT * FROM T a JOIN U b ¦", keywords: ["ON", "USING"] },
  { name: "ON condition", sql: "SELECT * FROM T a JOIN U b ON ¦", kinds: ["column"] },
  { name: "join kinds", sql: "SELECT * FROM T a LEFT ¦", keywords: ["OUTER", "JOIN"] },
  { name: "WHERE expr", sql: "SELECT A FROM T WHERE ¦", kinds: ["column"] },
  { name: "AND rhs", sql: "SELECT A FROM T WHERE A = 1 AND ¦", kinds: ["column"] },
  { name: "GROUP needs BY", sql: "SELECT A FROM T GROUP ¦", keywords: ["BY"], notKeywords: ["FROM", "WHERE"] },
  { name: "GROUP BY expr", sql: "SELECT A FROM T GROUP BY ¦", kinds: ["column"], keywords: ["CUBE", "ROLLUP", "GROUPING"] },
  { name: "HAVING expr", sql: "SELECT A FROM T GROUP BY A HAVING ¦", kinds: ["column"] },
  { name: "after HAVING pred", sql: "SELECT A FROM T GROUP BY A HAVING COUNT(*) > 1 ¦", keywords: ["QUALIFY", "ORDER"] },
  { name: "ORDER needs BY", sql: "SELECT A FROM T ORDER ¦", keywords: ["BY"] },
  { name: "order direction", sql: "SELECT A FROM T ORDER BY A ¦", keywords: ["ASC", "DESC", "NULLS", "LIMIT"] },
  { name: "NULLS placement", sql: "SELECT A FROM T ORDER BY A DESC NULLS ¦", keywords: ["FIRST", "LAST"] },
  // Set ops / CTE / subquery
  { name: "after query", sql: "SELECT A FROM T ¦", keywords: ["UNION", "INTERSECT", "MINUS", "WHERE", "GROUP"] },
  { name: "UNION next", sql: "SELECT A FROM T UNION ¦", keywords: ["ALL", "SELECT"] },
  { name: "WITH cte name then AS", sql: "WITH X ¦", keywords: ["AS"] },
  { name: "cte body", sql: "WITH X AS (¦", keywords: ["SELECT"] },
  { name: "subquery in FROM", sql: "SELECT * FROM (¦", keywords: ["SELECT", "VALUES"] },
  { name: "IN subquery", sql: "SELECT A FROM T WHERE A IN (¦", keywords: ["SELECT"] },
  { name: "EXISTS", sql: "SELECT A FROM T WHERE ¦ (SELECT 1 FROM U)", keywords: ["EXISTS"] },
  // Predicates / expressions
  { name: "BETWEEN needs AND", sql: "SELECT A FROM T WHERE A BETWEEN 1 ¦", keywords: ["AND"] },
  { name: "IS NULL", sql: "SELECT A FROM T WHERE A IS ¦", keywords: ["NOT", "NULL"] },
  { name: "CASE WHEN", sql: "SELECT CASE ¦ FROM T", keywords: ["WHEN"] },
  { name: "CASE THEN", sql: "SELECT CASE WHEN A = 1 ¦ FROM T", keywords: ["THEN"] },
  { name: "CAST AS", sql: "SELECT CAST(A ¦ FROM T", keywords: ["AS"] },
  { name: "EXTRACT unit", sql: "SELECT EXTRACT(¦ FROM D) FROM T", keywords: ["YEAR", "MONTH", "DAY", "HOUR"] },
  // Window
  { name: "OVER after fn", sql: "SELECT ROW_NUMBER() ¦ FROM T", keywords: ["OVER"] },
  { name: "in OVER", sql: "SELECT SUM(A) OVER (¦ FROM T", keywords: ["PARTITION", "ORDER", "ROWS", "RANGE"] },
  { name: "frame bound", sql: "SELECT SUM(A) OVER (ORDER BY A ROWS BETWEEN UNBOUNDED ¦ FROM T", keywords: ["PRECEDING"] },
  { name: "frame current", sql: "SELECT SUM(A) OVER (ORDER BY A ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ¦ FROM T", keywords: ["ROW"] },
  // Hierarchy
  { name: "CONNECT needs BY", sql: "SELECT A FROM T CONNECT ¦", keywords: ["BY"] },
  { name: "START needs WITH", sql: "SELECT A FROM T START ¦", keywords: ["WITH"] },
  // DML
  { name: "INSERT needs INTO", sql: "INSERT ¦", keywords: ["INTO"] },
  { name: "INSERT target", sql: "INSERT INTO ¦", kinds: ["table", "schema"] },
  { name: "INSERT then VALUES/SELECT", sql: "INSERT INTO T ¦", keywords: ["VALUES", "SELECT"] },
  { name: "UPDATE target", sql: "UPDATE ¦", kinds: ["table", "schema"] },
  { name: "UPDATE needs SET", sql: "UPDATE T x ¦", keywords: ["SET"] },
  { name: "SET column", sql: "UPDATE T SET ¦", kinds: ["column"] },
  { name: "DELETE FROM", sql: "DELETE ¦", keywords: ["FROM"] },
  { name: "MERGE USING", sql: "MERGE INTO T t ¦", keywords: ["USING"] },
  { name: "MERGE WHEN", sql: "MERGE INTO T t USING U u ON t.A = u.A ¦", keywords: ["WHEN"] },
  { name: "WHEN MATCHED", sql: "MERGE INTO T t USING U u ON t.A = u.A WHEN ¦", keywords: ["MATCHED", "NOT"] },
  { name: "MATCHED THEN", sql: "MERGE INTO T t USING U u ON t.A = u.A WHEN MATCHED ¦", keywords: ["THEN"] },
  // DDL
  { name: "CREATE kinds", sql: "CREATE ¦", keywords: ["TABLE", "SCHEMA", "VIRTUAL", "OR"] },
  { name: "CREATE TABLE name", sql: "CREATE TABLE ¦", kinds: ["table", "schema"], keywords: ["IF"] },
  { name: "column then type", sql: "CREATE TABLE T (ID ¦", keywords: ["DECIMAL", "VARCHAR", "BOOLEAN", "DATE", "TIMESTAMP"] },
  { name: "DROP kinds", sql: "DROP ¦", keywords: ["TABLE", "SCHEMA", "VIEW", "SCRIPT", "CONNECTION"] },
  // Exasol surface
  { name: "IMPORT INTO table", sql: "IMPORT INTO ¦", kinds: ["table"] },
  { name: "import source kinds", sql: "IMPORT INTO T FROM ¦", keywords: ["CSV", "FBV", "JDBC", "EXA", "LOCAL"] },
  { name: "import AT", sql: "IMPORT INTO T FROM CSV ¦", keywords: ["AT"] },
  { name: "import FILE", sql: "IMPORT INTO T FROM CSV AT C ¦", keywords: ["FILE"] },
  { name: "EXPORT INTO", sql: "EXPORT T ¦", keywords: ["INTO"] },
  { name: "EXECUTE SCRIPT", sql: "EXECUTE ¦", keywords: ["SCRIPT"] },
  { name: "script langs after CREATE OR REPLACE", sql: "CREATE OR REPLACE ¦", keywords: ["PYTHON3", "LUA", "JAVA", "TABLE"] },
  { name: "script RETURNS/EMITS", sql: "CREATE PYTHON3 SCALAR SCRIPT S.F(x DECIMAL) ¦", keywords: ["RETURNS", "EMITS", "AS"] },
];
