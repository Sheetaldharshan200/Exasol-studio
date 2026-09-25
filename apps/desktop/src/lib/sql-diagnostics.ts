// The problems the editor can be certain about.
//
// A red underline is a promise: it says "this is wrong". So this reports only
// things that cannot be right in any dialect — a string that is never closed,
// a comment that runs to the end of the buffer, a script block with no
// terminator, a bracket left open. It does not guess at semantics, and it
// never underlines something the database would happily run; crying wolf
// teaches people to ignore the marks, which is worse than having none.
//
// Everything the database alone can judge — an unknown table, a type
// mismatch — is left to the database, which says so when the statement runs.

export type Problem = {
  /** Character offsets into the buffer. */
  start: number;
  end: number;
  message: string;
};

/** What was left open. Named rather than spelled with the characters
 *  themselves: an object key of the comment-opening sequence, and a message
 *  carrying the closing one, are exactly the shapes that can corrupt a
 *  generated bundle. */
type Kind = "string" | "name" | "comment" | "script" | "bracket";
type Open = { offset: number; kind: Kind };

const MESSAGES: Record<Kind, string> = {
  string: "This string is never closed — add the closing quote.",
  name: "This quoted name is never closed — add the closing double quote.",
  comment: "This block comment is never closed — add the closing delimiter.",
  script: "This script block is never closed — add a line holding only a slash.",
  bracket: "This bracket is never closed — add the closing bracket.",
};

/** How many characters of the opener to underline. */
const WIDTH: Record<Kind, number> = { string: 1, name: 1, comment: 2, script: 3, bracket: 1 };

/**
 * Scan a buffer for unterminated constructs.
 *
 * The scan mirrors the statement splitter's discipline: quotes, line comments
 * and block comments each swallow what follows them, so a `(` inside a string
 * is text and a quote inside a comment is not a string. Anything still open
 * when the buffer ends is a problem, and it is reported where it opened,
 * because that is where the fix goes.
 */
/** Whether only blanks separate an offset from the start of its line. */
function onlySpaceBefore(sql: string, at: number): boolean {
  for (let k = at - 1; k >= 0; k--) {
    if (sql[k] === "\n") return true;
    if (sql[k] !== " " && sql[k] !== "\t") return false;
  }
  return true;
}

export function findProblems(sql: string): Problem[] {
  const stack: Open[] = [];
  // Brackets still open when a statement ends can never be closed, so they
  // are problems in their own right rather than something to forget.
  const closedOut: Open[] = [];
  let inLine = false;
  let inBlock = false;
  let inSingle: Open | null = null;
  let inDouble: Open | null = null;
  let block: Open | null = null;
  let script: Open | null = null;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const n = sql[i + 1];
    if (inLine) {
      if (c === "\n") inLine = false;
      continue;
    }
    if (inBlock) {
      if (c === "*" && n === "/") {
        inBlock = false;
        block = null;
        i++;
      }
      continue;
    }
    if (inSingle) {
      // Two quotes in a row are an escaped quote, not the end of the string.
      if (c === "'" && n === "'") i++;
      else if (c === "'") inSingle = null;
      continue;
    }
    if (inDouble) {
      if (c === '"' && n === '"') i++;
      else if (c === '"') inDouble = null;
      continue;
    }
    if (c === "'") inSingle = { offset: i, kind: "string" };
    else if (c === '"') inDouble = { offset: i, kind: "name" };
    else if (c === "/" && n === "*") {
      inBlock = true;
      block = { offset: i, kind: "comment" };
      i++;
    } else if (c === "-" && n === "-") {
      // `--/` first on its line opens a script block; every other `--` is a
      // comment to end of line. First on its line, not in column 0: the
      // statement splitter (lib/sql-text.ts) trims the line before looking,
      // so an INDENTED `--/` is a block there and must be one here too —
      // otherwise the brackets in an indented UDF body are tracked as SQL and
      // reported as never closed.
      if (onlySpaceBefore(sql, i) && sql[i + 2] === "/" && !script) script = { offset: i, kind: "script" };
      inLine = true;
    } else if (script && c === "/" && onlySpaceBefore(sql, i) && /^\s*$/.test(sql.slice(i + 1).split("\n")[0] ?? "")) {
      script = null;
    } else if (!script) {
      // Brackets are only tracked outside a script block: a UDF body is
      // another language, where our bracket rules do not apply.
      if (c === "(") stack.push({ offset: i, kind: "bracket" });
      else if (c === ")") stack.pop();
      else if (c === ";") {
        closedOut.push(...stack);
        stack.length = 0; // the next statement starts clean
      }
    }
  }

  const open = [inSingle, inDouble, block, script, ...closedOut, ...stack].filter((o): o is Open => o !== null);
  return open
    .sort((a, b) => a.offset - b.offset)
    .map((o) => ({
      start: o.offset,
      end: Math.min(sql.length, o.offset + WIDTH[o.kind]),
      message: MESSAGES[o.kind],
    }));
}
