// Whether a statement only reads: the agent's approval gate (tools.ts) and
// the read-only guard of a connection (db.ts) share this one rule.

const READ_KEYWORDS = new Set(["SELECT", "WITH", "SHOW", "DESC", "DESCRIBE", "VALUES", "EXPLAIN"]);

/**
 * Classify a statement: reads auto-run, everything else needs approval.
 *
 * Fail-closed by construction — the only acceptable failure mode is an
 * unnecessary approval prompt, never an unapproved mutation. Beyond the
 * first-keyword whitelist, two bypasses are explicitly closed (both found in
 * review): `SELECT … INTO TABLE t` is Exasol's CTAS variant and mutates state,
 * and `SELECT 1; DROP TABLE t` is a batch whose first token lies about the
 * rest. String literals and quoted identifiers are blinded first so their
 * CONTENTS can neither fake nor hide a keyword or semicolon; an unterminated
 * literal is left visible, which errs toward "write".
 */
export function classifySql(sql: string): "read" | "write" {
  const blinded = sql
    .replace(/--[^\n]*\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
    .trim();
  const first = blinded.split(/[\s(]+/)[0]?.toUpperCase();
  if (!READ_KEYWORDS.has(first ?? "")) return "write";
  // A second statement after a semicolon makes the whole batch a write.
  const semi = blinded.indexOf(";");
  if (semi !== -1 && blinded.slice(semi + 1).trim() !== "") return "write";
  // SELECT … INTO TABLE creates a table. INTO cannot appear unquoted in a
  // legitimate read (it is reserved), so its presence anywhere outside
  // strings/identifiers means this is not a plain read.
  if (/\bINTO\b/i.test(blinded)) return "write";
  return "read";
}
