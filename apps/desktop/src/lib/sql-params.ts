// Placeholders a script asks for before it runs: `&name` (exaplus style) and
// `:name`. Found only in SQL itself — never inside strings, quoted names,
// comments or a `--/ … /` script body (where `:` and `&` are code). Pure.

import { splitStatements } from "./sql-text.ts";

export type Param = { name: string; marker: "&" | ":" };

/** Positions of placeholders in the SQL outside literals and script bodies. */
function scan(sql: string): { start: number; end: number; param: Param }[] {
  const out: { start: number; end: number; param: Param }[] = [];
  const scripts = splitStatements(sql)
    .filter((s) => /^\s*--\//.test(sql.slice(s.start, s.end)))
    .map((s) => [s.start, s.end] as const);
  let i = 0;
  while (i < sql.length) {
    const inScript = scripts.find(([a, b]) => i >= a && i < b);
    if (inScript) {
      i = inScript[1];
      continue;
    }
    const c = sql[i];
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === c && sql[j + 1] !== c)) j += sql[j] === c ? 2 : 1;
      i = j + 1;
    } else if (sql.startsWith("--", i)) {
      const nl = sql.indexOf("\n", i);
      i = nl < 0 ? sql.length : nl;
    } else if (sql.startsWith("/*", i)) {
      const end = sql.indexOf("*/", i + 2);
      i = end < 0 ? sql.length : end + 2;
    } else if ((c === "&" || c === ":") && sql[i - 1] !== c && sql[i + 1] !== c && sql[i + 1] !== "=") {
      const m = /^[A-Za-z_][\w$]*/.exec(sql.slice(i + 1));
      // `a:b` glued to a word (a label, a time) is not a placeholder.
      if (m && !(c === ":" && /[\w$]/.test(sql[i - 1] ?? ""))) {
        out.push({ start: i, end: i + 1 + m[0].length, param: { name: m[0], marker: c } });
        i += 1 + m[0].length;
        continue;
      }
      i++;
    } else {
      i++;
    }
  }
  return out;
}

/** The placeholders, each once, in order of first use. */
export function findParams(sql: string): Param[] {
  const seen = new Set<string>();
  const out: Param[] = [];
  for (const { param } of scan(sql)) {
    const key = `${param.marker}${param.name.toUpperCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(param);
    }
  }
  return out;
}

/** A value as a SQL text literal. */
export function textLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** The SQL with every placeholder replaced (names match case-insensitively;
 *  a placeholder without a value is left as it is). */
export function substituteParams(sql: string, values: Record<string, string>): string {
  const byName = new Map(Object.entries(values).map(([k, v]) => [k.toUpperCase(), v]));
  let out = "";
  let last = 0;
  for (const { start, end, param } of scan(sql)) {
    const v = byName.get(`${param.marker}${param.name.toUpperCase()}`);
    if (v === undefined) continue;
    out += sql.slice(last, start) + v;
    last = end;
  }
  return out + sql.slice(last);
}

/** The key a value is stored under for a placeholder. */
export const paramKey = (p: Param) => `${p.marker}${p.name}`;
