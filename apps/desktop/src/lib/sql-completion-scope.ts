// What completion needs to know about the statement under the caret, kept
// pure: which statement it is, which tables it names (with aliases, quoted
// mixed-case names and comma joins), and how a catalog name must be written
// to mean that object (Exasol folds unquoted names to upper case).

import { splitStatements } from "./sql-text.ts";

const RESERVED = new Set([
  "SELECT", "FROM", "WHERE", "GROUP", "ORDER", "BY", "HAVING", "JOIN", "ON", "AS", "AND", "OR", "NOT", "NULL", "TABLE", "VIEW",
  "INSERT", "UPDATE", "DELETE", "MERGE", "INTO", "VALUES", "SET", "CREATE", "DROP", "ALTER", "USER", "ROLE", "SCHEMA", "LIMIT",
  "UNION", "ALL", "DISTINCT", "CASE", "WHEN", "THEN", "ELSE", "END", "IN", "IS", "LIKE", "BETWEEN", "WITH", "DATE", "TIME", "TIMESTAMP",
  "LEFT", "RIGHT", "INNER", "OUTER", "FULL", "CROSS", "NATURAL", "USING", "DEFAULT", "LEVEL", "POSITION", "VALUE", "OPEN", "CLOSE",
]);

/** A catalog name as it must be written: bare when Exasol would fold it to
 *  itself, otherwise in double quotes (mixed case, odd characters, keywords). */
export function sqlName(name: string): string {
  return /^[A-Z_][A-Z0-9_$]*$/.test(name) && !RESERVED.has(name) ? name : `"${name.replace(/"/g, '""')}"`;
}

/** A written identifier as the catalog spells it: quoted keeps its case,
 *  unquoted folds to upper case. */
export function catalogName(written: string): string {
  return written.startsWith('"') ? written.slice(1, -1).replace(/""/g, '"') : written.toUpperCase();
}

/** The statement the caret is in, from the text before it: a `;` in a
 *  string or comment does not end it, a real one does. */
export function currentStatement(before: string): string {
  const parts = splitStatements(before);
  const last = parts[parts.length - 1];
  if (!last) return "";
  // Nothing after the last statement's own end: the caret starts a new one.
  // The splitter's end is the real terminating ";" (one in a string or a
  // comment is not), or the end of the text.
  return before[last.end] === ";" ? "" : before.slice(last.start).trimStart();
}

const IDENT = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][\w$]*)`;
const STOP = /^(WHERE|ON|USING|SET|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|NATURAL|JOIN|GROUP|ORDER|HAVING|LIMIT|UNION|MINUS|EXCEPT|INTERSECT|VALUES|SELECT|WINDOW|QUALIFY|CONNECT|START|PREFERRING)$/i;

export type TableRef = { schema: string; table: string };

/** Tables a statement names (FROM, JOIN, INTO, UPDATE; a FROM list split on
 *  commas), keyed by table name and by alias, in catalog spelling. */
export function tableRefs(stmt: string): Map<string, TableRef> {
  const refs = new Map<string, TableRef>();
  const one = new RegExp(String.raw`^\s*(${IDENT})(?:\s*\.\s*(${IDENT}))?(?:\s+(?:AS\s+)?(${IDENT}))?`, "i");
  const head = /\b(FROM|JOIN|INTO|UPDATE)\b/gi;
  let h: RegExpExecArray | null;
  while ((h = head.exec(stmt))) {
    let rest = stmt.slice(h.index + h[0].length);
    for (;;) {
      const m = one.exec(rest);
      if (!m || m[1].startsWith("(")) break;
      const [first, second, alias] = [m[1], m[2], m[3]];
      if (STOP.test(first)) break;
      const schema = second ? catalogName(first) : "";
      const table = catalogName(second ?? first);
      refs.set(table, { schema, table });
      if (alias && !STOP.test(alias)) refs.set(catalogName(alias), { schema, table });
      rest = rest.slice(m[0].length);
      // Only a FROM list continues with commas (a comma join).
      if (h[1].toUpperCase() !== "FROM" || !/^\s*,/.test(rest)) break;
      rest = rest.replace(/^\s*,/, "");
    }
  }
  return refs;
}

/** `<name>.` right before the word being typed: the qualifier, in catalog
 *  spelling, or null. */
export function qualifierBefore(textBeforeWord: string): string | null {
  const m = new RegExp(String.raw`(${IDENT})\s*\.$`).exec(textBeforeWord);
  return m ? catalogName(m[1]) : null;
}
