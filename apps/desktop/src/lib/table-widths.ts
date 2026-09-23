// Column widths for a table whose header and body are two separate tables.
//
// A results grid puts its column names outside the scrolling area, so the
// scrollbar starts at the first data row rather than running up beside the
// header. The price is that the two tables no longer size each other: they
// have to be told the same widths, and the width of a column is whichever of
// the two needs more room — the values or the column's own name.

/** The widths both tables should use, or null when they cannot be trusted:
 *  a mismatched count means one of the tables was not laid out the way we
 *  think (no rows yet, a full-width "no rows" cell), and a fixed layout built
 *  on that would misalign the header against the data. */
export function pairWidths(head: readonly number[], body: readonly number[]): number[] | null {
  if (head.length === 0 || head.length !== body.length) return null;
  if (head.some((w) => w <= 0) || body.some((w) => w <= 0)) return null;
  return head.map((w, i) => Math.max(w, body[i]));
}

/** What the two tables are set to, so neither can stretch away from the other. */
export const totalWidth = (widths: readonly number[]): number => widths.reduce((a, b) => a + b, 0);

/** How much width a classic (non-overlay) scrollbar takes from a scroll box.
 *  Zero on macOS-style overlay scrollbars. The header sits in its own box
 *  without a scrollbar, so it has to give back exactly this much or the two
 *  drift apart as soon as the grid is scrolled sideways. */
export function scrollbarGutter(offsetWidth: number, clientWidth: number): number {
  return Math.max(0, offsetWidth - clientWidth);
}
