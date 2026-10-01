// Where a failed run's error belongs in the editor (execution menu → Show
// Error Position / Statement Markers). Exasol reports the place as
// "[line L, column C]" relative to the statement it ran.

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
  opts: { position: boolean; statement: boolean; near?: number },
): ErrorMarker | null {
  const stmt = statement.trim();
  if (!stmt || (!opts.position && !opts.statement)) return null;
  const at = closest(buffer, stmt, opts.near ?? 0);
  if (at < 0) return null;
  const message = error.trim();
  const pos = opts.position ? errorPosition(error) : null;
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
  return opts.statement ? { start: at, end: at + stmt.length, message } : null;
}
