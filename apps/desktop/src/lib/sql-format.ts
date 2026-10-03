// A small SQL formatter for Exasol: keywords in upper case, one line per
// clause, the select list and AND/OR conditions one per line, subqueries
// indented. Strings, quoted names and comments are kept exactly, and a
// `--/ … /` script block (a UDF body in Lua/Python/…) is never touched.
// Idempotent: formatting formatted SQL changes nothing.

import { splitStatements } from "./sql-text.ts";

type Tok = { kind: "word" | "str" | "ident" | "comment" | "line-comment" | "num" | "punct"; text: string };

const KEYWORDS = new Set(
  (
    "SELECT FROM WHERE GROUP BY ORDER HAVING LIMIT OFFSET QUALIFY JOIN LEFT RIGHT FULL INNER OUTER CROSS NATURAL ON USING AS AND OR NOT " +
    "IN IS NULL LIKE BETWEEN EXISTS CASE WHEN THEN ELSE END DISTINCT ALL UNION MINUS EXCEPT INTERSECT WITH INSERT INTO VALUES UPDATE SET " +
    "DELETE MERGE MATCHED CREATE OR REPLACE TABLE VIEW SCHEMA DROP ALTER ADD COLUMN CASCADE IF PRIMARY KEY DISTRIBUTE PARTITION " +
    "COMMENT IS ASC DESC NULLS FIRST LAST OVER WINDOW ROWS RANGE PRECEDING FOLLOWING UNBOUNDED CURRENT ROW CONNECT START PRIOR " +
    "TRUE FALSE CAST TRUNCATE RENAME TO GRANT REVOKE OPEN CLOSE COMMIT ROLLBACK IMPORT EXPORT EXECUTE SCRIPT LOCAL PREFERRING"
  ).split(" "),
);

/** Clauses that begin a new line (matched as one or two words). */
const CLAUSES = [
  "UNION ALL", "GROUP BY", "ORDER BY", "LEFT JOIN", "RIGHT JOIN", "FULL JOIN", "INNER JOIN", "CROSS JOIN", "NATURAL JOIN",
  "CONNECT BY", "START WITH", "INSERT INTO", "DELETE FROM", "MERGE INTO", "PARTITION BY",
  "SELECT", "FROM", "WHERE", "HAVING", "LIMIT", "QUALIFY", "JOIN", "UNION", "MINUS", "EXCEPT", "INTERSECT", "VALUES", "SET", "UPDATE", "WITH", "WHEN",
];
/** Clauses whose top-level commas put each item on its own line. */
const LISTS = new Set(["SELECT", "GROUP BY", "ORDER BY", "SET", "PARTITION BY"]);
/** Clauses whose top-level AND / OR start a line. */
const CONDITIONS = new Set(["WHERE", "HAVING", "ON", "QUALIFY", "WHEN"]);

function tokenize(sql: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const rest = sql.slice(i);
    let m: RegExpExecArray | null;
    if (/\s/.test(c)) {
      i++;
    } else if (rest.startsWith("--")) {
      const end = sql.indexOf("\n", i);
      const text = end < 0 ? sql.slice(i) : sql.slice(i, end);
      out.push({ kind: "line-comment", text: text.trimEnd() });
      i += text.length;
    } else if (rest.startsWith("/*")) {
      const end = sql.indexOf("*/", i + 2);
      const text = end < 0 ? sql.slice(i) : sql.slice(i, end + 2);
      out.push({ kind: "comment", text });
      i += text.length;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === c && sql[j + 1] === c) j += 2;
        else if (sql[j] === c) break;
        else j++;
      }
      out.push({ kind: c === "'" ? "str" : "ident", text: sql.slice(i, j + 1) });
      i = j + 1;
    } else if ((m = /^[A-Za-z_][\w$#]*/.exec(rest))) {
      out.push({ kind: "word", text: m[0] });
      i += m[0].length;
    } else if ((m = /^\d+(\.\d*)?([eE][+-]?\d+)?/.exec(rest))) {
      out.push({ kind: "num", text: m[0] });
      i += m[0].length;
    } else if ((m = /^(<>|<=|>=|!=|\|\||::|:=)/.exec(rest))) {
      out.push({ kind: "punct", text: m[0] });
      i += m[0].length;
    } else {
      out.push({ kind: "punct", text: c });
      i++;
    }
  }
  return out;
}

const word = (t: Tok | undefined) => (t?.kind === "word" ? t.text.toUpperCase() : "");

/** Format one statement (no trailing semicolon). */
export function formatStatement(sql: string): string {
  const toks = tokenize(sql);
  const lines: string[] = [];
  let line = "";
  // One frame per open parenthesis: whether it holds a subquery, and the
  // clause in force inside it.
  const frames: { sub: boolean; clause: string; between?: boolean }[] = [{ sub: true, clause: "" }];
  const depth = () => frames.filter((f) => f.sub).length - 1;
  const pad = (extra = 0) => "  ".repeat(Math.max(0, depth() + extra));
  const newline = (extra = 0) => {
    if (line.trim()) lines.push(line.trimEnd());
    line = pad(extra);
  };
  const add = (text: string, spaceBefore = true) => {
    if (spaceBefore && line.trim() && !/[(.]$/.test(line)) line += " ";
    line += text;
  };

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const top = frames[frames.length - 1];
    if (t.kind === "line-comment") {
      add(t.text);
      newline(top.clause && LISTS.has(top.clause) ? 1 : 0);
      continue;
    }
    if (t.kind === "word") {
      const w = t.text.toUpperCase();
      const two = `${w} ${word(toks[i + 1])}`;
      const three = `${w} ${word(toks[i + 1])} ${word(toks[i + 2])}`;
      // LEFT OUTER JOIN and friends read as their JOIN clause.
      const clause = /^(LEFT|RIGHT|FULL) OUTER JOIN$/.test(three) ? three : CLAUSES.includes(two) ? two : CLAUSES.includes(w) ? w : "";
      const inCase = frames.some((f) => f.clause === "CASE");
      if (clause && top.sub && !inCase && !(clause === "WHEN" && top.clause !== "MERGE")) {
        if (line.trim()) newline();
        add(clause);
        i += clause.split(" ").length - 1;
        top.clause = clause.endsWith("JOIN") ? "JOIN" : clause;
        if (LISTS.has(top.clause)) newline(1);
        continue;
      }
      if (w === "MERGE") top.clause = "MERGE";
      if (w === "ON" && top.sub) {
        top.clause = "ON";
      }
      if (w === "BETWEEN") top.between = true;
      if (w === "CASE") frames.push({ sub: false, clause: "CASE" });
      if (w === "END" && top.clause === "CASE") frames.pop();
      if ((w === "AND" || w === "OR") && top.sub && CONDITIONS.has(top.clause) && !inCase) {
        // `BETWEEN a AND b` keeps its own AND (and only that one).
        const between = w === "AND" && top.between;
        top.between = false;
        if (!between) {
          newline(1);
          add(w);
          continue;
        }
      }
      add(KEYWORDS.has(w) ? w : t.text);
      continue;
    }
    if (t.kind === "punct") {
      if (t.text === "(") {
        const opensQuery = word(toks[i + 1]) === "SELECT" || word(toks[i + 1]) === "WITH";
        // A function call or a type keeps "(" next to its name.
        const prev = toks[i - 1];
        add("(", !(prev && (prev.kind === "word" || prev.kind === "ident") && !KEYWORDS.has(word(prev))));
        frames.push({ sub: opensQuery, clause: "" });
        if (opensQuery) newline();
        continue;
      }
      if (t.text === ")") {
        const closing = frames.length > 1 ? frames.pop()! : frames[0];
        if (closing.sub) newline();
        line = closing.sub ? line.replace(/\s+$/, "") || pad() : line;
        add(")", false);
        continue;
      }
      if (t.text === ",") {
        add(",", false);
        if (top.sub && LISTS.has(top.clause)) newline(1);
        continue;
      }
      if (t.text === ".") {
        add(".", false);
        continue;
      }
      if (t.text === ";") continue;
      add(t.text);
      continue;
    }
    // Strings, quoted names, numbers and block comments, exactly as written.
    add(t.text, !(toks[i - 1]?.text === "."));
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines.join("\n");
}

/** Format a whole buffer: each statement formatted, script blocks kept. */
export function formatSql(sql: string): string {
  const parts = splitStatements(sql);
  if (!parts.length) return sql;
  const out = parts.map((p) => {
    const raw = sql.slice(p.start, p.end);
    if (/^\s*--\//.test(raw)) return { text: `--/\n${p.text}\n/`, script: true };
    return { text: formatStatement(p.text), script: false };
  });
  return out.map((o) => (o.script ? o.text : `${o.text};`)).join("\n\n") + "\n";
}
