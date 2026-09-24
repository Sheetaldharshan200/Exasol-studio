// The dim grey text the model suggests ahead of the cursor.
//
// A model asked to "continue this SQL" will happily hand back a fenced block,
// a re-typed copy of the line you are on, an explanation, or the rest of a
// statement you already wrote below. Any of those, inserted verbatim, is
// worse than no suggestion — so the model's answer is never shown as it
// arrives: it is cut down to the part that actually belongs at the cursor,
// and dropped entirely when nothing does.
//
// All of that is decided here, away from the editor, because it is where the
// bugs live and it is the part worth testing.

/** What the model is shown: the text before the cursor and the text after. */
export type CompletionWindow = { prefix: string; suffix: string };

/** How much of the buffer to send. Enough for real context, small enough to
 *  stay fast and cheap on every keystroke pause. */
const PREFIX_CHARS = 4000;
const SUFFIX_CHARS = 1000;
/** A suggestion longer than this is a wall of text, not a completion. */
const MAX_LINES = 12;

/** The window around the cursor, clipped to whole characters from the ends. */
export function completionWindow(text: string, offset: number, prefixChars = PREFIX_CHARS, suffixChars = SUFFIX_CHARS): CompletionWindow {
  const at = Math.max(0, Math.min(offset, text.length));
  return {
    prefix: text.slice(Math.max(0, at - prefixChars), at),
    suffix: text.slice(at, at + suffixChars),
  };
}

/** Whether the cursor sits inside an unclosed single-quoted string. */
function inString(prefix: string): boolean {
  let open = false;
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] !== "'") continue;
    if (open && prefix[i + 1] === "'") { i++; continue; }
    open = !open;
  }
  return open;
}

/**
 * Whether asking the model is worth it at all.
 *
 * Suggesting into an empty buffer, into the middle of a word, or inside a
 * string literal produces noise, and every call costs a round trip — so these
 * are refused before the request is made rather than filtered after.
 */
export function shouldSuggest(prefix: string, suffix: string): boolean {
  if (prefix.trim().length < 3) return false;
  if (inString(prefix)) return false;
  // Text immediately after the cursor on the same line means the cursor is
  // inside something already written; ghost text there overlaps it.
  const rest = suffix.slice(0, suffix.indexOf("\n") === -1 ? suffix.length : suffix.indexOf("\n"));
  if (rest.trim() !== "") return false;
  return true;
}

/**
 * A key that changes only when the suggestion would.
 *
 * Trailing spaces on the current line are typing noise, not new context. The
 * suffix belongs in the key as well: the same text before the cursor with
 * different text after it needs a different answer, or a cached suggestion is
 * replayed where it duplicates what already follows.
 */
export const completionKey = (prefix: string, suffix: string): string =>
  `${prefix.slice(-400).replace(/[ \t]+$/, "")}\u0000${suffix.slice(0, 200)}`;

const FENCE = /^\s*```[\w-]*\s*\n?([\s\S]*?)\n?\s*```\s*$/;

/**
 * The model's answer reduced to what belongs at the cursor, or "".
 *
 * The cuts, in order: unwrap a code fence; drop a re-typed copy of the line
 * the cursor is on; stop where the text starts repeating what already follows
 * the cursor; cap the length.
 */
export function cleanCompletion(raw: string, prefix: string, suffix: string): string {
  let text = raw.replace(/\r\n?/g, "\n");
  const fenced = FENCE.exec(text);
  if (fenced) text = fenced[1];
  // A model that opens a fence but never closes it still means the code.
  else text = text.replace(/^\s*```[\w-]*\s*\n/, "");
  if (!text.trim()) return "";

  // The model often restates the line you are on before continuing it.
  const line = prefix.slice(prefix.lastIndexOf("\n") + 1);
  const typed = line.trimStart();
  if (typed) {
    const head = text.trimStart();
    if (head.toLowerCase().startsWith(typed.toLowerCase())) text = head.slice(typed.length);
  } else {
    // At the start of a line, a leading newline just adds a blank one.
    text = text.replace(/^\n+/, "");
  }
  if (!text.trim()) return "";

  // Stop before re-typing what already follows the cursor — matched a whole
  // line at a time. A substring match cut inside string literals
  // (`WHERE note = 'ORDER BY id'` truncated at the quote), and a match at the
  // very start means the whole suggestion is already below the cursor, which
  // is a duplicate rather than a suggestion.
  const ahead = suffix.replace(/^\n+/, "").split("\n")[0]?.trim() ?? "";
  if (ahead.length >= 4) {
    const lines = text.split("\n");
    const hit = lines.findIndex((l) => l.trim() === ahead);
    if (hit >= 0) text = lines.slice(0, hit).join("\n");
  }

  const lines = text.split("\n");
  if (lines.length > MAX_LINES) text = lines.slice(0, MAX_LINES).join("\n");
  text = text.replace(/\s+$/, "");
  // A suggestion of nothing but punctuation is not worth a grey line.
  return /[\w)]/.test(text) ? text : "";
}

/** The instruction the model is given. Kept here so it is reviewable and so
 *  the tests can assert what context actually reaches it. */
export function completionPrompt(win: CompletionWindow, context: { language?: string; schema?: string }): string {
  const parts: string[] = [];
  if (context.schema) parts.push(`Schema (schema.table.column type):\n${context.schema}`);
  if (context.language) parts.push(`The cursor is inside a ${context.language} UDF body, so continue in ${context.language}, not SQL.`);
  parts.push(`<before>\n${win.prefix}\n</before>`);
  parts.push(`<after>\n${win.suffix}\n</after>`);
  return parts.join("\n\n");
}

export const COMPLETION_SYSTEM =
  "You complete code at a cursor in an Exasol SQL editor. Reply with ONLY the text that goes at the cursor — no prose, no markdown fences, and never repeat the text already before or after the cursor. Exasol folds unquoted identifiers to UPPERCASE and uses LIMIT n (never FETCH FIRST or TOP). Use only schemas, tables and columns given to you. Keep it to the current statement; stop at its end. If nothing useful can be added, reply with nothing at all.";
