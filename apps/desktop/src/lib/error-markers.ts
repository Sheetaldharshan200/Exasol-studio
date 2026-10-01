// Where a failed run's error belongs in the editor (execution menu → Show
// Error Position / Statement Markers). Exasol reports the place as
// "[line L, column C]" relative to the statement it ran.

import { splitStatements, stripSqlComments } from "./sql-text.ts";

export type ErrorMarker = { start: number; end: number; message: string };

export function errorPosition(error: string): { line: number; column: number } | null {
  const m = /\[line (\d+), column (\d+)\]/i.exec(error);
  return m ? { line: Number(m[1]), column: Number(m[2]) } : null;
}

/** The occurrence of `needle` in `text` closest to `near`, or -1. */
function closest(text: string, needle: string, near: number): number {
  let best = -1;
  for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + 1)) {
    if (best < 0 || Math.abs(i - near) < Math.abs(best - near)) best = i;
  }
  return best;
}

/** Where a run's statements are in the buffer. */
export type RunPlace = {
  /** The SQL the run sent, a slice of the buffer. */
  runText: string;
  /** Where `runText` starts in the buffer. */
  runStart: number;
  /** Whether the run split `runText` into statements. */
  split: boolean;
  /** Index of the failed statement among the run's results. */
  index: number;
  /** Comments were stripped before sending: `runText` is the unstripped
   *  buffer slice, and the server's line/column refer to the stripped text. */
  stripped?: boolean;
};

/** Where the failed statement is in the buffer: by its index in the run,
 *  else its occurrence nearest the run. `exact` says the buffer text is what
 *  the server saw, so its line/column apply. Null when it is not there. */
function locate(buffer: string, stmt: string, place: RunPlace): { at: number; length: number; exact: boolean } | null {
  const parts = place.split ? splitStatements(place.runText) : [{ text: place.runText.trim(), start: 0, end: place.runText.length }];
  const part = parts[place.index];
  const sent = part && (place.stripped ? stripSqlComments(part.text).trim() : part.text);
  if (part && sent === stmt) {
    const at = place.runStart + place.runText.indexOf(part.text, part.start);
    if (buffer.slice(at, at + part.text.length) === part.text) return { at, length: part.text.length, exact: part.text === stmt };
  }
  const at = closest(buffer, stmt, place.runStart);
  return at < 0 ? null : { at, length: stmt.length, exact: true };
}

/**
 * The buffer range to mark for a failed statement: the reported position (to
 * the end of the word there) when asked for and known, else the whole
 * statement when asked for, else nothing. Null when the statement is not in
 * the buffer as sent (comments stripped, buffer edited since).
 */
export function errorMarker(
  buffer: string,
  statement: string,
  error: string,
  opts: { position: boolean; statement: boolean; place: RunPlace },
): ErrorMarker | null {
  const stmt = statement.trim();
  if (!stmt || (!opts.position && !opts.statement)) return null;
  const found = locate(buffer, stmt, opts.place);
  if (!found) return null;
  const { at, length, exact } = found;
  const message = error.trim();
  const pos = opts.position && exact ? errorPosition(error) : null;
  if (pos) {
    const lines = stmt.split("\n");
    if (pos.line >= 1 && pos.line <= lines.length) {
      const lineStart = lines.slice(0, pos.line - 1).reduce((n, l) => n + l.length + 1, 0);
      const col = Math.min(Math.max(pos.column - 1, 0), lines[pos.line - 1].length);
      const start = at + lineStart + col;
      const word = /^[\w$."]+/.exec(buffer.slice(start));
      return { start, end: start + Math.max(word?.[0].length ?? 0, 1), message };
    }
  }
  // A stripped statement gets the statement marker: the reported column
  // refers to text the buffer no longer has in that shape.
  return opts.statement || !exact ? { start: at, end: at + length, message } : null;
}

/** Where the run's SQL starts in the buffer: the selection if one was run,
 *  else the whole buffer, else the statement at the cursor. */
export function runStartIn(buffer: string, runText: string, selectionStart: number | null, cursorOffset: number): number {
  if (selectionStart !== null && buffer.startsWith(runText, selectionStart)) return selectionStart;
  if (runText === buffer) return 0;
  const parts = splitStatements(buffer).filter((p) => p.text === runText.trim());
  const containing = parts.find((p) => cursorOffset >= p.start && cursorOffset <= p.end);
  const hit = containing ?? parts[0];
  return hit ? buffer.indexOf(hit.text, hit.start) : Math.max(0, closest(buffer, runText, cursorOffset));
}
