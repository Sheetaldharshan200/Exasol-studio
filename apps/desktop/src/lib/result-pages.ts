// How a result is paged so that page n always continues page n-1.
//
// Exasol only guarantees an order when the statement asks for one, and OFFSET
// over an unordered result can repeat or skip rows. So every page of one
// result is fetched under ONE order:
// - the statement's own top-level ORDER BY, then every column as the tie
//   breaker (`ORDER BY amount DESC` alone lets tied rows swap between runs);
// - otherwise every column in turn (ORDER BY 1, 2, …, n).
// Both are deterministic: rows equal in every column are indistinguishable.
// The run itself had no tie breaker, so once the user pages, page 0 is
// fetched again under the plan rather than reused.
// A statement with its own top-level LIMIT is the rows the user asked for and
// is not paged. Duplicate column names only matter for the column-order
// wrapper (it selects FROM the statement); a statement with its own ORDER BY
// is paged in place and may repeat names.

export type PagePlan = { kind: "ordered" | "columns"; base: string; columnCount: number };

/** Words at nesting depth 0, outside strings, quoted names and comments. */
export function topLevelWords(sql: string): string[] {
  const words: string[] = [];
  let depth = 0;
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const two = sql.slice(i, i + 2);
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === c) {
          if (sql[j + 1] === c) j += 2;
          else break;
        } else j++;
      }
      i = j + 1;
    } else if (two === "--") {
      const j = sql.indexOf("\n", i);
      i = j < 0 ? sql.length : j;
    } else if (two === "/*") {
      const j = sql.indexOf("*/", i + 2);
      i = j < 0 ? sql.length : j + 2;
    } else if (c === "(") {
      depth++;
      i++;
    } else if (c === ")") {
      depth = Math.max(0, depth - 1);
      i++;
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < sql.length && /[A-Za-z0-9_$]/.test(sql[j])) j++;
      if (depth === 0) words.push(sql.slice(i, j).toUpperCase());
      i = j;
    } else i++;
  }
  return words;
}

export function hasTopLevelOrderBy(sql: string): boolean {
  const w = topLevelWords(sql);
  return w.some((x, i) => x === "ORDER" && w[i + 1] === "BY");
}

export function hasTopLevelLimit(sql: string): boolean {
  return topLevelWords(sql).includes("LIMIT");
}

/** The plan for paging `base` (one SELECT/WITH statement), or null if it can't be paged. */
export function pagePlan(base: string, columnNames: readonly string[]): PagePlan | null {
  if (hasTopLevelLimit(base)) return null;
  const upper = columnNames.map((c) => c.toUpperCase());
  if (!upper.length) return null;
  if (hasTopLevelOrderBy(base)) return { kind: "ordered", base, columnCount: upper.length };
  if (new Set(upper).size !== upper.length) return null;
  return { kind: "columns", base, columnCount: upper.length };
}

/** The statement for one page; one row more than a page tells whether another follows. */
export function pageSql(plan: PagePlan, page: number, maxRows: number): string {
  const window = `LIMIT ${maxRows + 1} OFFSET ${page * maxRows}`;
  const columns = Array.from({ length: plan.columnCount }, (_, i) => i + 1).join(", ");
  // The newline ends a trailing `--` comment before the tie breaker continues
  // the statement's own ORDER BY list.
  if (plan.kind === "ordered") return `${plan.base}\n, ${columns}\n${window}`;
  return `SELECT * FROM (\n${plan.base}\n) ORDER BY ${columns}\n${window}`;
}

/** The statement counting every row `base` (one SELECT/WITH) returns, or
 *  null for anything else. The newline ends a trailing `--` comment. */
export function countSql(base: string): string | null {
  const body = base.trim().replace(/;\s*$/, "").trim();
  const first = topLevelWords(body)[0];
  if (first !== "SELECT" && first !== "WITH") return null;
  return `SELECT COUNT(*) FROM (\n${body}\n)`;
}
