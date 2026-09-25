// The hint that tells you which language you are about to write in.
//
// A `--/ … / ` block's body is Python, Lua, Java, R — whatever the CREATE
// header names. An empty body is just a blank line, which says nothing, so
// the editor draws a dim hint on it. The hint is not text in the buffer: it
// is a decoration, so it never has to be deleted and never ends up in the
// statement that runs.
//
// The language is read from the header the user actually typed, and its name
// is derived from that word — nothing here enumerates languages, so a
// database taught a new one is described correctly with no edit.

/** One `--/ … /` block found in the buffer. Offsets are into the buffer. */
export type UdfBlock = {
  /** The `--/` line's first character. */
  start: number;
  /** Just past the closing `/` line, or the buffer's end while still typing. */
  end: number;
  /** The language word as written in the header (`PYTHON3`), upper-cased. */
  language: string;
  /** First line of the body (1-based), or null when the header is unfinished. */
  bodyLine: number | null;
  /** Whether the body holds anything but whitespace. */
  bodyEmpty: boolean;
};

/** A dim hint to draw at the start of one line (1-based). */
export type BodyHint = { line: number; text: string };

/**
 * A language word turned into the name a person would write.
 *
 * Derived, not looked up: the trailing version digits are part of the alias
 * (`PYTHON3`) rather than the language's name, and a single letter is already
 * a name (`R`). So `LUA` → `Lua`, `PYTHON3` → `Python`, `JULIA` → `Julia`.
 */
export function languageLabel(word: string): string {
  const bare = word.trim().replace(/\d+$/, "");
  if (!bare) return word.trim().toUpperCase();
  if (bare.length === 1) return bare.toUpperCase();
  return bare[0].toUpperCase() + bare.slice(1).toLowerCase();
}

/** The hint's wording, e.g. `your Python code goes here`. */
export const hintFor = (word: string): string => `your ${languageLabel(word)} code goes here`;

/** Words that sit between CREATE and SCRIPT without naming a language. */
const NOT_A_LANGUAGE = new Set(["OR", "REPLACE", "SCALAR", "SET", "ADAPTER", "AGGREGATE"]);

/**
 * The language a CREATE … SCRIPT header names.
 *
 * Exasol's form is `CREATE [OR REPLACE] [<language>] [SCALAR|SET] SCRIPT …`,
 * and the language is optional — omitting it means Lua. So rather than match
 * a fixed shape, this takes the words between CREATE and SCRIPT and drops the
 * ones that are grammar; whatever is left is the language.
 */
export function headerLanguage(header: string): string {
  // A comment between CREATE and the language word would otherwise be read as
  // the language ("your Comment code goes here"), so comments go first.
  const plain = header.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
  const m = /\bCREATE\b([\s\S]*?)\bSCRIPT\b/i.exec(plain);
  if (!m) return "LUA";
  for (const word of m[1].split(/\s+/)) {
    const w = word.trim().toUpperCase();
    if (w && /^[A-Z_][A-Z0-9_]*$/.test(w) && !NOT_A_LANGUAGE.has(w)) return w;
  }
  return "LUA";
}

const OPENS = /^\s*--\/\s*$/;
const CLOSES = /^\s*\/\s*$/;
/** The header ends at the line whose last word is AS (trailing comment aside). */
const ENDS_HEADER = /\bAS\s*(?:--.*)?$/i;

/**
 * Every `--/ … /` block in the buffer, with where its body starts and whether
 * it is still empty. Unterminated blocks count: while a UDF is being typed
 * there is no closing `/` yet, and that is exactly when the hint is wanted.
 */
export function udfBlocks(text: string): UdfBlock[] {
  const lines = text.split("\n");
  // Buffer offset of the start of each line.
  const offsets: number[] = [];
  let at = 0;
  for (const line of lines) {
    offsets.push(at);
    at += line.length + 1;
  }

  const blocks: UdfBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!OPENS.test(lines[i])) continue;
    let headerEnd = -1;
    let close = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (CLOSES.test(lines[j])) { close = j; break; }
      if (headerEnd < 0 && ENDS_HEADER.test(lines[j])) headerEnd = j;
    }
    const last = close < 0 ? lines.length - 1 : close;
    const header = lines.slice(i + 1, (headerEnd < 0 ? last : headerEnd) + 1).join("\n");
    // `AS` on the line directly above the closing `/` leaves no body line at
    // all — a hint drawn there would land on the `/` that ends the block.
    const hasBody = headerEnd >= 0 && (close < 0 ? headerEnd + 1 < lines.length : headerEnd + 1 < close);
    const bodyFirst = hasBody ? headerEnd + 1 : -1;
    const bodyLines = bodyFirst < 0 ? [] : lines.slice(bodyFirst, close < 0 ? lines.length : close);
    blocks.push({
      start: offsets[i],
      end: close < 0 ? text.length : offsets[close] + lines[close].length,
      language: headerLanguage(header),
      bodyLine: bodyFirst < 0 || bodyFirst >= lines.length ? null : bodyFirst + 1,
      bodyEmpty: bodyLines.every((l) => l.trim() === ""),
    });
    i = last;
  }
  return blocks;
}

/** The dim hints to draw: one per block whose body is still empty. */
export function bodyHints(text: string): BodyHint[] {
  return udfBlocks(text)
    .filter((b) => b.bodyLine !== null && b.bodyEmpty)
    .map((b) => ({ line: b.bodyLine as number, text: hintFor(b.language) }));
}

/** The block containing a buffer offset, if any — what the cursor is inside. */
export function blockAt(text: string, offset: number): UdfBlock | null {
  return udfBlocks(text).find((b) => offset >= b.start && offset <= b.end) ?? null;
}
