// Opening a stored script or function in the editor.
//
// A UDF's source lives in the database, not in a file: Exasol keeps the whole
// `CREATE … SCRIPT … AS …` statement, body and all, in its catalog. Clicking
// one in the tree should put that source in an editor tab, whatever language
// it is written in — which is also why it is worth wrapping for Run: a Java
// or Python body contains semicolons, and only the `--/ … /` form survives
// the statement splitter intact.

/** A SQL string literal: the only quoting these queries need. */
const lit = (v: string): string => `'${v.replace(/'/g, "''")}'`;

/** What the catalog calls the thing being opened. */
export type SourceKind = "script" | "function";

/** The query that returns one object's source text. */
export function sourceQuery(kind: SourceKind, schema: string, name: string): string {
  return kind === "function"
    ? `SELECT FUNCTION_TEXT FROM SYS.EXA_ALL_FUNCTIONS WHERE FUNCTION_SCHEMA = ${lit(schema)} AND FUNCTION_NAME = ${lit(name)}`
    : `SELECT SCRIPT_TEXT FROM SYS.EXA_ALL_SCRIPTS WHERE SCRIPT_SCHEMA = ${lit(schema)} AND SCRIPT_NAME = ${lit(name)}`;
}

/** Does this source already carry the script-block markers? */
export const isWrapped = (text: string): boolean => /^\s*--\//.test(text);

/**
 * The source as it should land in the editor.
 *
 * A script's body can hold semicolons, so it is wrapped in `--/ … /` — the
 * form that makes the whole thing one statement, so Run sends it whole
 * instead of shredding it at the first semicolon. Text that already carries
 * the markers is left exactly as it is, and a function needs no wrapper.
 */
export function openableSource(kind: SourceKind, text: string): string {
  const body = text.replace(/\s+$/, "");
  if (!body.trim()) return "";
  if (kind === "function" || isWrapped(body)) return `${body}\n`;
  return `--/\n${body}\n/\n`;
}

/** The editor tab's title for an opened object. */
export const sourceTitle = (schema: string, name: string): string => (schema ? `${schema}.${name}` : name);
