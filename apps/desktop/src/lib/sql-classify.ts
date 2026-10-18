// What a statement does, for the production-safety guards: whether it only
// reads (a read-only connection runs only those), and whether it is one of
// the statements that destroy data in one go (they are confirmed first).

import { splitStatements } from "./sql-text.ts";

export type Danger = "drop" | "truncate" | "delete-all" | "update-all";
export type Classified = { text: string; kind: "read" | "write"; danger?: Danger };

/** Statements that change nothing in the database (session settings,
 *  transaction control and metadata reads included). */
const READ_FIRST = new Set(["SELECT", "WITH", "VALUES", "DESCRIBE", "DESC", "SHOW", "EXPLAIN", "OPEN", "CLOSE", "COMMIT", "ROLLBACK", "FLUSH", "PROFILE"]);

/** Comments removed, string and quoted-identifier contents blanked. */
export function blind(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
    .trim();
}

/** Whether `word` appears outside any parentheses. */
function topLevel(blinded: string, word: string): boolean {
  let depth = 0;
  const re = new RegExp(`\\b${word}\\b`, "i");
  let chunk = "";
  for (const c of blinded) {
    if (c === "(") {
      if (depth === 0 && re.test(chunk)) return true;
      if (depth === 0) chunk = "";
      depth++;
    } else if (c === ")") {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0) {
      chunk += c;
    }
  }
  return re.test(chunk);
}

export function classifyStatement(text: string): Classified {
  const b = blind(text);
  const words = b.split(/[\s(]+/).filter(Boolean).map((w) => w.toUpperCase());
  const first = words[0] ?? "";
  const second = words[1] ?? "";
  // ALTER SESSION changes only this session; ALTER anything else writes.
  const sessionOnly = first === "ALTER" && second === "SESSION";
  // EXPLAIN describes a statement without running it, whatever it is.
  const read = first === "EXPLAIN" || ((READ_FIRST.has(first) || sessionOnly) && !/\bINTO\b/i.test(b));
  let danger: Danger | undefined;
  if (first === "DROP") danger = "drop";
  else if (first === "TRUNCATE") danger = "truncate";
  else if (first === "DELETE" && !topLevel(b, "WHERE")) danger = "delete-all";
  else if (first === "UPDATE" && !topLevel(b, "WHERE")) danger = "update-all";
  return { text: text.trim(), kind: read ? "read" : "write", ...(danger ? { danger } : {}) };
}

/** Every statement of a script, classified (empty ones skipped). */
export function classifyScript(sql: string, split = true): Classified[] {
  const parts = split ? splitStatements(sql).map((s) => s.text) : [sql];
  return parts.filter((t) => blind(t).length > 0).map(classifyStatement);
}

const DANGER_TEXT: Record<Danger, string> = {
  drop: "drops an object",
  truncate: "empties a table",
  "delete-all": "deletes every row (no WHERE)",
  "update-all": "updates every row (no WHERE)",
};

/** The question before running statements that destroy data, or null. */
export function dangerQuestion(stmts: readonly Classified[], where: string): string | null {
  const risky = stmts.filter((s) => s.danger);
  if (!risky.length) return null;
  const lines = risky.slice(0, 5).map((s) => `• ${s.text.replace(/\s+/g, " ").slice(0, 90)} — ${DANGER_TEXT[s.danger!]}`);
  const more = risky.length > 5 ? `\n…and ${risky.length - 5} more.` : "";
  return `Run on ${where}?\n\n${lines.join("\n")}${more}`;
}

/** Why a read-only connection refuses this script, or null when it only reads. */
export function readOnlyRefusal(stmts: readonly Classified[], name: string): string | null {
  const w = stmts.find((s) => s.kind === "write");
  return w ? `"${name}" is read-only. This changes data or objects: ${w.text.replace(/\s+/g, " ").slice(0, 90)}` : null;
}

/** The question before saving grid edits on a Prod connection. */
export function editsQuestion(count: number, where: string): string {
  return `Save ${count} change${count === 1 ? "" : "s"} to ${where}? This is a production database.`;
}
